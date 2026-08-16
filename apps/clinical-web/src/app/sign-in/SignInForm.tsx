'use client';

import { useActionState, useState } from 'react';

import { signInAction, type SignInResult } from './actions';
import styles from './page.module.css';

const IDLE: SignInResult = { ok: true };

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInAction, IDLE);
  const [revealed, setRevealed] = useState(false);

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="next" value={next} />

      <label className={styles.field}>
        <span className={styles.label}>Email</span>
        <input
          className={styles.input}
          type="email"
          name="email"
          autoComplete="username"
          autoFocus
          required
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Password</span>
        <span className={styles.passwordWrap}>
          <input
            className={styles.input}
            type={revealed ? 'text' : 'password'}
            name="password"
            autoComplete="current-password"
            required
          />
          {/* Typing a password blind on a ward tablet is how people get locked out. */}
          <button
            type="button"
            className={styles.reveal}
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        </span>
      </label>

      {state.message ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}

      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? 'Signing in…' : 'Log in'}
      </button>
    </form>
  );
}
