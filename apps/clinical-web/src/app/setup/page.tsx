import { cookies } from 'next/headers';

import { AcceptForm, BrandForm, PublishForm } from './SetupForms';
import { STAFF_TOKEN_COOKIE } from './constants';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

interface InvitePreview {
  clinicName: string;
  email: string;
  displayName: string;
  roles: string[];
  invitedByName: string;
}

/**
 * First-run setup.
 *
 * Two states rather than a wizard with progress bars: either you are holding an
 * invitation and have no account yet, or you have an account and are configuring the
 * clinic. A clinic administrator does this once, and a multi-step wizard for three fields
 * is ceremony.
 */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const inviteToken = typeof params.invite === 'string' ? params.invite : undefined;
  const session = (await cookies()).get(STAFF_TOKEN_COOKIE)?.value;

  if (!session && inviteToken) {
    return <AcceptStep token={inviteToken} />;
  }
  if (!session) {
    return (
      <Shell title="Set up your clinic">
        <p className={styles.body}>
          Open the setup link your Nexuvi contact sent you. If it has expired, ask them to send
          another — links are valid for seven days.
        </p>
      </Shell>
    );
  }

  return <ConfigureStep token={session} />;
}

async function AcceptStep({ token }: { token: string }) {
  let preview: InvitePreview | null = null;
  let error: string | null = null;

  try {
    const response = await fetch(`${API_URL}/identity/invite?token=${encodeURIComponent(token)}`, {
      cache: 'no-store',
    });
    const body = await response.json();
    if (!response.ok) error = body.detail ?? 'This invitation link is not valid.';
    else preview = body as InvitePreview;
  } catch {
    error = 'Could not reach Nexuvi. Try again in a moment.';
  }

  if (!preview) {
    return (
      <Shell title="Set up your clinic">
        <p className={styles.error} role="alert">{error}</p>
      </Shell>
    );
  }

  return (
    <Shell title={`Join ${preview.clinicName}`}>
      {/*
        Names the clinic and the role before anything else. Accepting is agreeing to hold
        clinical access at a named organisation, and a screen that says only "set your
        password" gives nobody a chance to notice they were sent the wrong link.
      */}
      <dl className={styles.facts}>
        <div><dt>Organisation</dt><dd>{preview.clinicName}</dd></div>
        <div><dt>Your account</dt><dd>{preview.email}</dd></div>
        <div><dt>Role</dt><dd>{preview.roles.join(', ')}</dd></div>
        <div><dt>Invited by</dt><dd>{preview.invitedByName}</dd></div>
      </dl>

      <AcceptForm token={token} />
    </Shell>
  );
}

async function ConfigureStep({ token }: { token: string }) {
  const response = await fetch(`${API_URL}/tenant-config/draft`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    return (
      <Shell title="Set up your clinic">
        <p className={styles.error} role="alert">
          Your session has expired. Open your setup link again.
        </p>
      </Shell>
    );
  }

  const draft = await response.json();
  const host = draft.domains?.[0]?.host ?? 'your portal address';

  return (
    <Shell title={draft.profile.displayName}>
      <p className={styles.body}>
        Everything below is a draft. Patients see nothing until you publish.
      </p>

      <section className={styles.step}>
        <h2 className={styles.h2}>How your portal looks</h2>
        <BrandForm
          primary={draft.branding.primary ?? ''}
          typeface={draft.branding.typeface ?? 'system'}
          tagline={draft.profile.tagline ?? ''}
          phone={draft.profile.phone ?? ''}
          emergencyNotice={draft.profile.emergencyNotice ?? ''}
        />
      </section>

      <section className={styles.step}>
        <h2 className={styles.h2}>Go live</h2>
        <PublishForm portalUrl={host} />
      </section>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <header className={styles.header}>
          <span className={styles.mark} aria-hidden="true">N</span>
          <div>
            <p className={styles.eyebrow}>Nexuvi setup</p>
            <h1 className={styles.h1}>{title}</h1>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
