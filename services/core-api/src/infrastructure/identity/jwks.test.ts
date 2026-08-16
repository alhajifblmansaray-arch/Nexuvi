import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';

import { ConfigService, loadConfig } from '../config/config.service';
import { JwksClient } from './jwks.client';
import { TokenService } from './token.service';

/**
 * Real RSA keys, generated per suite.
 *
 * The signatures here are genuine — nothing is stubbed below the crypto. A test that fakes
 * the verifier proves only that the fake agrees with itself.
 */
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });

const KID = 'key-1';

const JWKS_ENV: NodeJS.ProcessEnv = {
  AUTH_MODE: 'jwks',
  AUTH_JWKS_URI: 'https://auth.test/.well-known/jwks.json',
};

const CLAIMS = {
  sub: 'usr_1',
  email: 'a@b.test',
  name: 'Test User',
  tenant_id: 'ten_1',
  country_cell_id: 'cell_sl',
  roles: ['physician'],
  permissions: ['encounter:read'],
  iss: 'https://auth.nexuvi.local',
  aud: 'nexuvi-core-api',
  exp: Math.floor(Date.now() / 1000) + 3600,
};

function jwkFor(key: KeyObject, kid: string) {
  return { ...key.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' };
}

/** A `fetch` that serves a fixed JWKS document and counts calls. */
function jwksServer(keys: object[]) {
  const state = { calls: 0 };
  const impl = (async () => {
    state.calls += 1;
    return new Response(JSON.stringify({ keys }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { impl, state };
}

function signToken(
  key: KeyObject,
  { kid, alg = 'RS256', claims = CLAIMS }: { kid?: string; alg?: string; claims?: object } = {},
): string {
  const header = Buffer.from(
    JSON.stringify({ alg, typ: 'JWT', ...(kid ? { kid } : {}) }),
  ).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');

  const digest = alg === 'none' ? null : `SHA${alg.slice(2)}`;
  if (!digest) return `${header}.${payload}.`;

  const signature = createSign(digest).update(`${header}.${payload}`).sign(key);
  return `${header}.${payload}.${signature.toString('base64url')}`;
}

function serviceWith(fetchImpl: typeof fetch, env: NodeJS.ProcessEnv = JWKS_ENV): TokenService {
  const config = new ConfigService(loadConfig(env));
  return new TokenService(config, new JwksClient(config.auth.jwksUri!, fetchImpl));
}

describe('JWKS verification', () => {
  describe('valid tokens', () => {
    it('verifies a token signed by a published key', async () => {
      const { impl } = jwksServer([jwkFor(publicKey, KID)]);
      const principal = await serviceWith(impl).verify(signToken(privateKey, { kid: KID }));

      assert.equal(principal.userId, 'usr_1');
      assert.equal(principal.tenantId, 'ten_1');
    });

    it('accepts RS384 and RS512', async () => {
      const { impl } = jwksServer([{ ...jwkFor(publicKey, KID), alg: undefined }]);
      const service = serviceWith(impl);

      for (const alg of ['RS384', 'RS512']) {
        const principal = await service.verify(signToken(privateKey, { kid: KID, alg }));
        assert.equal(principal.userId, 'usr_1', `alg ${alg}`);
      }
    });
  });

  describe('forgery', () => {
    it('rejects a token signed by a key the provider does not publish', async () => {
      const { impl } = jwksServer([jwkFor(publicKey, KID)]);
      await assert.rejects(
        () => serviceWith(impl).verify(signToken(other.privateKey, { kid: KID })),
        UnauthorizedException,
      );
    });

    it('rejects a payload edited after signing', async () => {
      const { impl } = jwksServer([jwkFor(publicKey, KID)]);
      const token = signToken(privateKey, { kid: KID });

      const parts = token.split('.');
      const claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
      claims.permissions = ['encounter:read', 'config:write'];
      parts[1] = Buffer.from(JSON.stringify(claims)).toString('base64url');

      await assert.rejects(() => serviceWith(impl).verify(parts.join('.')), UnauthorizedException);
    });

    it('rejects alg:none', async () => {
      const { impl } = jwksServer([jwkFor(publicKey, KID)]);
      await assert.rejects(
        () => serviceWith(impl).verify(signToken(privateKey, { kid: KID, alg: 'none' })),
        UnauthorizedException,
      );
    });

    it('rejects a symmetric algorithm — the algorithm-confusion forgery', async () => {
      // The attack: sign with HS256 using the *public* key as the shared secret. The
      // public key is, by definition, something an attacker already has. The allow-list
      // is asymmetric-only precisely to make this unreachable.
      const { impl } = jwksServer([jwkFor(publicKey, KID)]);

      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: KID })).toString('base64url');
      const payload = Buffer.from(JSON.stringify(CLAIMS)).toString('base64url');
      const { createHmac } = await import('node:crypto');
      const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
      const signature = createHmac('sha256', pem).update(`${header}.${payload}`).digest('base64url');

      await assert.rejects(
        () => serviceWith(impl).verify(`${header}.${payload}.${signature}`),
        UnauthorizedException,
      );
    });

    it('rejects a token that names no signing key', async () => {
      const { impl } = jwksServer([jwkFor(publicKey, KID)]);
      await assert.rejects(
        () => serviceWith(impl).verify(signToken(privateKey)),
        UnauthorizedException,
      );
    });

    it('rejects an unknown key id', async () => {
      const { impl } = jwksServer([jwkFor(publicKey, KID)]);
      await assert.rejects(
        () => serviceWith(impl).verify(signToken(privateKey, { kid: 'key-does-not-exist' })),
        UnauthorizedException,
      );
    });
  });

  describe('claims still apply', () => {
    it('rejects an expired token even with a valid signature', async () => {
      const { impl } = jwksServer([jwkFor(publicKey, KID)]);
      const expired = { ...CLAIMS, exp: Math.floor(Date.now() / 1000) - 3600 };

      await assert.rejects(
        () => serviceWith(impl).verify(signToken(privateKey, { kid: KID, claims: expired })),
        UnauthorizedException,
      );
    });

    it('rejects a foreign issuer even with a valid signature', async () => {
      const { impl } = jwksServer([jwkFor(publicKey, KID)]);
      const foreign = { ...CLAIMS, iss: 'https://evil.test' };

      await assert.rejects(
        () => serviceWith(impl).verify(signToken(privateKey, { kid: KID, claims: foreign })),
        UnauthorizedException,
      );
    });
  });

  describe('key set caching', () => {
    it('fetches once for repeated verifications', async () => {
      const { impl, state } = jwksServer([jwkFor(publicKey, KID)]);
      const service = serviceWith(impl);

      await service.verify(signToken(privateKey, { kid: KID }));
      await service.verify(signToken(privateKey, { kid: KID }));
      await service.verify(signToken(privateKey, { kid: KID }));

      assert.equal(state.calls, 1);
    });

    it('does not refetch on every unknown key id', async () => {
      // Otherwise anyone can force unbounded outbound requests with random key ids.
      const { impl, state } = jwksServer([jwkFor(publicKey, KID)]);
      const service = serviceWith(impl);

      for (let i = 0; i < 5; i += 1) {
        await assert.rejects(() => service.verify(signToken(privateKey, { kid: `probe-${i}` })));
      }

      // One warm-up fetch plus at most one cooldown-limited refresh.
      assert.ok(state.calls <= 2, `expected at most 2 fetches, saw ${state.calls}`);
    });

    it('keeps working keys when the endpoint returns an unusable document', async () => {
      let payload: object[] = [jwkFor(publicKey, KID)];
      const impl = (async () =>
        new Response(JSON.stringify({ keys: payload }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })) as unknown as typeof fetch;

      const client = new JwksClient('https://auth.test/jwks', impl);
      await client.getKey(KID);

      // A provider glitch must not become a total outage.
      payload = [];
      assert.doesNotThrow(() => client.getKey(KID));
    });
  });

  describe('endpoint failure', () => {
    it('refuses the token rather than admitting it when the endpoint is down', async () => {
      const impl = (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch;

      await assert.rejects(
        () => serviceWith(impl).verify(signToken(privateKey, { kid: KID })),
        UnauthorizedException,
      );
    });

    it('refuses the token on a non-200 response', async () => {
      const impl = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;

      await assert.rejects(
        () => serviceWith(impl).verify(signToken(privateKey, { kid: KID })),
        UnauthorizedException,
      );
    });
  });
});
