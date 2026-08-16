import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  checkPasswordPolicy,
  hashPassword,
  needsRehash,
  verifyPassword,
} from './credentials';

const PASSWORD = 'correct horse battery staple';

describe('password hashing', () => {
  it('round-trips a password', async () => {
    const stored = await hashPassword(PASSWORD);
    assert.equal(await verifyPassword(PASSWORD, stored), true);
  });

  it('rejects the wrong password', async () => {
    const stored = await hashPassword(PASSWORD);
    assert.equal(await verifyPassword('not the password', stored), false);
  });

  it('never stores the password itself', async () => {
    const stored = await hashPassword(PASSWORD);
    assert.ok(!stored.includes(PASSWORD));
    assert.ok(!stored.toLowerCase().includes('horse'));
  });

  it('salts, so the same password hashes differently every time', async () => {
    // Without a per-user salt, identical passwords produce identical digests and one
    // rainbow table cracks every account that shares a password.
    const a = await hashPassword(PASSWORD);
    const b = await hashPassword(PASSWORD);

    assert.notEqual(a, b);
    assert.equal(await verifyPassword(PASSWORD, a), true);
    assert.equal(await verifyPassword(PASSWORD, b), true);
  });

  it('encodes its cost parameters so they can be raised later', async () => {
    // Without this, increasing cost would invalidate every existing password.
    const stored = await hashPassword(PASSWORD);
    const [scheme, n, r, p] = stored.split('$');

    assert.equal(scheme, 'scrypt');
    assert.ok(Number(n) >= 32_768, 'cost should be at least 2^15');
    assert.ok(Number(r) > 0 && Number(p) > 0);
  });

  it('flags a hash made with weaker parameters', async () => {
    const current = await hashPassword(PASSWORD);
    assert.equal(needsRehash(current), false);

    // A hash from an older, cheaper configuration.
    assert.equal(needsRehash('scrypt$16384$8$1$c2FsdA$aGFzaA'), true);
  });

  it('returns false rather than throwing on a malformed stored value', async () => {
    // A corrupted row should fail the sign-in, not the request pipeline.
    for (const bad of ['', 'garbage', 'scrypt$only$three', 'bcrypt$1$2$3$4$5', 'scrypt$x$y$z$q$w']) {
      assert.equal(await verifyPassword(PASSWORD, bad), false, JSON.stringify(bad));
    }
  });
});

describe('password policy', () => {
  it('requires length over composition', () => {
    // Symbol-and-digit rules push people toward `Password1!` and toward reuse.
    assert.equal(checkPasswordPolicy('short').ok, false);
    assert.equal(checkPasswordPolicy('a-perfectly-fine-long-passphrase').ok, true);
  });

  it('rejects the most obvious passwords', () => {
    assert.equal(checkPasswordPolicy('password').ok, false);
    assert.equal(checkPasswordPolicy('123456789').ok, false);
  });

  it('rejects a password containing the user’s own email', () => {
    const result = checkPasswordPolicy('aminata-is-my-password', 'aminata@clinic.sl');
    assert.equal(result.ok, false);
    assert.match(result.problems.join(' '), /email/);
  });

  it('bounds the input, since hashing is on an unauthenticated path', () => {
    assert.equal(checkPasswordPolicy('x'.repeat(500)).ok, false);
  });

  it('reports every problem at once', () => {
    const result = checkPasswordPolicy('nexuvi');
    assert.ok(result.problems.length >= 2, 'short and obvious are both true here');
  });
});
