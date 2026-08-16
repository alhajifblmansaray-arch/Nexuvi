import 'server-only';
import { cookies, headers } from 'next/headers';

import { SESSION_COOKIE } from './session-cookie';

/**
 * The signed-in staff session.
 *
 * The cookie holds the access token itself, `httpOnly` so no page script can read it. A
 * clinician's token is authority over patient records; a token readable by an injected
 * script is that authority handed to whoever injected it.
 *
 * There is no persona, no cache, and no token minting here any more. The token is issued
 * by the API when someone signs in with real credentials, and this module only carries it.
 */

export { SESSION_COOKIE } from './session-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/**
 * The clinic host this request arrived on.
 *
 * Staff surfaces live at `{slug}-app.nexuvi.health`. In development the browser hits
 * `localhost`, which is not a clinic, so `STAFF_HOST` pins one — a development convenience
 * only. In production the real `Host` header is a clinic domain and nothing reads this.
 */
export async function clinicHost(): Promise<string> {
  const incoming = (await headers()).get('host') ?? '';
  const isLocal = incoming.startsWith('localhost') || incoming.startsWith('127.0.0.1');
  return isLocal ? (process.env.STAFF_HOST ?? incoming) : incoming;
}

export async function getAccessToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export interface SessionUser {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly roles: readonly string[];
}

/**
 * Who is signed in, for display.
 *
 * Reads the token's payload **without verifying the signature**, which is safe only
 * because nothing here is an authorization decision — it renders a name in the corner. The
 * API verifies every token on every request, and that is the check that matters. Using an
 * unverified claim to decide what someone may *do* would be the bug this comment exists to
 * prevent.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const payload = token.split('.')[1];
  if (!payload) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      sub?: string;
      name?: string;
      email?: string;
      roles?: string[];
      exp?: number;
    };

    // An expired token is not a session. The API would reject it anyway; treating it as
    // signed-out here means the user sees the login screen instead of a broken dashboard.
    if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) return null;

    return {
      userId: claims.sub ?? '',
      displayName: claims.name ?? claims.email ?? 'Signed in',
      email: claims.email ?? '',
      roles: claims.roles ?? [],
    };
  } catch {
    return null;
  }
}

export interface ClinicBrand {
  readonly displayName: string;
  readonly tagline: string | null;
  readonly phone: string | null;
  readonly themeKey: string;
  readonly stylesheet: string;
  readonly logoUrl: string | null;
  readonly typeface: string;
}

/**
 * The clinic this login screen belongs to.
 *
 * Fetched before anyone types a password. An unbranded login box is indistinguishable from
 * a phishing page, and a clinician who works at two customers needs to see which one they
 * are entering.
 */
export async function getClinicBrand(): Promise<ClinicBrand | null> {
  try {
    const response = await fetch(`${API_URL}/identity/clinic`, {
      headers: { accept: 'application/json', 'x-forwarded-host': await clinicHost() },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    return (await response.json()) as ClinicBrand;
  } catch {
    return null;
  }
}
