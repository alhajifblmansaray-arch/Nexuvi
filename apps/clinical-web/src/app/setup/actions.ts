'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { STAFF_TOKEN_COOKIE } from './constants';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export interface ActionResult {
  readonly ok: boolean;
  readonly message?: string;
}

async function call(path: string, init: RequestInit, token?: string) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    cache: 'no-store',
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body as { detail?: string }).detail ?? 'Something went wrong.');
  }
  return body;
}

/**
 * Accept the invitation and set a password.
 *
 * The resulting token goes into an `httpOnly` cookie. It never reaches page scripts —
 * an administrator's session is authority over an entire clinic's configuration.
 */
export async function acceptInviteAction(
  token: string,
  formData: FormData,
): Promise<ActionResult> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  // Checked here as well as by the API: a mismatch is the one error the server cannot
  // detect, because it only ever receives one of the two values.
  if (password !== confirm) {
    return { ok: false, message: 'The two passwords do not match.' };
  }

  let session: { token: string; expiresInSeconds: number };
  try {
    session = (await call('/identity/invite/accept', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    })) as typeof session;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not continue.' };
  }

  (await cookies()).set(STAFF_TOKEN_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: session.expiresInSeconds,
  });

  redirect('/setup');
}

export async function saveDraftAction(formData: FormData): Promise<ActionResult> {
  const token = (await cookies()).get(STAFF_TOKEN_COOKIE)?.value;
  if (!token) return { ok: false, message: 'Your session has expired. Sign in again.' };

  const patch = {
    branding: {
      primary: String(formData.get('primary') ?? '').trim() || undefined,
      typeface: (String(formData.get('typeface') ?? '') || undefined) as never,
    },
    profile: {
      tagline: String(formData.get('tagline') ?? ''),
      phone: String(formData.get('phone') ?? ''),
      emergencyNotice: String(formData.get('emergencyNotice') ?? ''),
    },
  };

  try {
    await call('/tenant-config/draft', { method: 'PATCH', body: JSON.stringify(patch) }, token);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not save.' };
  }
  return { ok: true, message: 'Saved.' };
}

export async function publishAction(): Promise<ActionResult> {
  const token = (await cookies()).get(STAFF_TOKEN_COOKIE)?.value;
  if (!token) return { ok: false, message: 'Your session has expired. Sign in again.' };

  try {
    await call('/tenant-config/publish', { method: 'POST' }, token);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not publish.' };
  }
  return { ok: true, message: 'Your portal is live.' };
}
