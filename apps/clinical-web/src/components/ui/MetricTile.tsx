import type { MetricTile as MetricTileData } from '@nexuvi/api-contracts';

import { formatChange, formatMetric, severityVar } from '../../lib/format';
import styles from './MetricTile.module.css';

/** Arrow glyphs for trend direction. Paired with a text label for non-visual readers. */
const TREND_GLYPH = { up: '↑', down: '↓', flat: '→' } as const;

interface MetricTileProps {
  readonly metric: MetricTileData;
}

/**
 * One KPI in the strip.
 *
 * The severity stripe on the left edge is the only way severity is expressed structurally —
 * the number itself stays in the primary text colour at every severity. Recolouring the
 * figure would make two tiles hard to compare at a glance, which is the one thing a KPI
 * strip exists to allow.
 */
export function MetricTile({ metric }: MetricTileProps) {
  const severity = metric.severity ?? 'normal';
  const emphasised = severity === 'critical' || severity === 'high';

  return (
    <article
      className={styles.tile}
      style={emphasised ? { ['--stripe' as string]: severityVar(severity) } : undefined}
      data-emphasised={emphasised ? 'true' : undefined}
    >
      <h3 className={styles.label}>{metric.label}</h3>

      <p className={`${styles.value} tabular`}>
        {formatMetric(metric.value, metric.format, metric.currency)}
      </p>

      <div className={styles.footer}>
        {metric.caption ? <span className={styles.caption}>{metric.caption}</span> : null}
        {metric.trend ? (
          <span
            className={styles.trend}
            data-sentiment={metric.trend.sentiment}
            title={`${formatChange(metric.trend.changePercent)} versus the previous period`}
          >
            <span aria-hidden="true">{TREND_GLYPH[metric.trend.direction]}</span>
            <span className="tabular">{formatChange(metric.trend.changePercent)}</span>
          </span>
        ) : null}
      </div>
    </article>
  );
}
