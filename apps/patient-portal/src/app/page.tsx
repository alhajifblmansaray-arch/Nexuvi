import type { PortalOverview, PortalSection, ResolvedPortalBrand } from '@nexuvi/api-contracts';

import { PortalApiError, getBrand, getOverview } from '../lib/api';
import { signOutAction } from './actions';
import { SignInForm } from './SignInForm';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function PortalHome() {
  let brand: ResolvedPortalBrand;
  try {
    brand = await getBrand();
  } catch {
    return null; // The layout already rendered the "not a clinic portal" state.
  }

  let overview: PortalOverview | null = null;
  try {
    overview = await getOverview();
  } catch (error) {
    // 401/403 simply means "not signed in yet" — the sign-in screen is the answer, not an
    // error page. Anything else is a genuine fault and should say so.
    if (!(error instanceof PortalApiError) || (error.status !== 401 && error.status !== 403)) {
      throw error;
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.identity}>
            {brand.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={brand.logoUrl} alt="" className={styles.logo} />
            ) : (
              <span className={styles.mark} aria-hidden="true">
                {brand.profile.displayName.charAt(0)}
              </span>
            )}
            <div>
              <p className={styles.clinicName}>{brand.profile.displayName}</p>
              {brand.profile.tagline ? (
                <p className={styles.tagline}>{brand.profile.tagline}</p>
              ) : null}
            </div>
          </div>

          {overview ? (
            <form action={signOutAction}>
              <button type="submit" className={styles.linkButton}>
                Sign out
              </button>
            </form>
          ) : null}
        </div>
      </header>

      {/*
        The emergency notice sits outside the branded content and above everything else.
        It is the one thing on this page that must be read by someone who is scrolling
        past everything else because they are frightened.
      */}
      {brand.profile.emergencyNotice ? (
        <p className={styles.emergency} role="note">
          {brand.profile.emergencyNotice}
        </p>
      ) : null}

      <main className={styles.main}>
        {overview ? (
          <SignedIn overview={overview} brand={brand} />
        ) : (
          <SignedOut brand={brand} />
        )}
      </main>

      <footer className={styles.footer}>
        <p>{brand.profile.displayName}</p>
        {brand.profile.addressLines?.length ? (
          <p>{brand.profile.addressLines.join(', ')}</p>
        ) : null}
        {brand.profile.phone ? <p>{brand.profile.phone}</p> : null}
        {/* Deliberately outside the tenant theme scope — the platform's own attribution. */}
        <p className={styles.platform}>Powered by Nexuvi</p>
      </footer>
    </div>
  );
}

function SignedOut({ brand }: { brand: ResolvedPortalBrand }) {
  return (
    <div className={styles.signInLayout}>
      <section className={styles.card}>
        <h1 className={styles.h1}>{brand.portal.welcomeHeading ?? 'Patient portal'}</h1>
        {brand.portal.welcomeBody ? <p className={styles.lede}>{brand.portal.welcomeBody}</p> : null}
        <SignInForm />
        <p className={styles.note}>
          No password is checked in this preview. Sign-in through your clinic&rsquo;s identity
          provider is not connected yet.
        </p>
      </section>

      <aside className={styles.card}>
        <h2 className={styles.h2}>Contact</h2>
        {brand.profile.about ? <p className={styles.body}>{brand.profile.about}</p> : null}
        {brand.profile.openingHours?.length ? (
          <dl className={styles.hours}>
            {brand.profile.openingHours.map((entry) => (
              <div key={entry.day} className={styles.hoursRow}>
                <dt>{entry.day}</dt>
                <dd>{entry.hours}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </aside>
    </div>
  );
}

function SignedIn({
  overview,
  brand,
}: {
  overview: PortalOverview;
  brand: ResolvedPortalBrand;
}) {
  const enabled = new Set<PortalSection>(brand.portal.sections);

  return (
    <>
      <h1 className={styles.h1}>Hello, {overview.patient.givenName}</h1>
      <p className={styles.recordNumber}>
        Your record number is <strong>{overview.patient.recordNumber}</strong>
      </p>

      {/*
        Allergies are shown with the locked clinical tokens — identical at every clinic on
        the platform. A patient noticing a missing or wrong allergy is a real correction
        path, and a gap the record knows about and the patient does not is a safety gap.
      */}
      {overview.patient.allergies.length > 0 ? (
        <section className={styles.allergies} aria-label="Allergies on your record">
          <h2 className={styles.allergyHeading}>Allergies on your record</h2>
          <ul className={styles.allergyList}>
            {overview.patient.allergies.map((allergy) => (
              <li key={allergy}>{allergy}</li>
            ))}
          </ul>
          <p className={styles.allergyNote}>
            If anything here is wrong or missing, tell reception before your next appointment.
          </p>
        </section>
      ) : null}

      {enabled.has('appointments') ? (
        <section className={styles.card}>
          <h2 className={styles.h2}>Appointments</h2>
          {overview.upcoming.length === 0 ? (
            <p className={styles.body}>
              {brand.portal.bookingInstructions ?? 'You have no upcoming appointments.'}
            </p>
          ) : (
            <ul className={styles.list}>
              {overview.upcoming.map((appointment) => (
                <li key={appointment.id} className={styles.listRow}>
                  <div>
                    <p className={styles.rowTitle}>{appointment.serviceLabel}</p>
                    <p className={styles.rowMeta}>
                      {formatDateTime(appointment.startsAt)}
                      {appointment.clinicianName ? ` · ${appointment.clinicianName}` : ''}
                    </p>
                    <p className={styles.rowMeta}>{appointment.facilityName}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {enabled.has('results') ? (
        <section className={styles.card}>
          <h2 className={styles.h2}>Results</h2>

          {/*
            The withheld count is stated plainly. A portal that silently omitted these
            would leave a patient believing they had seen everything.
          */}
          {overview.resultsAwaitingReview > 0 ? (
            <p className={styles.pending}>
              {overview.resultsAwaitingReview === 1
                ? '1 result is with your care team for review.'
                : `${overview.resultsAwaitingReview} results are with your care team for review.`}{' '}
              You will be able to see them here once a clinician has looked at them.
            </p>
          ) : null}

          {overview.results.length === 0 ? (
            <p className={styles.body}>No results have been released yet.</p>
          ) : (
            <ul className={styles.list}>
              {overview.results.map((result) => (
                <li key={result.id} className={styles.listRow}>
                  <div>
                    <p className={styles.rowTitle}>{result.name}</p>
                    {result.summary ? <p className={styles.body}>{result.summary}</p> : null}
                    <p className={styles.rowMeta}>
                      {result.reportedAt ? formatDate(result.reportedAt) : ''}
                      {result.release === 'discussed' ? ' · discussed with you' : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {enabled.has('visits') ? (
        <section className={styles.card}>
          <h2 className={styles.h2}>Past visits</h2>
          {overview.recentVisits.length === 0 ? (
            <p className={styles.body}>No past visits recorded.</p>
          ) : (
            <ul className={styles.list}>
              {overview.recentVisits.map((visit) => (
                <li key={visit.id} className={styles.listRow}>
                  <div>
                    <p className={styles.rowTitle}>{visit.reason}</p>
                    <p className={styles.rowMeta}>
                      {formatDate(visit.date)} · {visit.department}
                      {visit.clinicianName ? ` · ${visit.clinicianName}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(new Date(iso));
}
