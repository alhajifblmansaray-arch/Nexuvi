import { ApiError, listClinics } from '../../lib/api';
import { NewClinicForm } from './NewClinicForm';
import { OperatorSignIn } from './OperatorSignIn';
import { operatorSignOutAction } from './actions';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

/**
 * The operator console.
 *
 * Everything the platform does *across* customers lives here, and nothing that reaches
 * inside one. An operator can see that a clinic exists and hand its administrator a way
 * in; they cannot open a patient record, and the API would refuse if this page asked.
 */
export default async function PlatformPage() {
  let clinics;
  try {
    clinics = await listClinics();
  } catch (error) {
    // 401 is "no session", 403 is "signed in as somebody who is not an operator". Both
    // mean the same thing to the person here: sign in with the operator key.
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return <OperatorSignIn />;
    }
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <h1 className={styles.title}>Nexuvi</h1>
          <p className={styles.error} role="alert">
            Could not reach the platform API.{' '}
            {error instanceof ApiError ? error.message : 'Try again in a moment.'}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Nexuvi</p>
            <h1 className={styles.title}>Clinics</h1>
          </div>
          <form action={operatorSignOutAction}>
            <button type="submit" className={styles.ghost}>Sign out</button>
          </form>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Add a clinic</h2>
          <NewClinicForm />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {clinics.length} {clinics.length === 1 ? 'clinic' : 'clinics'}
          </h2>

          {clinics.length === 0 ? (
            <p className={styles.empty}>No clinics yet. Add the first one above.</p>
          ) : (
            <ul className={styles.list}>
              {clinics.map((clinic) => (
                <li key={clinic.tenantId} className={styles.row}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowName}>{clinic.legalName}</span>
                    <span className={styles.rowMeta}>
                      {clinic.slug}
                      {clinic.plan ? ` · ${clinic.plan}` : ''}
                      {clinic.status === 'suspended' ? ' · suspended' : ''}
                    </span>
                  </div>
                  <div className={styles.rowLinks}>
                    <a className={styles.link} href={clinic.staffUrl} target="_blank" rel="noreferrer">
                      Staff
                    </a>
                    {clinic.portalUrl ? (
                      <a className={styles.link} href={clinic.portalUrl} target="_blank" rel="noreferrer">
                        Patients
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
