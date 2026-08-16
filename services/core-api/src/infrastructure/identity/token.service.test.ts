import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';

import { ConfigService, loadConfig } from '../config/config.service';
import { TokenService } from './token.service';

function serviceWith(env: NodeJS.ProcessEnv = {}): TokenService {
  return new TokenService(new ConfigService(loadConfig(env)));
}

const CLAIMS = {
  sub: 'usr_1',
  email: 'a@b.test',
  name: 'Test User',
  tenant_id: 'ten_1',
  country_cell_id: 'cell_sl',
  roles: ['nurse'],
  permissions: ['encounter:read'],
  facility_ids: ['fac_1'],
};

function tamper(token: string, part: 0 | 1, mutate: (decoded: any) => void): string {
  const parts = token.split('.');
  const decoded = JSON.parse(Buffer.from(parts[part]!, 'base64url').toString());
  mutate(decoded);
  parts[part] = Buffer.from(JSON.stringify(decoded)).toString('base64url');
  return parts.join('.');
}

describe('TokenService', () => {
  describe('round trip', () => {
    it('verifies a token it issued', async () => {
      const service = serviceWith();
      const principal = await service.verify(service.issueDevToken(CLAIMS));

      assert.equal(principal.subjectType, 'staff');
      assert.equal(principal.userId, 'usr_1');
      assert.equal(principal.tenantId, 'ten_1');

      // Narrowed before touching staff-only fields; the union has neither.
      assert.ok(principal.subjectType === 'staff');
      assert.deepEqual([...principal.permissions], ['encounter:read']);
      assert.deepEqual([...principal.facilityIds], ['fac_1']);
    });

    it('treats absent facility claims as organisation-wide', async () => {
      const service = serviceWith();
      const { facility_ids, ...withoutFacilities } = CLAIMS;
      const principal = await service.verify(service.issueDevToken(withoutFacilities));

      assert.ok(principal.subjectType === 'staff');
      assert.equal(principal.facilityIds.size, 0);
    });
  });

  describe('patient tokens', () => {
    it('verifies into a patient principal carrying one record', async () => {
      const service = serviceWith();
      const token = service.issueDevToken({
        sub: 'pusr_1',
        subject_type: 'patient',
        patient_id: 'pat_1',
        email: 'p@b.test',
        name: 'A Patient',
        tenant_id: 'ten_1',
        country_cell_id: 'cell_sl',
      });

      const principal = await service.verify(token);
      assert.equal(principal.subjectType, 'patient');
      assert.ok(principal.subjectType === 'patient');
      assert.equal(principal.patientId, 'pat_1');
    });

    it('refuses a patient token with no record reference', async () => {
      // A patient token that names no record has no meaning, and defaulting it would be
      // defaulting to someone else's record.
      const service = serviceWith();
      const token = service.issueDevToken({
        sub: 'pusr_1',
        subject_type: 'patient',
        email: 'p@b.test',
        name: 'A Patient',
        tenant_id: 'ten_1',
        country_cell_id: 'cell_sl',
      });

      await assert.rejects(() => service.verify(token), UnauthorizedException);
    });

    it('carries no permissions, whatever the claims asked for', async () => {
      const service = serviceWith();
      const token = service.issueDevToken({
        sub: 'pusr_1',
        subject_type: 'patient',
        patient_id: 'pat_1',
        email: 'p@b.test',
        name: 'A Patient',
        tenant_id: 'ten_1',
        country_cell_id: 'cell_sl',
        permissions: ['encounter:read', 'audit:read'],
        facility_ids: ['fac_1'],
      });

      const principal = await service.verify(token);
      // The patient principal has no permission field at all — a staff route reading one
      // cannot find something to satisfy it.
      assert.ok(!('permissions' in principal));
      assert.ok(!('facilityIds' in principal));
    });
  });

  describe('signature', () => {
    it('rejects a payload edited after signing', async () => {
      const service = serviceWith();
      const token = service.issueDevToken(CLAIMS);

      // The classic privilege escalation: keep the signature, widen the permissions.
      const forged = tamper(token, 1, (c) => {
        c.permissions = ['encounter:read', 'encounter:assign', 'audit:read'];
      });

      await assert.rejects(() => service.verify(forged), UnauthorizedException);
    });

    it('rejects a token signed with a different secret', async () => {
      const mine = serviceWith({ JWT_SECRET: 'secret-a' });
      const theirs = serviceWith({ JWT_SECRET: 'secret-b' });

      await assert.rejects(() => mine.verify(theirs.issueDevToken(CLAIMS)), UnauthorizedException);
    });

    it('rejects alg:none', async () => {
      // The algorithm is pinned rather than read from the header; trusting `alg` is how
      // this attack works.
      const service = serviceWith();
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ ...CLAIMS, iss: 'https://auth.nexuvi.local', aud: 'nexuvi-core-api', exp: 9_999_999_999 })).toString('base64url');

      await assert.rejects(() => service.verify(`${header}.${payload}.`), UnauthorizedException);
    });

    it('rejects a header claiming a different algorithm even if the MAC matches', async () => {
      const service = serviceWith();
      const header = Buffer.from(JSON.stringify({ alg: 'HS512', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ ...CLAIMS, iss: 'https://auth.nexuvi.local', aud: 'nexuvi-core-api', exp: 9_999_999_999 })).toString('base64url');
      const signature = createHmac('sha256', 'dev-secret-change-in-production')
        .update(`${header}.${payload}`)
        .digest('base64url');

      await assert.rejects(() => service.verify(`${header}.${payload}.${signature}`), UnauthorizedException);
    });

    it('rejects malformed tokens without throwing something unexpected', async () => {
      const service = serviceWith();
      for (const bad of ['', 'not-a-token', 'a.b', 'a.b.c.d', '...']) {
        await assert.rejects(() => service.verify(bad), UnauthorizedException, `input: "${bad}"`);
      }
    });
  });

  describe('claims', () => {
    it('rejects an expired token', async () => {
      const service = serviceWith();
      await assert.rejects(() => service.verify(service.issueDevToken(CLAIMS, -3600)), UnauthorizedException);
    });

    it('allows a small clock skew', async () => {
      const service = serviceWith({ AUTH_CLOCK_TOLERANCE: '120' });
      // Expired 60s ago, within the 120s tolerance.
      await assert.doesNotReject(() => service.verify(service.issueDevToken(CLAIMS, -60)));
    });

    it('rejects a foreign issuer', async () => {
      const mine = serviceWith();
      const theirs = serviceWith({ AUTH_ISSUER: 'https://evil.test' });
      await assert.rejects(() => mine.verify(theirs.issueDevToken(CLAIMS)), UnauthorizedException);
    });

    it('rejects a token minted for a different audience', async () => {
      const mine = serviceWith();
      const other = serviceWith({ AUTH_AUDIENCE: 'some-other-api' });
      await assert.rejects(() => mine.verify(other.issueDevToken(CLAIMS)), UnauthorizedException);
    });

    it('rejects a token with no tenant — a session with no scope', async () => {
      const service = serviceWith();
      const token = service.issueDevToken(CLAIMS);
      const scopeless = tamper(token, 1, (c) => {
        delete c.tenant_id;
      });
      // Signature check fires first; either way it must not verify.
      await assert.rejects(() => service.verify(scopeless), UnauthorizedException);
    });
  });

  describe('mode safety', () => {
    it('refuses to issue development tokens outside dev mode', async () => {
      const service = serviceWith({
        AUTH_MODE: 'jwks',
        AUTH_JWKS_URI: 'https://auth.test/jwks',
      });
      assert.throws(() => service.issueDevToken(CLAIMS), /only be issued when AUTH_MODE=dev/);
    });

    it('does not silently fall back to dev verification in jwks mode', async () => {
      // A degrading auth path is worse than a missing one.
      const dev = serviceWith();
      const jwks = serviceWith({
        AUTH_MODE: 'jwks',
        AUTH_JWKS_URI: 'https://auth.test/jwks',
      });
      await assert.rejects(() => jwks.verify(dev.issueDevToken(CLAIMS)), UnauthorizedException);
    });
  });
});
