import type {
  ClinicianAvailability,
  IntegrationStatus,
  OperationalAlert,
  Severity,
} from '@nexuvi/api-contracts';

import { formatRelative, severityVar } from '../../lib/format';
import styles from './Panels.module.css';

/**
 * The three side panels.
 *
 * They share a stylesheet because they are the same object — a status dot, a two-line
 * label, and a trailing figure. Splitting them into three near-identical modules would
 * mean three places to keep in sync when the row spacing changes.
 */

const INTEGRATION_SEVERITY: Record<IntegrationStatus['state'], Severity> = {
  healthy: 'normal',
  degraded: 'warning',
  failing: 'critical',
};

const INTEGRATION_LABEL: Record<IntegrationStatus['state'], string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  failing: 'Failing',
};

export function IntegrationList({
  integrations,
  now,
}: {
  readonly integrations: readonly IntegrationStatus[];
  readonly now: Date;
}) {
  return (
    <ul className={styles.list}>
      {integrations.map((integration) => {
        const severity = INTEGRATION_SEVERITY[integration.state];
        return (
          <li key={integration.key} className={styles.row}>
            <span
              className={styles.dot}
              style={{ background: severityVar(severity) }}
              aria-hidden="true"
            />
            <span className={styles.text}>
              <span className={styles.primary}>{integration.label}</span>
              <span className={styles.secondary}>
                {integration.detail ?? `Last sync ${formatRelative(integration.lastSyncAt, now)}`}
              </span>
            </span>
            <span className={styles.trailing}>
              <span className={styles.state} style={{ color: severityVar(severity) }}>
                {INTEGRATION_LABEL[integration.state]}
              </span>
              {integration.pendingCount > 0 ? (
                <span className={`${styles.pending} tabular`}>{integration.pendingCount} queued</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function AlertList({
  alerts,
  now,
}: {
  readonly alerts: readonly OperationalAlert[];
  readonly now: Date;
}) {
  if (alerts.length === 0) {
    return <p className={styles.empty}>No alerts raised today.</p>;
  }

  return (
    <ul className={styles.list}>
      {alerts.map((alert) => (
        <li key={alert.id} className={styles.row}>
          <span
            className={styles.dot}
            style={{ background: severityVar(alert.severity) }}
            aria-hidden="true"
          />
          <span className={styles.text}>
            <span className={styles.primary}>{alert.title}</span>
            <span className={styles.secondaryWrap}>{alert.detail}</span>
          </span>
          <span className={styles.trailing}>
            <time className={styles.time} dateTime={alert.raisedAt}>
              {formatRelative(alert.raisedAt, now)}
            </time>
          </span>
        </li>
      ))}
    </ul>
  );
}

const CLINICIAN_SEVERITY: Record<ClinicianAvailability['state'], Severity> = {
  available: 'normal',
  'with-patient': 'info',
  'off-shift': 'normal',
};

const CLINICIAN_LABEL: Record<ClinicianAvailability['state'], string> = {
  available: 'Available',
  'with-patient': 'With patient',
  'off-shift': 'Off shift',
};

export function ClinicianList({
  clinicians,
}: {
  readonly clinicians: readonly ClinicianAvailability[];
}) {
  const available = clinicians.filter((c) => c.state === 'available').length;

  return (
    <>
      <p className={styles.summary}>
        <strong className="tabular">{available}</strong> of {clinicians.length} available now
      </p>
      <ul className={styles.list}>
        {clinicians.map((clinician) => (
          <li key={clinician.id} className={styles.row} data-dimmed={clinician.state === 'off-shift'}>
            <span
              className={styles.dot}
              style={{
                background:
                  clinician.state === 'available'
                    ? 'var(--nx-color-status-success)'
                    : severityVar(CLINICIAN_SEVERITY[clinician.state]),
              }}
              aria-hidden="true"
            />
            <span className={styles.text}>
              <span className={styles.primary}>{clinician.name}</span>
              <span className={styles.secondary}>
                {clinician.detail ?? clinician.role}
              </span>
            </span>
            <span className={styles.trailing}>
              <span className={styles.state}>{CLINICIAN_LABEL[clinician.state]}</span>
              {clinician.activeEncounters > 0 ? (
                <span className={`${styles.pending} tabular`}>
                  {clinician.activeEncounters} active
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
