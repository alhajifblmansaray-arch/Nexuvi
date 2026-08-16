import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { BadRequestException, GoneException, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { InviteService } from './invite.service';
import { AuthenticationService } from './authentication.service';
import { AuditService } from '../audit/audit.service';
import { identityStore } from '../../infrastructure/persistence/identity-store';
import { FREETOWN_GROUP, MAKENI_TRUST } from '../../infrastructure/persistence/tenants';

const PASSWORD = 'a-perfectly-fine-passphrase';

let audit: AuditService;
let invites: InviteService;
let auth: AuthenticationService;

/** Unique per call — the store is shared across the suite. */
let n = 0;
function newEmail(): string {
  n += 1;
  return `invitee-${n}-${Math.random().toString(36).slice(2, 8)}@clinic.sl`;
}

function inviteAdmin(tenantId = FREETOWN_GROUP, email = newEmail()) {
  const { token } = invites.invite({
    tenantId,
    email,
    displayName: 'Test Admin',
    roles: ['administrator'],
    invitedByName: 'Nexuvi Onboarding',
  });
  return { token, email };
}

beforeEach(() => {
  audit = new AuditService();
  invites = new InviteService(audit);
  auth = new AuthenticationService();
});

describe('invitations', () => {
  describe('the token', () => {
    it('is never stored in plaintext', () => {
      const { token, email } = inviteAdmin();
      const stored = identityStore.listInvites(FREETOWN_GROUP).find((i) => i.email === email);

      // A database dump containing raw invite tokens is a dump containing usable
      // credentials — whoever holds one becomes an administrator of that clinic.
      assert.ok(stored);
      assert.notEqual(stored.tokenHash, token);
      assert.ok(!JSON.stringify(stored).includes(token));
    });

    it('is high entropy', () => {
      const { token } = inviteAdmin();
      assert.ok(token.length >= 40, 'a guessable invitation is an open door to a clinic');
    });

    it('gives the same answer for an unknown and a wrong token', () => {
      // Distinguishing them turns the lookup into an oracle for guessing valid tokens.
      const unknown = message(() => invites.preview('a'.repeat(43)));
      const nonsense = message(() => invites.preview('definitely-not-a-real-token-value-here'));
      assert.equal(unknown, nonsense);
    });

    it('rejects an empty token', () => {
      assert.throws(() => invites.preview(''), NotFoundException);
    });
  });

  describe('preview', () => {
    it('names the clinic and the role before anyone commits', () => {
      // Accepting is agreeing to hold clinical access at a named organisation. A screen
      // that says only "set your password" gives nobody a chance to notice a wrong link.
      const { token } = inviteAdmin();
      const preview = invites.preview(token);

      assert.ok(preview.clinicName.length > 0);
      assert.deepEqual([...preview.roles], ['administrator']);
      assert.equal(preview.invitedByName, 'Nexuvi Onboarding');
    });
  });

  describe('accept', () => {
    it('creates the user and lets them sign in', async () => {
      const { token, email } = inviteAdmin();
      const user = await invites.accept(token, PASSWORD);

      assert.equal(user.email, email);
      assert.deepEqual([...user.roles], ['administrator']);

      const signedIn = await auth.signIn(FREETOWN_GROUP, email, PASSWORD);
      assert.equal(signedIn.id, user.id);
    });

    it('takes the email from the invitation, not the request', async () => {
      // Otherwise an invitation addressed to one person becomes an account for whoever
      // intercepted the link.
      const { token, email } = inviteAdmin();
      const user = await invites.accept(token, PASSWORD);
      assert.equal(user.email, email);
    });

    it('is single use', async () => {
      const { token } = inviteAdmin();
      await invites.accept(token, PASSWORD);

      await assert.rejects(() => invites.accept(token, PASSWORD), GoneException);
    });

    it('enforces the password policy', async () => {
      const { token } = inviteAdmin();
      await assert.rejects(() => invites.accept(token, 'short'), BadRequestException);

      // And the invitation survives a rejected password — it was never consumed.
      assert.doesNotThrow(() => invites.preview(token));
    });

    it('records who joined and on whose invitation', async () => {
      const { token } = inviteAdmin();
      const user = await invites.accept(token, PASSWORD);

      const [entry] = audit.find(FREETOWN_GROUP).items;
      assert.equal(entry?.action, 'user.joined');
      assert.equal(entry?.subject.id, user.id);
      assert.match(entry?.changes.map((c) => c.to).join(' ') ?? '', /Nexuvi Onboarding/);
    });

    it('never stores the password', async () => {
      const { token } = inviteAdmin();
      const user = await invites.accept(token, PASSWORD);

      assert.ok(user.passwordHash);
      assert.ok(!user.passwordHash.includes(PASSWORD));
    });
  });
});

describe('sign-in', () => {
  it('rejects a wrong password', async () => {
    const { token, email } = inviteAdmin();
    await invites.accept(token, PASSWORD);

    await assert.rejects(
      () => auth.signIn(FREETOWN_GROUP, email, 'not-the-password'),
      UnauthorizedException,
    );
  });

  it('gives the same message for an unknown email and a wrong password', async () => {
    // Different messages turn a sign-in form into a list of everyone who works at a clinic.
    const { token, email } = inviteAdmin();
    await invites.accept(token, PASSWORD);

    const wrongPassword = await messageAsync(() =>
      auth.signIn(FREETOWN_GROUP, email, 'wrong'),
    );
    const unknownUser = await messageAsync(() =>
      auth.signIn(FREETOWN_GROUP, 'nobody@nowhere.sl', 'wrong'),
    );

    assert.equal(wrongPassword, unknownUser);
  });

  it('is tenant-scoped: the right password at the wrong clinic fails', async () => {
    const { token, email } = inviteAdmin(FREETOWN_GROUP);
    await invites.accept(token, PASSWORD);

    await assert.rejects(
      () => auth.signIn(MAKENI_TRUST, email, PASSWORD),
      UnauthorizedException,
    );
  });

  it('locks out after repeated failures', async () => {
    const { token, email } = inviteAdmin();
    await invites.accept(token, PASSWORD);

    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(() => auth.signIn(FREETOWN_GROUP, email, 'wrong'));
    }

    // Even the correct password is refused while locked — that is the point.
    const locked = await messageAsync(() => auth.signIn(FREETOWN_GROUP, email, PASSWORD));
    assert.match(locked, /Too many failed attempts/);
  });

  it('clears the failure count on a successful sign-in', async () => {
    const { token, email } = inviteAdmin();
    await invites.accept(token, PASSWORD);

    await assert.rejects(() => auth.signIn(FREETOWN_GROUP, email, 'wrong'));
    await auth.signIn(FREETOWN_GROUP, email, PASSWORD);

    // Four more failures must not trip the lockout, because the counter reset.
    for (let i = 0; i < 4; i += 1) {
      const failure = await messageAsync(() => auth.signIn(FREETOWN_GROUP, email, 'wrong'));
      assert.ok(!failure.includes('Too many'), `tripped early on attempt ${i + 1}`);
    }
  });

  it('locks per tenant, so one clinic cannot lock a person out of another', async () => {
    // The same person may work at two customers. An attacker hammering one account must
    // not cost them their other job.
    const email = newEmail();
    const a = invites.invite({
      tenantId: FREETOWN_GROUP, email, displayName: 'Dual', roles: ['nurse'], invitedByName: 'X',
    });
    const b = invites.invite({
      tenantId: MAKENI_TRUST, email, displayName: 'Dual', roles: ['nurse'], invitedByName: 'X',
    });
    await invites.accept(a.token, PASSWORD);
    await invites.accept(b.token, PASSWORD);

    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(() => auth.signIn(FREETOWN_GROUP, email, 'wrong'));
    }

    // Locked at Freetown, still fine at Makeni.
    await assert.rejects(() => auth.signIn(FREETOWN_GROUP, email, PASSWORD));
    const other = await auth.signIn(MAKENI_TRUST, email, PASSWORD);
    assert.equal(other.tenantId, MAKENI_TRUST);
  });
});

function message(fn: () => unknown): string {
  try {
    fn();
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function messageAsync(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
