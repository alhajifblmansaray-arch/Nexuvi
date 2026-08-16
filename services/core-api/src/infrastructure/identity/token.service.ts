import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { createHmac, createVerify, timingSafeEqual } from 'node:crypto';

import { ALLOWED_ALGORITHMS, JwksClient, JwksError } from './jwks.client';

import { ConfigService } from '../config/config.service';
import type { AnyPrincipal } from '../context/request-context';

/**
 * Claims Nexuvi expects on an access token.
 *
 * `tenant_id` and `facility_ids` come from the identity provider, not the request — §17.3
 * requires tenant context to arrive from trusted routing or session, never from a body a
 * caller controls.
 */
export interface NexuviClaims {
  readonly sub: string;
  /**
   * Which identity domain this token belongs to. Absent means `staff`, so tokens minted
   * before this claim existed keep working — but a patient token must state it, and a
   * patient token is only ever minted by the portal issuer.
   */
  readonly subject_type?: 'staff' | 'patient';
  /** Required when `subject_type` is `patient`: the one record this login may read. */
  readonly patient_id?: string;
  readonly email: string;
  readonly name: string;
  readonly tenant_id: string;
  readonly country_cell_id: string;
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
  /** Omit or leave empty for organisation-wide access. */
  readonly facility_ids?: readonly string[];
  readonly support_actor_id?: string;
  readonly iss: string;
  readonly aud: string | readonly string[];
  readonly exp: number;
  readonly nbf?: number;
}

/**
 * Verifies bearer tokens.
 *
 * Two modes, chosen by config:
 *
 * - **`dev`** — HS256 against a local shared secret, so the API is usable before Cognito
 *   is provisioned. Config refuses this mode in production.
 * - **`jwks`** — RS256/384/512 against the provider's published keys, matched by `kid`.
 *   Never falls back to `dev`: an auth path that silently degrades is worse than one that
 *   is missing.
 *
 * Signature comparison uses `timingSafeEqual`. A byte-by-byte `===` on a MAC leaks the
 * position of the first wrong byte through timing, which is enough to forge one.
 */
@Injectable()
export class TokenService {
  /**
   * `jwksClient` is injectable so tests can serve a key set without a network. In
   * production it is constructed on first use, from the configured endpoint.
   */
  constructor(
    private readonly config: ConfigService,
    // `@Optional()` is load-bearing, not decoration. `emitDecoratorMetadata` records the
    // parameter's type, so Nest treats a `?:` parameter as a required dependency and
    // refuses to construct the service — a failure unit tests never see, because they
    // instantiate the class directly rather than through the container.
    @Optional() private jwks?: JwksClient,
  ) {}

  /**
   * Always asynchronous, even in `dev` mode where no fetch is needed.
   *
   * A signature that is sometimes a promise pushes the branch onto every caller, and the
   * caller that forgets gets a truthy `Promise` object where it expected a principal —
   * which passes an `if` check and fails much later.
   */
  async verify(token: string): Promise<AnyPrincipal> {
    if (this.config.auth.mode === 'dev') {
      return toPrincipal(this.verifyHs256(token));
    }
    return toPrincipal(await this.verifyJwks(token));
  }

  /** Issues a development token. Refused outside `dev` mode so it cannot leak into prod. */
  issueDevToken(claims: Omit<NexuviClaims, 'iss' | 'aud' | 'exp'>, ttlSeconds = 3600): string {
    if (this.config.auth.mode !== 'dev') {
      throw new Error('Development tokens can only be issued when AUTH_MODE=dev.');
    }

    const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64Url(
      JSON.stringify({
        ...claims,
        iss: this.config.auth.issuer,
        aud: this.config.auth.audience,
        exp: Math.floor(Date.now() / 1000) + ttlSeconds,
      }),
    );
    const signature = this.sign(`${header}.${payload}`);
    return `${header}.${payload}.${signature}`;
  }

  // ---------------------------------------------------------------------------

  private verifyHs256(token: string): NexuviClaims {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Malformed bearer token.');
    }
    const [header, payload, signature] = parts as [string, string, string];

