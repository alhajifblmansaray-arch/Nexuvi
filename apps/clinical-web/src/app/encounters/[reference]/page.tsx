import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { AuditEvent } from '@nexuvi/api-contracts';

import { ApiError, getClinicians, getEncounter, getEncounterHistory } from '../../../lib/api';
import { formatDuration } from '../../../lib/format';
import { AppShell } from '../../../components/shell/AppShell';
import { Card } from '../../../components/ui/Card';
import { ApiErrorState } from '../../../components/ui/ApiErrorState';
import { ClinicalFlags, StatusPill } from '../../../components/ui/Pill';
import { AssignControl } from './AssignControl';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

/**
 * Labels for the actions that can appear on an *encounter's* history.
 *
 * Deliberately partial. `AuditAction` also covers platform actions such as
 * `tenant.provisioned`, which cannot occur against an encounter subject — inventing a
 * label for one here would document a state that never happens.
 */
const ACTION_LABELS: Partial<Record<AuditEvent['action'], string>> = {
  'encounter.assigned': 'Assigned',
  'encounter.reassigned': 'Reassigned',
  'encounter.unassigned': 'Unassigned',
  'encounter.status-changed': 'Status changed',
};

/** Falls back to the raw verb rather than rendering an empty heading. */
function actionLabel(action: AuditEvent['action']): string {
  return ACTION_LABELS[action] ?? action;
}

const TYPE_LABELS = {
  'clinic-visit': 'Clinic visit',
  telehealth: 'Telehealth',
  admission: 'Admission',
  'follow-up': 'Follow-up',
  emergency: 'Emergency',
} as const;

export default async function EncounterDetailPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;

  let encounter;
  let history: readonly AuditEvent[];
  let clinicians;

  try {
    // One round trip. The three reads are independent, so serialising them would just add
    // latency to a page that is already a single glance.
    [encounter, history, clinicians] = await Promise.all([
      getEncounter(reference),
      getEncounterHistory(reference),
      getClinicians(),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return (
      <AppShell title={reference} subtitle="Could not reach the core API">
        <ApiErrorState error={error} />
      </AppShell>
    );
  }

  const closed = encounter.status === 'completed' || encounter.status === 'cancelled';

  return (
    <AppShell
      title={encounter.patientName}
      subtitle={`${encounter.reference} · ${TYPE_LABELS[encounter.type]} · ${encounter.department}`}
      actions={
        <Link href="/encounters" className={styles.back}>
          ← All encounters
        </Link>
      }
    >
      <div className={styles.layout}>
        <div className={styles.column}>
          <Card title="Encounter">
            <dl className={styles.facts}>
              <div className={styles.fact}>
                <dt>Status</dt>
                <dd>
                  <StatusPill status={encounter.status} />
                </dd>
              </div>
              <div className={styles.fact}>
                <dt>Patient</dt>
                <dd>
                  {encounter.patientName}{' '}
                  <span className={styles.mono}>{encounter.patientId}</span>
                </dd>
              </div>
              <div className={styles.fact}>
                <dt>Age</dt>
                <dd className="tabular">{encounter.patientAge}</dd>
              </div>
              <div className={styles.fact}>
                <dt>Reason for visit</dt>
                <dd>{encounter.reasonForVisit}</dd>
              </div>
              <div className={styles.fact}>
                <dt>Clinician</dt>
                <dd>
                  {encounter.clinicianName ?? (
                    <span className={styles.unassigned}>Unassigned</span>
                  )}
                </dd>
              </div>
              <div className={styles.fact}>
                <dt>In current status</dt>
                <dd className="tabular">
                  {closed ? '—' : formatDuration(encounter.waitingMinutes)}
                </dd>
              </div>
            </dl>
          </Card>

          {/* Clinical flags get their own card rather than a row in the table above: they
              are the thing a clinician must not miss, and a definition list buries them. */}
          <Card title="Clinical flags" meta={`${encounter.flags.length}`}>
            {encounter.flags.length === 0 ? (
              <p className={styles.muted}>No allergies, critical results, or precautions recorded.</p>
            ) : (
              <ul className={styles.flagList}>
                {encounter.flags.map((flag) => (
                  <li key={`${flag.kind}-${flag.label}`} className={styles.flagRow}>
                    <ClinicalFlags flags={[flag]} />
                    {flag.detail ? <span className={styles.flagDetail}>{flag.detail}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className={styles.column}>
          <Card title="Assignment">
            <AssignControl
              reference={encounter.reference}
              currentClinicianId={encounter.clinicianId}
              clinicians={clinicians}
              locked={closed}
            />
          </Card>

          <Card title="Audit trail" meta={`${history.length} ${history.length === 1 ? 'entry' : 'entries'}`}>
            {history.length === 0 ? (
              <p className={styles.muted}>
                Nothing has changed on this encounter since it was created.
              </p>
            ) : (
              <ol className={styles.history}>
                {/* Newest first — the question is usually "what just happened". */}
                {[...history].reverse().map((entry) => (
                  <li key={entry.id} className={styles.historyRow}>
                    <div className={styles.historyHead}>
                      <span className={styles.historyAction}>{actionLabel(entry.action)}</span>
                      <time className={styles.historyTime} dateTime={entry.occurredAt}>
                        {new Date(entry.occurredAt).toLocaleString('en-GB', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </time>
                    </div>
                    <p className={styles.historyActor}>
                      {entry.actor.displayName} · {entry.actor.role}
                    </p>
                    {entry.changes
                      .filter((change) => change.field === 'clinicianName')
                      .map((change) => (
                        <p key={change.field} className={styles.historyChange}>
                          {change.from ?? 'Unassigned'} → {change.to ?? 'Unassigned'}
                        </p>
                      ))}
                    {entry.reason ? (
                      <p className={styles.historyReason}>“{entry.reason}”</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
