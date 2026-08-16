import type { ClinicalFlag, EncounterStatus, Severity } from '@nexuvi/api-contracts';

import { severitySubtleVar, severityVar } from '../../lib/format';
import styles from './Pill.module.css';

/** A small labelled chip carrying operational state. */
export function Pill({ severity, children }: { severity: Severity; children: React.ReactNode }) {
  return (
    <span
      className={styles.pill}
      style={{
        ['--pill-fg' as string]: severityVar(severity),
        ['--pill-bg' as string]: severitySubtleVar(severity),
      }}
    >
      {children}
    </span>
  );
}

const STATUS_LABELS: Record<EncounterStatus, string> = {
  scheduled: 'Scheduled',
  'checked-in': 'Checked in',
  'in-progress': 'In progress',
  'awaiting-review': 'Awaiting review',
  blocked: 'Blocked',
  'on-hold': 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_SEVERITY: Record<EncounterStatus, Severity> = {
  scheduled: 'normal',
  'checked-in': 'normal',
  'in-progress': 'info',
  'awaiting-review': 'warning',
  blocked: 'critical',
  'on-hold': 'info',
  completed: 'normal',
  cancelled: 'normal',
};

export function StatusPill({ status }: { status: EncounterStatus }) {
  return <Pill severity={STATUS_SEVERITY[status]}>{STATUS_LABELS[status]}</Pill>;
}

/**
 * Patient-safety flags.
 *
 * Styled from the locked `clinical*` tokens, never from `status*` or tenant brand colour.
 * Blueprint §19.1: an allergy warning has to look the same in every clinic on the
 * platform, so a tenant's palette cannot reach it — and neither can the operational
 * severity scale used by everything else on this page.
 */
export function ClinicalFlags({ flags }: { flags: readonly ClinicalFlag[] }) {
  if (flags.length === 0) {
    return (
      <span className={styles.none} aria-label="No clinical flags">
        —
      </span>
    );
  }

  return (
    <span className={styles.flags}>
      {flags.map((flag) => (
        <span
          key={`${flag.kind}-${flag.label}`}
          className={styles.flag}
          data-kind={flag.kind}
          title={flag.detail ?? flag.label}
        >
          <span aria-hidden="true" className={styles.flagDot} />
          {flag.label}
        </span>
      ))}
    </span>
  );
}