    // The algorithm is pinned rather than read from the header. Trusting `alg` is how the
    // classic `alg: none` and HS256/RS256 confusion attacks get in.
    let decodedHeader: { alg?: string };
    try {
      decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString());
    } catch {
      throw new UnauthorizedException('Malformed bearer token.');
    }
    if (decodedHeader.alg !== 'HS256') {
      throw new UnauthorizedException('Unsupported token algorithm.');
    }

    const expected = this.sign(`${header}.${payload}`);
    const provided = Buffer.from(signature);
    const computed = Buffer.from(expected);
    if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) {
      throw new UnauthorizedException('Invalid token signature.');
    }

    let claims: NexuviClaims;
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    } catch {
      throw new UnauthorizedException('Malformed bearer token.');
    }

    this.assertClaims(claims);
    return claims;
  }

  /**
   * Verifies an asymmetrically signed token against the provider's published keys.
   *
   * The algorithm is taken from the header here — unlike the `dev` path, where it is
   * pinned — because a provider legitimately rotates between RS256/384/512. It is checked
   * against an allow-list of *asymmetric* algorithms first, so a token claiming `HS256`
   * cannot trick the verifier into treating a public key as a shared secret. That
   * substitution is the classic algorithm-confusion forgery: the public key is, by
   * definition, something an attacker already has.
   */
  private async verifyJwks(token: string): Promise<NexuviClaims> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Malformed bearer token.');
    }
    const [header, payload, signature] = parts as [string, string, string];

    let decodedHeader: { alg?: string; kid?: string };
    try {
      decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString());
    } catch {
      throw new UnauthorizedException('Malformed bearer token.');
    }

    if (!decodedHeader.alg || !ALLOWED_ALGORITHMS.has(decodedHeader.alg)) {
      throw new UnauthorizedException('Unsupported token algorithm.');
    }
    if (!decodedHeader.kid) {
      throw new UnauthorizedException('Token does not identify a signing key.');
    }

    this.jwks ??= new JwksClient(this.requireJwksUri());

    let key;
    try {
      key = await this.jwks.getKey(decodedHeader.kid);
    } catch (cause) {
      if (cause instanceof JwksError) {
        throw new UnauthorizedException(`Token signing key could not be resolved.`);
      }
      throw cause;
    }

    const digest = `SHA${decodedHeader.alg.slice(2)}`; // RS256 -> SHA256
    const verified = createVerify(digest)
      .update(`${header}.${payload}`)
      .verify(key, Buffer.from(signature, 'base64url'));

    if (!verified) {
      throw new UnauthorizedException('Invalid token signature.');
    }

    let claims: NexuviClaims;
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    } catch {
      throw new UnauthorizedException('Malformed bearer token.');
    }

    this.assertClaims(claims);
    return claims;
  }

  private requireJwksUri(): string {
    const uri = this.config.auth.jwksUri;
    if (!uri) {
      // Config refuses to boot without this, so reaching here is a programming error.
      throw new UnauthorizedException('No JWKS endpoint is configured.');
    }
    return uri;
  }

  private assertClaims(claims: NexuviClaims): void {
    const now = Math.floor(Date.now() / 1000);
    const skew = this.config.auth.clockToleranceSeconds;

    if (typeof claims.exp !== 'number' || claims.exp + skew < now) {
      throw new UnauthorizedException('Token has expired.');
    }
    if (typeof claims.nbf === 'number' && claims.nbf - skew > now) {
      throw new UnauthorizedException('Token is not yet valid.');
    }
    if (claims.iss !== this.config.auth.issuer) {
      throw new UnauthorizedException('Token issuer is not trusted.');
    }

    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(this.config.auth.audience)) {
      throw new UnauthorizedException('Token audience does not match this API.');
    }

    // Without a tenant the session has no scope, and a query with no tenant filter is the
    // single worst failure mode a multi-tenant clinical system has.
    if (!claims.sub || !claims.tenant_id) {
      throw new UnauthorizedException('Token is missing subject or tenant context.');
    }
  }

  private sign(input: string): string {
    return createHmac('sha256', this.config.auth.devSecret).update(input).digest('base64url');
  }
}

function toPrincipal(claims: NexuviClaims): AnyPrincipal {
  if (claims.subject_type === 'patient') {
    // A patient token without a record to read has no meaning, and defaulting it to
    // anything would be defaulting to someone else's record.
    if (!claims.patient_id) {
      throw new UnauthorizedException('Patient token is missing its record reference.');
    }
    return {
      subjectType: 'patient',
      userId: claims.sub,
      patientId: claims.patient_id,
      tenantId: claims.tenant_id,
      displayName: claims.name ?? claims.email ?? claims.sub,
    };
  }

  return {
    subjectType: 'staff',
    userId: claims.sub,
    email: claims.email ?? '',
    displayName: claims.name ?? claims.email ?? claims.sub,
    tenantId: claims.tenant_id,
    countryCellId: claims.country_cell_id ?? '',
    roles: claims.roles ?? [],
    permissions: new Set(claims.permissions ?? []),
    facilityIds: new Set(claims.facility_ids ?? []),
    ...(claims.support_actor_id ? { supportActorId: claims.support_actor_id } : {}),
  };
}

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}
