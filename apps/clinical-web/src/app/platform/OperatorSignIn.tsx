'use client';

import { useActionState } from 'react';

import { operatorSignInAction, type OperatorSignInResult } from './actions';
import styles from './page.module.css';

const IDLE: OperatorSignInResult = { ok: true };

export function OperatorSignIn() {
  const [state, action, pending] = useActionState(operatorSignInAction, IDLE);

  return (
    <main className={styles.page}>
      <div className={styles.gate}>
        <p className={styles.eyebrow}>Nexuvi</p>
        <h1 className={styles.title}>Operator console</h1>
        <p className={styles.gateBody}>
          This is the platform’s own console, not a clinic’s. Staff sign in at their
          clinic’s address.
        </p>

        <form action={action} className={styles.form}>
          <label className={styles.field}>
            <span className={styles.label}>Operator key</span>
            <input
              className={styles.input}
              type="password"
              name="key"
              autoComplete="off"
              autoFocus
              required
            />
          </label>

          <button type="submit" className={styles.primary} disabled={pending}>
            {pending ? 'Checking…' : 'Continue'}
          </button>

          {state.message ? (
            <p className={styles.error} role="alert">{state.message}</p>
          ) : null}
        </form>
      </div>
    </main>
  );
}
