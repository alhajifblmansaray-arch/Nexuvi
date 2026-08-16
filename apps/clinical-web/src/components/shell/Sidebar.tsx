'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV_SECTIONS } from './nav-items';
import styles from './Sidebar.module.css';

/**
 * Primary navigation.
 *
 * A client component only because the active route drives the styling; everything else in
 * the shell renders on the server.
 */
export function Sidebar({ session, clinicName }: { session?: ReactNode; clinicName: string }) {
  const pathname = usePathname();

  return (
    <nav className={styles.sidebar} aria-label="Primary">
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden="true">
          N
        </span>
        <span className={styles.brandText}>
          <span className={styles.brandName}>Nexuvi</span>
          <span className={styles.brandOrg}>{clinicName}</span>
        </span>
      </div>

      <div className={styles.sections}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className={styles.section}>
            <h2 className={styles.sectionTitle}>{section.title}</h2>
            <ul className={styles.list}>
              {section.items.map((item) => {
                if (item.href === null) {
                  return (
                    <li key={item.label}>
                      <span className={styles.pending} aria-disabled="true">
                        {item.label}
                        <span className={styles.pendingTag}>soon</span>
                      </span>
                    </li>
                  );
                }

                const active = pathname === item.href;
                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className={active ? `${styles.link} ${styles.linkActive}` : styles.link}
                      aria-current={active ? 'page' : undefined}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {session}
    </nav>
  );
}
