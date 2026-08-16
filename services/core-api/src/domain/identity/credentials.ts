import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * `promisify` collapses to the three-argument overload and drops the options object, so
 * the cost parameters below would silently be ignored. Typed explicitly to keep them.
 */
const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Password hashing and verification.
 *
 * ## Why this exists at all
 *
 * Blueprint §16.1 puts authentication in the identity provider. This is the **local
 * credential path** — for self-hosted deployments and for the first administrator, who has
 * to be able to accept an invitation before any IdP has been federated for their clinic.
 * Where an IdP is configured it wins, and this code is not reached.
 *
 * Rolling your own password storage is usually a mistake. It is defensible here because
 * the surface is deliberately tiny — hash, verify, and a policy check — and because the
 * alternative is a bootstrap that cannot happen.
 *
 * ## The parameters travel with the hash
 *
 * Stored as `scrypt$N$r$p$salt$hash`. Cost parameters change over the life of a system —
 * hardware gets faster and the numbers below will look small in five years. Encoding them
 * alongside the digest means a future increase re-hashes on next successful sign-in
 * instead of locking out every existing user.
 */

/** CPU/memory cost. 2^15 ≈ 32 MiB per hash — deliberately slow for an attacker. */
const N = 32_768;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Node's default heap for scrypt is too small for these parameters. */
const MAX_MEMORY = 128 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEMORY,
  });

  return ['scrypt', N, R, P, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

/**
 * Verify a password against a stored hash.
 *
 * Comparison is `timingSafeEqual`. A byte-by-byte `===` leaks the position of the first
 * wrong byte through timing, and a stored digest is exactly the kind of value an attacker
 * gets to guess against repeatedly.
 *
 * Returns `false` for a malformed stored value rather than throwing: a corrupted row
 * should fail the sign-in, not the request pipeline.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts as [
    string, string, string, string, string, string,
  ];

  const n = Number.parseInt(nRaw, 10);
  const r = Number.parseInt(rRaw, 10);
  const p = Number.parseInt(pRaw, 10);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  let expected: Buffer;
  let salt: Buffer;
  try {
    salt = Buffer.from(saltRaw, 'base64url');
    expected = Buffer.from(hashRaw, 'base64url');
  } catch {
    return false;
  }

  let derived: Buffer;
  try {
    derived = await scryptAsync(password, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: MAX_MEMORY,
    });
  } catch {
    return false;
  }

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** True when a stored hash was made with weaker parameters than we now use. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return true;
  return Number.parseInt(parts[1] ?? '0', 10) < N;
}

export interface PasswordPolicyResult {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

/**
 * Password policy.
 *
 * Length first, and no composition rules beyond a floor. Mandatory symbol-and-digit rules
 * push people toward `Password1!` and toward reuse; length is the property that actually
 * costs an attacker. NIST dropped composition requirements for the same reason.
 *
 * The blocklist is tiny on purpose — a real deployment checks against a breach corpus,
 * which is a data problem, not a code one.
 */
const OBVIOUS = new Set([
  'password', 'password1', 'passw0rd', '12345678', '123456789', 'qwertyui',
  'letmein', 'welcome1', 'admin123', 'nexuvi', 'changeme', 'clinic123',
]);

export function checkPasswordPolicy(password: string, email?: string): PasswordPolicyResult {
  const problems: string[] = [];

  if (password.length < 12) {
    problems.push('Use at least 12 characters. Length matters more than symbols.');
  }
  if (password.length > 200) {
    // Bounded because scrypt cost scales with input and this is an unauthenticated path.
    problems.push('Use fewer than 200 characters.');
  }
  if (OBVIOUS.has(password.toLowerCase())) {
    problems.push('This is one of the most commonly used passwords. Choose another.');
  }
  if (email) {
    const local = email.split('@')[0]?.toLowerCase();
    if (local && local.length > 2 && password.toLowerCase().includes(local)) {
      problems.push('Do not include your email address in your password.');
    }
  }

  return { ok: problems.length === 0, problems };
}
