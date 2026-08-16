'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { PortalApiError, SESSION_COOKIE, signIn } from '../lib/api';

export interface SignInResult {
  readonly ok: boolean;
  readonly message?: string;
}

/**
 * Establish a patient session.
 *
 * The token is stored `httpOnly` so no page script can read it. A patient session is one
 * record's worth of authority, and a token readable by an injected script is that
 * authority handed to whoever injected it.
 */
export async function signInAction(formData: FormData): Promise<SignInResult> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { ok: false, message: 'Enter your email address.' };

  let token: string;
  let expiresInSeconds: number;
  try {
    ({ token, expiresInSeconds } = await signIn(email));
  } catch (error) {
    if (error instanceof PortalApiError) return { ok: false, message: error.message };
    throw error;
  }

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: expiresInSeconds,
  });

  redirect('/');
}

export async function signOutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/');
}
