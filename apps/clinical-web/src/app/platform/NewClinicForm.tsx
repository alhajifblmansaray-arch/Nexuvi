'use client';

import { useActionState, useState } from 'react';

import { createClinicAction, type CreateClinicResult } from './actions';
import styles from './page.module.css';

const IDLE: CreateClinicResult = { ok: true };

const TEMPLATES = [
  { value: 'primary-care', label: 'Primary care' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'dental', label: 'Dental' },
  { value: 'pharmacy', label: 'Pharmacy' },
];

/**
 * Plans, described by what the clinic gets rather than by tier name.
 *
 * The portal is the line that matters here: on Essentials a clinic has no patient-facing
 * surface at all, so provisioning one issues no portal address. An operator choosing a
 * plan should see that, not discover it when the customer asks for their patient link.
 */
const PLANS = [
  { value: 'practice', label: 'Practice — staff + patient portal' },
  { value: 'essentials', label: 'Essentials — staff only, no patient portal' },
  { value: 'enterprise', label: 'Enterprise — adds wards, pharmacy, billing' },
];

const COUNTRIES = [
  { value: 'cell_sl', label: 'Sierra Leone' },
  { value: 'cell_gh', label: 'Ghana' },
];

/** Turns a clinic's name into the address patients will bookmark. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Apostrophes are dropped, not separated: "Children's" reads as `childrens`, which is
    // how a person would write it down. Treating them as punctuation gives `children-s`.
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 62)
    .replace(/-+$/, '');
}

export function NewClinicForm() {
  const [state, action, pending] = useActionState(createClinicAction, IDLE);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  // Until the operator types an address themselves, it follows the name.
  const [slugTouched, setSlugTouched] = useState(false);
  const effectiveSlug = slugTouched ? slug : slugify(name);

  if (state.created) {
    const c = state.created;
    return (
      <div className={styles.result} role="status">
        <p className={styles.resultTitle}>{c.name} is live</p>

        <dl className={styles.resultList}>
          <div className={styles.resultRow}>
            <dt className={styles.resultKey}>Staff</dt>
            <dd className={styles.resultValue}><code>{c.staffUrl}</code></dd>
          </div>
          {c.portalUrl ? (
            <div className={styles.resultRow}>
              <dt className={styles.resultKey}>Patients</dt>
              <dd className={styles.resultValue}><code>{c.portalUrl}</code></dd>
            </div>
          ) : null}
        </dl>

        <p className={styles.resultLabel}>
          Send this to their administrator — it is the only way in, and it is shown once.
        </p>
        <code className={styles.setupLink}>{c.setupUrl}</code>
        <p className={styles.resultExpiry}>
          Expires {new Date(c.inviteExpiresAt).toLocaleString()}
        </p>

        <button type="button" className={styles.ghost} onClick={() => window.location.reload()}>
          Add another
        </button>
      </div>
    );
  }

  return (
    <form action={action} className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>Clinic name</span>
        <input
          className={styles.input}
          name="legalName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Freetown Family Clinic"
          required
          maxLength={200}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Web address</span>
        <input
          className={styles.input}
          name="slug"
          value={effectiveSlug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(slugify(e.target.value));
          }}
          required
        />
        <span className={styles.hint}>
          {effectiveSlug
            ? `${effectiveSlug}.nexuvi.health for patients · ${effectiveSlug}-app.nexuvi.health for staff`
            : 'Patients will bookmark this. It cannot be changed later.'}
        </span>
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Administrator name</span>
          <input className={styles.input} name="adminName" required maxLength={120} />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Administrator email</span>
          <input className={styles.input} type="email" name="adminEmail" required />
        </label>
      </div>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Plan</span>
          <select className={styles.input} name="plan" defaultValue="practice">
            {PLANS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Kind</span>
          <select className={styles.input} name="template" defaultValue="primary-care">
            {TEMPLATES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>City</span>
          <input className={styles.input} name="city" placeholder="Freetown" maxLength={120} />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Data stays in</span>
          <select className={styles.input} name="countryCellId" defaultValue="cell_sl">
            {COUNTRIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <span className={styles.hint}>Cannot be changed later.</span>
        </label>
      </div>

      <button type="submit" className={styles.primary} disabled={pending}>
        {pending ? 'Creating…' : 'Create clinic'}
      </button>

      {state.message ? <p className={styles.error} role="alert">{state.message}</p> : null}
    </form>
  );
}
