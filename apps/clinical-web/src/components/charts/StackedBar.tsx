import type { CategoryDatum } from '@nexuvi/api-contracts';

import { severityVar } from '../../lib/format';
import styles from './StackedBar.module.css';

interface StackedBarProps {
  readonly data: readonly CategoryDatum[];
  readonly totalLabel?: string;
}

/**
 * Single stacked bar with a legend beneath.
 *
 * Segment labels live in the legend rather than inside the segments: a narrow segment
 * either clips its text or forces the whole bar taller to fit it, and both are worse than
 * a legend the reader scans once.
 */
export function StackedBar({ data, totalLabel = 'Total' }: StackedBarProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return <p className={styles.empty}>None recorded in this window.</p>;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.bar} role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join(', ')}>
        {data.map((datum) => (
          <span
            key={datum.key}
            className={styles.segment}
            style={{
              flexGrow: datum.value,
              background: severityVar(datum.severity ?? 'normal'),
            }}
          />
        ))}
      </div>

      <ul className={styles.legend}>
        {data.map((datum) => (
          <li key={datum.key} className={styles.legendRow}>
            <span
              className={styles.swatch}
              style={{ background: severityVar(datum.severity ?? 'normal') }}
              aria-hidden="true"
            />
            <span className={styles.legendLabel}>{datum.label}</span>
            <span className={`${styles.legendValue} tabular`}>
              {datum.value}
              <span className={styles.legendShare}>{Math.round(datum.share * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>

      <div className={styles.total}>
        <span>{totalLabel}</span>
        <span className="tabular">{total}</span>
      </div>
    </div>
  );
}
