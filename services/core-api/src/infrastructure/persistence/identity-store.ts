/**
 * Staff users and invitations.
 *
 * Separate from `patient-store` on purpose: staff and patients are different identity
 * domains (see `request-context`), and a single table holding both is how a patient login
 * eventually acquires a membership.
 *
 * **Invitation tokens are stored hashed, never raw.** An invite token is a bearer
 * credential — whoever holds it becomes an administrator of a clinic. A database dump
 * containing raw invite tokens is a database dump containing usable credentials, so the
 * store holds a SHA-256 digest and the plaintext exists only in the email that was sent.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { persist, persistArray } from './snapshot';

export interface StaffUser {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly displayName: string;
  /** `scrypt$…`. Absent when the user authenticates through a federated identity provider. */
  readonly passwordHash?: string;
  readonly roles: readonly string[];
  /** Empty means organisation-wide. */
  readonly facilityIds: readonly string[];
  readonly status: 'active' | 'suspended';
  readonly createdAt: string;
}

export interface TenantInvite {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly string[];
  /** SHA-256 of the token. The token itself is never persisted. */
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly invitedByName: string;
  acceptedAt?: string;
}

const USERS: StaffUser[] = [];
const INVITES: TenantInvite[] = [];

persistArray('staffUsers', USERS);
persistArray('tenantInvites', INVITES);

/** Invitations are short-lived: a link that grants clinic administration should not sit in an inbox for a month. */
export const INVITE_TTL_DAYS = 7;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

/**
 * Constant-time comparison of two token digests.
 *
 * The digests are not secret, but the comparison still runs in constant time — a lookup
 * that short-circuits on the first differing byte turns "is this token valid" into an
 * oracle that can be walked one character at a time.
 */
function digestsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const identityStore = {
  // --- users ---------------------------------------------------------------

  /**
   * Find a staff user by email within one tenant.
   *
   * Tenant-scoped, because the same person may legitimately work at two customers and
   * those are two separate accounts with separate credentials.
   */
  findUser(tenantId: string, email: string): StaffUser | undefined {
    const needle = email.trim().toLowerCase();
    return USERS.find((u) => u.tenantId === tenantId && u.email.toLowerCase() === needle);
  },

  findUserById(tenantId: string, userId: string): StaffUser | undefined {
    return USERS.find((u) => u.tenantId === tenantId && u.id === userId);
  },

  createUser(user: StaffUser): StaffUser {
    if (this.findUser(user.tenantId, user.email)) {
      throw new Error(`A user with that email already exists in this tenant.`);
    }
    const frozen = Object.freeze({ ...user });
    USERS.push(frozen);
    persist();
    return frozen;
  },

  listUsers(tenantId: string): readonly StaffUser[] {
    return USERS.filter((u) => u.tenantId === tenantId);
  },

  countUsers(tenantId: string): number {
    return USERS.filter((u) => u.tenantId === tenantId).length;
  },

  // --- invitations ---------------------------------------------------------

  /** Creates an invitation and returns the plaintext token exactly once. */
  createInvite(input: Omit<TenantInvite, 'tokenHash' | 'expiresAt'>): {
    invite: TenantInvite;
    token: string;
  } {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString();

    const invite: TenantInvite = { ...input, tokenHash: hashToken(token), expiresAt };
    INVITES.push(invite);
    persist();

    return { invite, token };
  },

  /**
   * Look an invitation up by its token.
   *
   * Deliberately **not** tenant-scoped: the whole point of an invitation is that the
   * recipient does not have a session yet, so the token itself is the only thing that
   * identifies which clinic they are joining. That is why it is high-entropy, hashed at
   * rest, single-use, and short-lived.
   */
  findInviteByToken(token: string): TenantInvite | undefined {
    const digest = hashToken(token);
    return INVITES.find((i) => digestsMatch(i.tokenHash, digest));
  },

  /** Marks an invitation used. Returns false if it was already accepted. */
  markInviteAccepted(inviteId: string): boolean {
    const invite = INVITES.find((i) => i.id === inviteId);
    if (!invite || invite.acceptedAt) return false;
    invite.acceptedAt = new Date().toISOString();
    persist();
    return true;
  },

  listInvites(tenantId: string): readonly TenantInvite[] {
    return INVITES.filter((i) => i.tenantId === tenantId);
  },
};
