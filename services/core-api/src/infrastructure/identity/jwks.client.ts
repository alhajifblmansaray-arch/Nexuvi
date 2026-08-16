import { createPublicKey, type KeyObject } from 'node:crypto';

/**
 * JSON Web Key Set client.
 *
 * Fetches and caches the identity provider's public signing keys.
 *
 * Two failure modes this is shaped around:
 *
 * **Key rotation.** A provider rotates signing keys without warning, so a `kid` the cache
 * has never seen is normal, not an attack — the cache refreshes on an unknown key id.
 *
 * **Refresh as a denial-of-service.** If every unknown `kid` triggered a fetch, anyone
 * could force unbounded outbound requests by sending tokens with random key ids. Refreshes
 * are therefore rate-limited, and a token whose key is unknown *and* which arrives inside
 * the cooldown is rejected rather than served a fetch.
 */

/** Signing algorithms accepted. Asymmetric only — see `TokenService` on algorithm confusion. */
const ALLOWED_ALGORITHMS = new Set(['RS256', 'RS384', 'RS512']);

/** How long a successfully fetched key set is trusted before a background refresh. */
const CACHE_TTL_MS = 10 * 60_000;

/** Minimum gap between refreshes triggered by an unknown key id. */
const REFRESH_COOLDOWN_MS = 30_000;

const FETCH_TIMEOUT_MS = 5_000;

interface Jwk {
  readonly kid?: string;
  readonly kty?: string;
  readonly alg?: string;
  readonly use?: string;
  readonly n?: string;
  readonly e?: string;
}

export class JwksError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwksError';
  }
}

export class JwksClient {
  private keys = new Map<string, KeyObject>();
  private fetchedAt = 0;
  private lastRefreshAttempt = 0;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly jwksUri: string,
    /** Injected so tests can serve a key set without a network. */
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /**
   * Public key for a key id.
   *
   * Refreshes when the cache is cold, stale, or does not know the key — subject to the
   * cooldown above.
   */
  async getKey(kid: string): Promise<KeyObject> {
    const stale = Date.now() - this.fetchedAt > CACHE_TTL_MS;

    if (this.keys.size === 0 || stale) {
      await this.refresh();
    }

    const cached = this.keys.get(kid);
    if (cached) return cached;

    // Unknown key id: possibly a rotation, possibly a probe. One refresh, rate-limited.
    if (Date.now() - this.lastRefreshAttempt > REFRESH_COOLDOWN_MS) {
      await this.refresh();
      const refreshed = this.keys.get(kid);
      if (refreshed) return refreshed;
    }

    throw new JwksError(`No signing key matches key id "${kid}".`);
  }

  /** Collapses concurrent refreshes into one request. */
  private async refresh(): Promise<void> {
    this.inFlight ??= this.doRefresh().finally(() => {
      this.inFlight = null;
    });
    await this.inFlight;
  }

  private async doRefresh(): Promise<void> {
    this.lastRefreshAttempt = Date.now();

    let response: Response;
    try {
      response = await this.fetchImpl(this.jwksUri, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (cause) {
      throw new JwksError(
        `Could not reach the JWKS endpoint (${cause instanceof Error ? cause.message : 'unknown error'}).`,
      );
    }

    if (!response.ok) {
      throw new JwksError(`JWKS endpoint returned ${response.status}.`);
    }

    let document: { keys?: Jwk[] };
    try {
      document = (await response.json()) as { keys?: Jwk[] };
    } catch {
      throw new JwksError('JWKS endpoint returned a malformed document.');
    }

    if (!Array.isArray(document.keys)) {
      throw new JwksError('JWKS document has no "keys" array.');
    }

    const parsed = new Map<string, KeyObject>();
    for (const jwk of document.keys) {
      // Skip rather than throw: a provider legitimately publishes encryption keys and
      // future algorithms alongside the signing keys we understand, and one unusable
      // entry must not invalidate the whole set.
      if (!jwk.kid || jwk.kty !== 'RSA') continue;
      if (jwk.use && jwk.use !== 'sig') continue;
      if (jwk.alg && !ALLOWED_ALGORITHMS.has(jwk.alg)) continue;

      try {
        parsed.set(jwk.kid, createPublicKey({ key: jwk as never, format: 'jwk' }));
      } catch {
        continue;
      }
    }

    if (parsed.size === 0) {
      // Replacing a working cache with an empty one would turn a provider glitch into a
      // total outage, so the previous keys are kept.
      throw new JwksError('JWKS document contained no usable RSA signing keys.');
    }

    this.keys = parsed;
    this.fetchedAt = Date.now();
  }
}

export { ALLOWED_ALGORITHMS };
