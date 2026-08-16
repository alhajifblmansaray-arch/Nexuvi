'use client';

import { useActionState } from 'react';

import { acceptInviteAction, publishAction, saveDraftAction, type ActionResult } from './actions';
import styles from './page.module.css';

const IDLE: ActionResult = { ok: true };

/** Step one: prove you hold the invitation, and choose a password. */
export function AcceptForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => acceptInviteAction(token, formData),
    IDLE,
  );

  return (
    <form action={action} className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>Choose a password</span>
        <input className={styles.input} type="password" name="password" autoComplete="new-password" required />
        <span className={styles.hint}>
          At least 12 characters. A memorable phrase is stronger than a short password with symbols.
        </span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Confirm password</span>
        <input className={styles.input} type="password" name="confirm" autoComplete="new-password" required />
      </label>

      <button type="submit" className={styles.primary} disabled={pending}>
        {pending ? 'Creating your account…' : 'Create account'}
      </button>

      {state.message ? <p className={styles.error} role="alert">{state.message}</p> : null}
    </form>
  );
}

/** Step two: the things a patient sees. */
export function BrandForm({
  primary,
  typeface,
  tagline,
  phone,
  emergencyNotice,
}: {
  primary: string;
  typeface: string;
  tagline: string;
  phone: string;
  emergencyNotice: string;
}) {
  const [state, action, pending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => saveDraftAction(formData),
    IDLE,
  );

  return (
    <form action={action} className={styles.form}>
      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Brand colour</span>
          <input className={styles.colour} type="color" name="primary" defaultValue={primary || '#131619'} />
          <span className={styles.hint}>
            Checked for contrast before it is saved. If it cannot carry readable text you will be
            told, and offered the nearest shade that works.
          </span>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Typeface</span>
          <select className={styles.input} name="typeface" defaultValue={typeface}>
            <option value="system">System default</option>
            <option value="inter">Inter</option>
            <option value="source-sans">Source Sans</option>
            <option value="ibm-plex">IBM Plex Sans</option>
          </select>
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Tagline</span>
        <input className={styles.input} type="text" name="tagline" defaultValue={tagline} maxLength={200} />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Reception phone</span>
        <input className={styles.input} type="text" name="phone" defaultValue={phone} maxLength={40} />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Emergency notice</span>
        <textarea className={styles.textarea} name="emergencyNotice" rows={3} defaultValue={emergencyNotice} maxLength={500} />
        <span className={styles.hint}>
          Shown on every page of your portal, in the platform&rsquo;s alert styling rather than
          your brand colours — patients should read it the same way at every clinic.
        </span>
      </label>

      <button type="submit" className={styles.primary} disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </button>

      {state.message ? (
        <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p>
      ) : null}
    </form>
  );
}

/** Step three: the explicit decision to go live. */
export function PublishForm({ portalUrl }: { portalUrl: string }) {
  const [state, action, pending] = useActionState(
    async () => publishAction(),
    IDLE,
  );

  return (
    <form action={action} className={styles.form}>
      <p className={styles.body}>
        Publishing makes your portal visible to patients at <code>{portalUrl}</code>. Until you
        publish, nothing you have changed here is public.
      </p>

      <button type="submit" className={styles.primary} disabled={pending}>
        {pending ? 'Publishing…' : 'Publish my portal'}
      </button>

      {state.message ? (
        <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p>
      ) : null}
    </form>
  );
}
