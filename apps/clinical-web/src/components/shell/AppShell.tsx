import type { ReactNode } from 'react';

import { Sidebar } from './Sidebar';
import { SessionCard } from './SessionCard';
import { getClinicBrand } from '../../lib/session';
import styles from './AppShell.module.css';

interface AppShellProps {
  readonly title: string;
  readonly subtitle?: string;
  /** Rendered at the top right — filters, refresh state, primary actions. */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

export async function AppShell({ title, subtitle, actions, children }: AppShellProps) {
  // The clinic whose hostname this request arrived on. Hardcoding it was fine with one
  // customer and is a lie with two.
  const brand = await getClinicBrand();
  return (
    <div className={styles.shell}>
      {/* The card is a server component, passed through the client sidebar as a child so
          the session is read on the server and never shipped to the browser. */}
      <Sidebar session={<SessionCard />} clinicName={brand?.displayName ?? 'Nexuvi'} />
      <div className={styles.body}>
        <header className={styles.topbar}>
          <div className={styles.heading}>
            <h1 className={styles.title}>{title}</h1>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
