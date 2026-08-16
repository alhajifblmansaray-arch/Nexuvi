'use client';

import Link from 'next/link';
import type { FacilitySummary } from '@nexuvi/api-contracts';

import styles from './Controls.module.css';

/**
 * Switch between connected sites.
 *
 * Links, not a dropdown with a router push: "Waterloo on Tuesday" is a URL an
 * administrator can bookmark or send to a colleague, and the date travels with the switch
 * so changing site does not silently drop you back to today.
 */
export function FacilitySwitcher({
  facilities,
  activeSlug,
  date,
}: {
  readonly facilities: readonly FacilitySummary[];
  readonly activeSlug: string;
  readonly date: string;
}) {
  return (
    <nav className={styles.chips} aria-label="Switch facility">
      {facilities.map((facility) => {
        const active = facility.slug === activeSlug;
        return (
          <Link
            key={facility.id}
            href={`/schedule?facility=${facility.slug}&date=${date}`}
            className={active ? `${styles.chip} ${styles.chipActive}` : styles.chip}
            aria-current={active ? 'true' : undefined}
            title={`${facility.name} — ${facility.city}`}
          >
            {facility.city}
          </Link>
        );
      })}
    </nav>
  );
}
