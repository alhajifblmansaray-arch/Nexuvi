'use client';

import { useActionState } from 'react';

import { signInAction, type SignInResult } from './actions';
import styles from './page.module.css';

const INITIAL: SignInResult = { ok: true };

export function SignInForm() {
  const [state, action, pending] = useActionState(
    async (_prev: SignInResult, formData: FormData) => signInAction(formData),
    INITIAL,
  );

  return (
    <form action={action} className={styles.signInForm}>
      <label className={styles.field}>
        <span className={styles.label}>Email address</span>
        <input
          className={styles.input}
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="the address your clinic has on file"
        />
      </label>

      <button type="submit" className={styles.primaryButton} disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>

      {state.message ? (
        <p className={styles.formError} role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
