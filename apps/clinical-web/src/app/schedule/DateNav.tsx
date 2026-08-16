'use client';

import Link from 'next/link';

import styles from './Controls.module.css';

/** Shift an ISO date by whole days without tripping over local timezones. */
function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function DateNav({
  date,
  facilitySlug,
}: {
  readonly date: string;
  readonly facilitySlug: string;
}) {
  const href = (d: string) => `/schedule?facility=${facilitySlug}&date=${d}`;
  const today = new Date().toISOString().slice(0, 10);

  const label = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

  return (
    <div className={styles.dateNav}>
      <Link href={href(shiftDate(date, -1))} className={styles.step} aria-label="Previous day">
        ←
      </Link>
      <span className={styles.date}>{label}</span>
      <Link href={href(shiftDate(date, 1))} className={styles.step} aria-label="Next day">
        →
      </Link>
      {date === today ? null : (
        <Link href={href(today)} className={styles.today}>
          Today
        </Link>
      )}
    </div>
  );
}
