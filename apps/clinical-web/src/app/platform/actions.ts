'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { SESSION_COOKIE } from '../../lib/session-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export interface OperatorSignInResult {
  readonly ok: boolean;
  readonly message?: string;
}

/**
 * Sign in to the operator console.
 *
 * A shared key rather than a user account, because the platform operator is not a member
 * of any clinic and there is no identity provider in front of this yet. The key is
 * `DEV_TOKEN_SECRET`; it is compared by the API, never held in page scripts, and the token
 * it returns is stored `httpOnly` like every other session.
 *
 * This is a trial affordance and is only reachable while `AUTH_MODE=dev`. Real deployments
 * put an identity provider here — the API refuses `AUTH_MODE=dev` under
 * `NODE_ENV=production` for exactly this reason.
 */
export async function operatorSignInAction(
  _prev: OperatorSignInResult,
  formData: FormData,
): Promise<OperatorSignInResult> {
  const key = String(formData.get('key') ?? '');
  if (!key) return { ok: false, message: 'Enter your operator key.' };

  try {
    const response = await fetch(`${API_URL}/auth/dev-token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-nexuvi-dev-secret': key,
      },
      body: JSON.stringify({ persona: 'platformOperator' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      // One message for every failure. Distinguishing "wrong key" from anything else
      // would turn this form into an oracle for guessing the key.
      return { ok: false, message: 'That key was not accepted.' };
    }

    const session = (await response.json()) as { token: string; expiresInSeconds: number };
    (await cookies()).set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: session.expiresInSeconds,
    });
  } catch {
    return { ok: false, message: 'Could not reach the platform API. Try again in a moment.' };
  }

  return { ok: true };
}

export interface CreateClinicResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly created?: {
    readonly name: string;
    readonly portalUrl: string;
    readonly staffUrl: string;
    readonly setupUrl: string;
    readonly inviteExpiresAt: string;
  };
}

/**
 * Create a clinic.
 *
 * Provisioning takes ten fields; this form asks for the ones an operator actually has to
 * decide, and defaults the rest. A form that demands all ten is a form nobody completes
 * with a customer on the phone.
 *
 * What stays on screen is what cannot be undone or guessed: the address patients will
 * bookmark, the country the data lives in, and the plan — because on Essentials the clinic
 * has no patient portal at all, and that is not something to discover later.
 */
export async function createClinicAction(
  _prev: CreateClinicResult,
  formData: FormData,
): Promise<CreateClinicResult> {
  const legalName = String(formData.get('legalName') ?? '').trim();
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase();
  const adminName = String(formData.get('adminName') ?? '').trim();
  const adminEmail = String(formData.get('adminEmail') ?? '').trim();
  const countryCellId = String(formData.get('countryCellId') ?? 'cell_sl');
  const template = String(formData.get('template') ?? 'primary-care');
  const city = String(formData.get('city') ?? '').trim();
  const plan = String(formData.get('plan') ?? 'practice');

  if (!legalName) return { ok: false, message: 'Enter the clinic’s name.' };
  if (!slug) return { ok: false, message: 'Enter a web address for the clinic.' };
  if (!adminName || !adminEmail) {
    return { ok: false, message: 'Enter the administrator’s name and email.' };
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { ok: false, message: 'Your session ended. Sign in again.' };

  try {
    const response = await fetch(`${API_URL}/platform/tenants`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        legalName,
        slug,
        countryCellId,
        template,
        plan,
        adminEmail,
        adminName,
        // One clinic, one site, at the start. Groups add locations from inside the app.
        facilityName: legalName,
        city: city || 'Freetown',
        timezone: 'Africa/Freetown',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const detail =
        (body.detail as string | undefined) ??
        (Array.isArray(body.message) ? (body.message as string[]).join('. ') : undefined) ??
        'Could not create the clinic.';
      return { ok: false, message: detail };
    }

    revalidatePath('/platform');

    return {
      ok: true,
      created: {
        name: legalName,
        portalUrl: (body.portalUrl as string) ?? '',
        staffUrl: `https://${slug}-app.${(process.env.PLATFORM_DOMAIN ?? 'nexuvi.health')}`,
        setupUrl: body.setupUrl as string,
        inviteExpiresAt: body.inviteExpiresAt as string,
      },
    };
  } catch {
    return { ok: false, message: 'Could not reach the platform API. Try again in a moment.' };
  }
}

export async function operatorSignOutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  revalidatePath('/platform');
}
