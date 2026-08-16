import { Injectable, UnauthorizedException } from '@nestjs/common';

import { hashPassword, verifyPassword } from './credentials';
import { identityStore, type StaffUser } from '../../infrastructure/persistence/identity-store';

/** Failures before an account is locked, and for how long. */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60_000;

interface AttemptRecord {
  failures: number;
  lockedUntil: number;
}

/**
 * Staff sign-in against local credentials.
 *
 * Used when a clinic has no federated identity provider. Where one is configured it takes
 * precedence and this path is not reached (§16.1).
 *
 * Three properties this is built around:
 *
 * **It does not reveal which emails exist.** An unknown address and a wrong password give
 * the same answer *and take the same time* — see the dummy verification below. A sign-in
 * form that answers faster for unknown users is a list of every clinician at a clinic.
 *
 * **It locks out.** Five failures and the account stops answering for fifteen minutes.
 * Without this, an eight-character password falls to an online attack in an afternoon,
 * whatever the hashing cost.
 *
 * **The lockout is per (tenant, email).** The same person may work at two customers, and
 * an attacker hammering one clinic's account must not lock them out of their job at the
 * other.
 */
@Injectable()
export class AuthenticationService {
  private readonly attempts = new Map<string, AttemptRecord>();

  /**
   * A real hash to compare against when the user does not exist.
   *
   * Verifying a password against *something* keeps the response time of an unknown email
   * indistinguishable from a wrong password. Skipping the work is what makes user
   * enumeration a timing measurement rather than a guess.
   */
  private dummyHash: string | undefined;

  async signIn(tenantId: string, email: string, password: string): Promise<StaffUser> {
    const key = `${tenantId}:${email.trim().toLowerCase()}`;
    const record = this.attempts.get(key);

    if (record && record.lockedUntil > Date.now()) {
      const minutes = Math.ceil((record.lockedUntil - Date.now()) / 60_000);
      throw new UnauthorizedException(
        `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      );
    }

    const user = identityStore.findUser(tenantId, email);

    // Always do the work, even with no user and no password to check.
    const stored = user?.passwordHash ?? (await this.dummy());
    const valid = await verifyPassword(password, stored);

    if (!user || !valid || user.status !== 'active') {
      this.recordFailure(key);
      // One message for every failure mode: unknown email, wrong password, suspended
      // account. Each distinct message is a fact an attacker did not have before.
      throw new UnauthorizedException('That email address and password do not match.');
    }

    this.attempts.delete(key);
    return user;
  }

  private recordFailure(key: string): void {
    const record = this.attempts.get(key) ?? { failures: 0, lockedUntil: 0 };
    record.failures += 1;

    if (record.failures >= MAX_ATTEMPTS) {
      record.lockedUntil = Date.now() + LOCKOUT_MS;
      record.failures = 0;
    }

    this.attempts.set(key, record);
  }

  private async dummy(): Promise<string> {
    this.dummyHash ??= await hashPassword(`unused-${Math.random()}`);
    return this.dummyHash;
  }
}
