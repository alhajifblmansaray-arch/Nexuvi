'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { SESSION_COOKIE } from '../../lib/session-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export interface SignInResult {
  readonly ok: boolean;
  readonly message?: string;
}

async function clinicHost(): Promise<string> {
  const incoming = (await headers()).get('host') ?? '';
  const isLocal = incoming.startsWith('localhost') || incoming.startsWith('127.0.0.1');
  return isLocal ? (process.env.STAFF_HOST ?? incoming) : incoming;
}

/**
 * Sign in with real credentials.
 *
 * The token is stored `httpOnly` and never reaches page scripts. Nothing about the failure
 * is elaborated on here — the API already answers every failure mode with one message, and
 * embellishing it in the client would undo that.
 */
export async function signInAction(_prev: SignInResult, formData: FormData): Promise<SignInResult> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/');

  if (!email || !password) {
    return { ok: false, message: 'Enter your email address and password.' };
  }

  let session: { token: string; expiresInSeconds: number };
  try {
    const response = await fetch(`${API_URL}/identity/sign-in`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-forwarded-host': await clinicHost(),
      },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, message: (body as { detail?: string }).detail ?? 'Could not sign you in.' };
    }
    session = body as typeof session;
  } catch {
    return { ok: false, message: 'Could not reach your clinic’s system. Try again in a moment.' };
  }

  (await cookies()).set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: session.expiresInSeconds,
  });

  // Only relative paths. An open redirect on a login form is a phishing primitive:
  // the victim signs in to the real system and lands somewhere the attacker chose.
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

export async function signOutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/sign-in');
}
