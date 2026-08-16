import { BadRequestException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuditActor } from '@nexuvi/api-contracts';

import { checkPasswordPolicy, hashPassword } from './credentials';
import { AuditService } from '../audit/audit.service';
import { identityStore, type StaffUser } from '../../infrastructure/persistence/identity-store';
import { findTenant } from '../../infrastructure/persistence/tenants';

/** What an invitee is shown before they accept. */
export interface InvitePreview {
  readonly clinicName: string;
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly string[];
  readonly invitedByName: string;
  readonly expiresAt: string;
}

/**
 * Invitations: how a real person becomes a user of a clinic.
 *
 * This is the bootstrap that makes provisioning complete. A tenant created by the platform
 * has no users, and no one can sign in to create the first one — so provisioning issues an
 * invitation, and accepting it is what turns a new tenant into a working clinic.
 *
 * ## The token is a credential
 *
 * Whoever holds an unaccepted invite token becomes an administrator of that clinic. It is
 * therefore high-entropy, hashed at rest, single-use, and short-lived. The plaintext exists
 * only in the message that was sent — the system cannot show it again, and that is correct
 * rather than an inconvenience.
 */
@Injectable()
export class InviteService {
  constructor(private readonly audit: AuditService) {}

  /**
   * Issue an invitation.
   *
   * Returns the plaintext token once, for delivery. Nothing stores it.
   */
  invite(input: {
    tenantId: string;
    email: string;
    displayName: string;
    roles: readonly string[];
    facilityIds?: readonly string[];
    invitedByName: string;
  }): { token: string; expiresAt: string } {
    const email = input.email.trim().toLowerCase();

    if (identityStore.findUser(input.tenantId, email)) {
      throw new BadRequestException('Someone with that email already has an account here.');
    }

    const { invite, token } = identityStore.createInvite({
      id: `inv_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      tenantId: input.tenantId,
      email,
      displayName: input.displayName.trim(),
      roles: [...input.roles],
      invitedByName: input.invitedByName,
    });

    return { token, expiresAt: invite.expiresAt };
  }

  /**
   * What the invitee sees before committing.
   *
   * Names the clinic and the role deliberately: accepting an invitation is agreeing to
   * hold clinical access at a named organisation, and a screen that says only "set your
   * password" gives someone no way to notice they were sent the wrong link.
   */
  preview(token: string): InvitePreview {
    const invite = this.requireOpenInvite(token);
    const tenant = findTenant(invite.tenantId);

    return {
      clinicName: tenant?.legalName ?? 'Your clinic',
      email: invite.email,
      displayName: invite.displayName,
      roles: invite.roles,
      invitedByName: invite.invitedByName,
      expiresAt: invite.expiresAt,
    };
  }

  /**
   * Accept an invitation: create the user, consume the token.
   *
   * The email comes from the **invitation**, never from the request. Letting the accepting
   * party choose their own address would turn an invitation addressed to one person into
   * an account for anyone who intercepted the link.
   */
  async accept(token: string, password: string): Promise<StaffUser> {
    const invite = this.requireOpenInvite(token);

    const policy = checkPasswordPolicy(password, invite.email);
    if (!policy.ok) {
      throw new BadRequestException(policy.problems.join(' '));
    }

    // Consumed before the user is created. If creation then fails, the invitation is spent
    // and must be reissued — which is the safe direction: a token that survives a partial
    // failure is a token that can be replayed.
    if (!identityStore.markInviteAccepted(invite.id)) {
      throw new GoneException('This invitation has already been used.');
    }

    const user = identityStore.createUser({
      id: `usr_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      tenantId: invite.tenantId,
      email: invite.email,
      displayName: invite.displayName,
      passwordHash: await hashPassword(password),
      roles: invite.roles,
      facilityIds: [],
      status: 'active',
      createdAt: new Date().toISOString(),
    });

    const actor: AuditActor = {
      userId: user.id,
      displayName: user.displayName,
      role: user.roles[0] ?? 'unknown',
    };

    this.audit.append({
      tenantId: invite.tenantId,
      action: 'user.joined',
      actor,
      subject: { type: 'user', id: user.id, reference: user.email },
      facilityId: '',
      changes: [
        { field: 'roles', from: null, to: user.roles.join(', ') },
        { field: 'invitedBy', from: null, to: invite.invitedByName },
      ],
      source: 'ui',
    });

    return user;
  }

  // ---------------------------------------------------------------------------

  private requireOpenInvite(token: string) {
    const invite = token ? identityStore.findInviteByToken(token) : undefined;

    // Same answer for "no such token" and "wrong token": an invitation lookup that
    // distinguishes them is an oracle for guessing valid tokens.
    if (!invite) {
      throw new NotFoundException('This invitation link is not valid.');
    }
    if (invite.acceptedAt) {
      throw new GoneException('This invitation has already been used.');
    }
    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      throw new GoneException('This invitation has expired. Ask your clinic to send another.');
    }

    return invite;
  }
}
