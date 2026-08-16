import type { MetricFormat, Severity } from '@nexuvi/api-contracts';

/**
 * Display formatting.
 *
 * Centralised because a duration rendered as "252" in one tile and "4h 12m" in another is
 * how a reader stops trusting the page. Every number on the dashboard passes through here.
 */

/** Fixed locale so server and client render identically and React sees no hydration drift. */
const LOCALE = 'en-GB';

const integerFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

/**
 * Minutes as a human duration: `8m`, `1h 12m`, `4h`.
 *
 * Hours are dropped when zero and minutes when zero, but never both — `0m` is a real
 * answer and rendering it as an empty string would read as missing data.
 */
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const leftoverHours = hours % 24;
    return leftoverHours === 0 ? `${days}d` : `${days}d ${leftoverHours}h`;
  }
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

export function formatMetric(value: number, format: MetricFormat, currency?: string): string {
  switch (format) {
    case 'integer':
      return integerFormatter.format(value);
    case 'currency':
      return new Intl.NumberFormat(LOCALE, {
        style: 'currency',
        currency: currency ?? 'USD',
        maximumFractionDigits: 0,
      }).format(value);
    case 'duration-minutes':
      return formatDuration(value);
    case 'percent':
      return `${Math.round(value * 10) / 10}%`;
  }
}

/** Signed percentage for trend captions: `+4.1%`, `−6.4%`. */
export function formatChange(changePercent: number): string {
  const rounded = Math.round(Math.abs(changePercent) * 10) / 10;
  // U+2212 MINUS SIGN, not a hyphen — it aligns with digits at these weights.
  const sign = changePercent < 0 ? '−' : '+';
  return `${sign}${rounded}%`;
}

/** Wall-clock time, e.g. `14:32`. */
export function formatClock(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

/** Short weekday for chart axes, e.g. `Mon`. */
export function formatWeekday(isoDate: string): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: 'short' }).format(new Date(isoDate));
}

/**
 * Elapsed time as a coarse relative phrase: `just now`, `34m ago`, `2h ago`.
 *
 * Deliberately coarse. Precision past the minute invites a reader to treat the dashboard
 * as a live feed, and it is a snapshot with a stated `generatedAt`.
 */
export function formatRelative(iso: string, from: Date): string {
  const minutes = Math.round((from.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  return `${formatDuration(minutes)} ago`;
}

/**
 * Maps an operational severity onto the semantic colour tokens.
 *
 * Note what is *not* here: `clinicalCritical` and the rest of the locked `clinical*` group.
 * Operational urgency and patient-safety signalling stay visually distinct (blueprint
 * §19.1) — a backlog must never borrow the colour reserved for patient harm. Clinical
 * flags carry their own styling in `ClinicalFlags`.
 */
export function severityVar(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return 'var(--nx-color-status-danger)';
    case 'high':
      return 'var(--nx-color-status-warning)';
    case 'warning':
      return 'var(--nx-color-status-warning)';
    case 'info':
      return 'var(--nx-color-status-info)';
    case 'normal':
      return 'var(--nx-color-text-muted)';
  }
}

export function severitySubtleVar(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return 'var(--nx-color-status-danger-subtle)';
    case 'high':
    case 'warning':
      return 'var(--nx-color-status-warning-subtle)';
    case 'info':
      return 'var(--nx-color-status-info-subtle)';
    case 'normal':
      return 'var(--nx-color-surface-sunken)';
  }
}
