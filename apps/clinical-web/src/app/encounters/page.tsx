import Link from 'next/link';
import type { EncounterQuery, EncounterStatus } from '@nexuvi/api-contracts';

import { getEncounters } from '../../lib/api';
import { formatDuration } from '../../lib/format';
import { AppShell } from '../../components/shell/AppShell';
import { Card } from '../../components/ui/Card';
import { ApiErrorState } from '../../components/ui/ApiErrorState';
import { ClinicalFlags, StatusPill } from '../../components/ui/Pill';
import { StatusFilter } from './StatusFilter';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: readonly EncounterStatus[] = [
  'scheduled',
  'checked-in',
  'in-progress',
  'awaiting-review',
  'blocked',
  'on-hold',
  'completed',
  'cancelled',
];

/** Minutes past which a wait is called out in the list. */
const OVERDUE_MINUTES = 60;

export default async function EncountersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawStatus = typeof params.status === 'string' ? params.status : undefined;

  // An unrecognised status in the URL falls through to the unfiltered list rather than
  // erroring — a stale bookmark should still show something useful.
  const status = VALID_STATUSES.includes(rawStatus as EncounterStatus)
    ? (rawStatus as EncounterStatus)
    : undefined;

  const query: EncounterQuery = status ? { status, pageSize: 50 } : { pageSize: 50 };

  let result;
  try {
    result = await getEncounters(query);
  } catch (error) {
    return (
      <AppShell title="Encounters" subtitle="Could not reach the core API">
        <ApiErrorState error={error} />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Encounters"
      subtitle={`${result.total} matching ${result.total === 1 ? 'encounter' : 'encounters'}`}
      actions={<StatusFilter statuses={VALID_STATUSES} active={status ?? null} />}
    >
      <Card flush>
        {result.items.length === 0 ? (
          <p className={styles.empty}>No encounters match this filter.</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Encounter</th>
                  <th scope="col">Patient</th>
                  <th scope="col">Age</th>
                  <th scope="col">Department</th>
                  <th scope="col">Clinician</th>
                  <th scope="col">Status</th>
                  <th scope="col">Waiting</th>
                  <th scope="col">Clinical flags</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((encounter) => {
                  const terminal =
                    encounter.status === 'completed' || encounter.status === 'cancelled';
                  return (
                    <tr key={encounter.id} data-terminal={terminal ? 'true' : undefined}>
                      <td>
                        <Link href={`/encounters/${encounter.reference}`} className={styles.reference}>
                          {encounter.reference}
                        </Link>
                        <span className={styles.reason}>{encounter.reasonForVisit}</span>
                      </td>
                      <td>
                        <span className={styles.patient}>{encounter.patientName}</span>
                        <span className={styles.patientId}>{encounter.patientId}</span>
                      </td>
                      <td className="tabular">{encounter.patientAge}</td>
                      <td className={styles.muted}>{encounter.department}</td>
                      <td className={styles.muted}>
                        {encounter.clinicianName ?? (
                          <span className={styles.unassigned}>Unassigned</span>
                        )}
                      </td>
                      <td>
                        <StatusPill status={encounter.status} />
                      </td>
                      <td>
                        {terminal ? (
                          <span className={styles.muted}>—</span>
                        ) : (
                          <span
                            className={`${styles.waiting} tabular`}
                            data-overdue={
                              encounter.waitingMinutes > OVERDUE_MINUTES ? 'true' : undefined
                            }
                          >
                            {formatDuration(encounter.waitingMinutes)}
                          </span>
                        )}
                      </td>
                      <td>
                        <ClinicalFlags flags={encounter.flags} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
