import { getClinicBrand } from '../../lib/session';
import { SignInForm } from './SignInForm';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawNext = typeof params.next === 'string' ? params.next : '/';
  // Only relative paths survive. An open redirect on a login form is a phishing
  // primitive: the victim signs in to the real system and lands where an attacker chose.
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  const brand = await getClinicBrand();

  return (
    <div className={styles.page} data-tenant-theme={brand?.themeKey}>
      {brand ? <style dangerouslySetInnerHTML={{ __html: brand.stylesheet }} /> : null}

      {/*
        The clinic's own panel. An unbranded login box is indistinguishable from a phishing
        page, and a clinician who works at two customers needs to see which one they are
        entering before they type anything.
      */}
      <section className={styles.brandPanel}>
        <div className={styles.brandInner}>
          <span className={styles.wordmark}>Nexuvi</span>

          <div className={styles.brandBody}>
            <p className={styles.eyebrow}>Clinical workspace</p>
            <h1 className={styles.brandTitle}>
              {brand?.displayName ?? 'Your clinic'}
            </h1>
            {brand?.tagline ? <p className={styles.brandTagline}>{brand.tagline}</p> : null}
          </div>

          <p className={styles.brandFooter}>
            This system holds patient records. Do not share your password, and lock your
            screen when you step away.
          </p>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Welcome back</h2>
          <SignInForm next={next} />

          <div className={styles.cardFooter}>
            {/*
              No "Sign up". Staff do not self-register at a clinic — they are invited, and
              a self-service route into a clinical system is a route to unauthorised
              accounts. Anyone without access needs an administrator, not a form.
            */}
            <p className={styles.help}>
              No account? Your clinic administrator can invite you.
            </p>
            <p className={styles.help}>
              Forgotten your password? Ask an administrator to send you a new invitation.
            </p>
          </div>
        </div>

        <footer className={styles.pageFooter}>
          {brand?.phone ? <span>{brand.displayName} · {brand.phone}</span> : <span>Nexuvi</span>}
        </footer>
      </section>
    </div>
  );
}
