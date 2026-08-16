import Link from 'next/link';
import type { QueueItem } from '@nexuvi/api-contracts';

import { formatDuration, severityVar } from '../../lib/format';
import { Pill } from '../ui/Pill';
import styles from './AttentionTable.module.css';

/** Minutes in a single step past which the facility counts the item as breaching target. */
const OVERDUE_MINUTES = 60;

const SEVERITY_LABELS = {
  critical: 'Critical',
  high: 'High',
  warning: 'Watch',
  info: 'Info',
  normal: 'Normal',
} as const;

/**
 * The work an operations lead should act on now.
 *
 * A real `<table>`, not a grid of divs — these rows are tabular data, and screen-reader
 * users navigating by column need the header association that only a table gives them.
 */
export function AttentionTable({ items }: { items: readonly QueueItem[] }) {
  if (items.length === 0) {
    return (
      <p className={styles.empty}>
        Nothing is waiting past its target. The queue is clear.
      </p>
    );
  }

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Encounter</th>
            <th scope="col">Patient</th>
            <th scope="col">Step</th>
            <th scope="col">Waiting</th>
            <th scope="col">Assigned to</th>
            <th scope="col">Reason</th>
            <th scope="col">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const overdue = item.waitingMinutes > OVERDUE_MINUTES;
            return (
              <tr key={item.id}>
                <td>
                  <span
                    className={styles.stripe}
                    style={{ background: severityVar(item.severity) }}
                    aria-hidden="true"
                  />
                  <span className={styles.reference}>{item.reference}</span>
                </td>
                <td>
                  <span className={styles.patient}>{item.patientName}</span>
                  <span className={styles.patientId}>{item.patientId}</span>
                </td>
                <td className={styles.muted}>{item.step}</td>
                <td>
                  <span
                    className={`${styles.waiting} tabular`}
                    data-overdue={overdue ? 'true' : undefined}
                  >
                    {formatDuration(item.waitingMinutes)}
                  </span>
                </td>
                <td className={styles.muted}>
                  {item.assignee ?? <span className={styles.unassigned}>Unassigned</span>}
                </td>
                <td>
                  <Pill severity={item.severity}>{SEVERITY_LABELS[item.severity]}</Pill>
                  <span className={styles.reason}>{item.reason}</span>
                </td>
                <td className={styles.actionCell}>
                  <Link
                    href={`/encounters/${item.reference}`}
                    className={styles.action}
                    aria-label={`Review ${item.reference} for ${item.patientName}`}
                  >
                    Review
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
