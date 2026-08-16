import 'server-only';
import { cookies, headers } from 'next/headers';
import type { PortalOverview, ResolvedPortalBrand } from '@nexuvi/api-contracts';

/**
 * Portal API client.
 *
 * Two things travel with every request, and they do different jobs:
 *
 * - The **hostname**, forwarded as `Host`, tells the API which clinic's portal this is.
 *   It selects branding and public content. It is the only signal available before
 *   sign-in, because there is no session yet.
 * - The **session token**, when there is one, tells the API which patient is asking. It
 *   selects data, and nothing else does (§17.3).
 *
 * Forwarding the host explicitly rather than letting the API infer it from the socket is
 * what makes local development work against `*.nexuvi.health` names without DNS.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export const SESSION_COOKIE = 'nexuvi_portal';

const TIMEOUT_MS = 8_000;

export class PortalApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'PortalApiError';
  }
}

/**
 * The clinic host this request arrived on.
 *
 * In development the browser hits `localhost`, which is not a clinic. `PORTAL_HOST` pins
 * one so the portal is runnable without editing `/etc/hosts` — it is a development
 * convenience and nothing reads it in production, where the real Host header is a clinic
 * domain.
 */
async function clinicHost(): Promise<string> {
  const incoming = (await headers()).get('host') ?? '';
  const isLocal = incoming.startsWith('localhost') || incoming.startsWith('127.0.0.1');
  return isLocal ? (process.env.PORTAL_HOST ?? incoming) : incoming;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        // `Host` cannot be set from Node's fetch — it is a forbidden header name — so the
        // clinic travels as `X-Forwarded-Host`, which is what a proxy would set anyway.
        'x-forwarded-host': await clinicHost(),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : 'unknown error';
    throw new PortalApiError(`Could not reach your clinic's system (${reason})`, null);
  }

  if (!response.ok) {
    throw new PortalApiError(await explain(response), response.status);
  }

  return (await response.json()) as T;
}

async function explain(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string; errors?: string[] };
    if (body.errors?.length) return body.errors.join('. ');
    if (typeof body.detail === 'string') return body.detail;
  } catch {
    // Non-JSON error body.
  }
  return 'Something went wrong. Please try again.';
}

/** The clinic's branding and public profile. No patient data; safe before sign-in. */
export function getBrand(): Promise<ResolvedPortalBrand> {
  return request<ResolvedPortalBrand>('/portal/brand');
}

/** The signed-in patient's own overview. */
export function getOverview(): Promise<PortalOverview> {
  return request<PortalOverview>('/portal/overview');
}

export function signIn(email: string): Promise<{ token: string; expiresInSeconds: number }> {
  return request<{ token: string; expiresInSeconds: number }>('/portal/sign-in', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}
