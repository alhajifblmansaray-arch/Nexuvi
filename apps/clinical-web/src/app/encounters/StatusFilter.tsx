'use client';

import Link from 'next/link';
import type { EncounterStatus } from '@nexuvi/api-contracts';

import styles from './StatusFilter.module.css';

const LABELS: Record<EncounterStatus, string> = {
  scheduled: 'Scheduled',
  'checked-in': 'Checked in',
  'in-progress': 'In progress',
  'awaiting-review': 'Awaiting review',
  blocked: 'Blocked',
  'on-hold': 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * Status filter.
 *
 * Built from links rather than a `<select>` and a router push: each filter is a real URL,
 * so it can be bookmarked, shared with a colleague, and opened in a second tab. That
 * matters more here than saving a few pixels — "the blocked list" is a thing people send
 * each other.
 */
export function StatusFilter({
  statuses,
  active,
}: {
  readonly statuses: readonly EncounterStatus[];
  readonly active: EncounterStatus | null;
}) {
  return (
    <nav className={styles.filter} aria-label="Filter by status">
      <Link
        href="/encounters"
        className={active === null ? `${styles.chip} ${styles.chipActive}` : styles.chip}
        aria-current={active === null ? 'true' : undefined}
      >
        All
      </Link>
      {statuses.map((status) => (
        <Link
          key={status}
          href={`/encounters?status=${status}`}
          className={active === status ? `${styles.chip} ${styles.chipActive}` : styles.chip}
          aria-current={active === status ? 'true' : undefined}
        >
          {LABELS[status]}
        </Link>
      ))}
    </nav>
  );
}
