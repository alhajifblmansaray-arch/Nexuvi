import type { CategoryDatum } from '@nexuvi/api-contracts';

import { formatDuration, severityVar } from '../../lib/format';
import styles from './BarList.module.css';

interface BarListProps {
  readonly data: readonly CategoryDatum[];
  /** How the trailing figure is rendered. `duration` reads the value as minutes. */
  readonly valueAs?: 'count' | 'duration';
  /** Show each row's share of the total beside the value. */
  readonly showShare?: boolean;
  /**
   * Draw proportional bars. Turn this off when one category legitimately dwarfs the rest —
   * a distribution where the top row is twenty times the next leaves every other bar a
   * one-pixel sliver, which reads as "no data" rather than "small". A severity dot and the
   * figures alone carry that comparison better.
   */
  readonly bars?: boolean;
  readonly emptyMessage?: string;
}

/**
 * Horizontal bar list — a label, a proportional bar, and a figure.
 *
 * Bars are scaled against the largest row rather than the total, because the question this
 * chart answers is "which of these is biggest", and scaling to the total leaves every bar
 * short and hard to compare when there are many categories.
 */
export function BarList({
  data,
  valueAs = 'count',
  showShare = false,
  bars = true,
  emptyMessage = 'Nothing queued.',
}: BarListProps) {
  if (data.length === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <ul className={bars ? styles.list : `${styles.list} ${styles.listPlain}`}>
      {data.map((datum) => (
        <li key={datum.key} className={bars ? styles.row : styles.rowPlain}>
          {bars ? null : (
            <span
              className={styles.dot}
              style={{ background: severityVar(datum.severity ?? 'normal') }}
              aria-hidden="true"
            />
          )}

          <span className={styles.label} title={datum.label}>
            {datum.label}
          </span>

          {bars ? (
            <span className={styles.track}>
              <span
                className={styles.bar}
                style={{
                  width: `${Math.max((datum.value / max) * 100, 1.5)}%`,
                  background: severityVar(datum.severity ?? 'normal'),
                }}
              />
            </span>
          ) : null}

          <span className={`${styles.value} tabular`}>
            {valueAs === 'duration' ? formatDuration(datum.value) : datum.value}
            {showShare ? (
              <span className={styles.share}>{Math.round(datum.share * 100)}%</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
