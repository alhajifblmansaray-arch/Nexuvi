'use client';

import { useActionState } from 'react';

import { inviteColleagueAction, type InviteResult } from './actions';
import styles from './page.module.css';

const IDLE: InviteResult = { ok: true };

const ROLES = [
  { value: 'physician', label: 'Physician', can: 'Read and write encounters, prescribe, acknowledge results' },
  { value: 'nurse', label: 'Nurse', can: 'Read encounters, acknowledge results' },
  { value: 'receptionist', label: 'Receptionist', can: 'Schedule and encounter lists' },
  { value: 'administrator', label: 'Administrator', can: 'Everything above, plus staff and settings' },
];

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteColleagueAction, IDLE);

  return (
    <>
      <form action={action} className={styles.form}>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Full name</span>
            <input className={styles.input} name="displayName" required maxLength={120} />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Email</span>
            <input className={styles.input} type="email" name="email" required />
          </label>
        </div>

        <fieldset className={styles.roles}>
          <legend className={styles.label}>Role</legend>
          {ROLES.map((role, index) => (
            <label key={role.value} className={styles.role}>
              <input type="radio" name="role" value={role.value} defaultChecked={index === 1} />
              <span>
                <span className={styles.roleName}>{role.label}</span>
                <span className={styles.roleCan}>{role.can}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <button type="submit" className={styles.primary} disabled={pending}>
          {pending ? 'Creating invitation…' : 'Send invitation'}
        </button>

        {state.message ? (
          <p className={styles.error} role="alert">{state.message}</p>
        ) : null}
      </form>

      {state.link ? (
        <div className={styles.linkBox} role="status">
          <p className={styles.linkTitle}>Invitation created</p>
          <p className={styles.linkBody}>
            Send this link to them. It works once, expires in seven days, and{' '}
            <strong>cannot be shown again</strong> — nothing stores it.
          </p>
          <code className={styles.link}>{state.link}</code>
        </div>
      ) : null}
    </>
  );
}
