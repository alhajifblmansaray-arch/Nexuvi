import type { NamedSeries } from '@nexuvi/api-contracts';

import { formatWeekday } from '../../lib/format';
import styles from './AreaChart.module.css';

/**
 * Single-series area chart.
 *
 * Rendered as SVG on the server with a fixed viewBox and uniform scaling, so strokes stay
 * 1px-true at every width. `preserveAspectRatio="none"` would stretch the line unevenly and
 * is the usual reason a hand-rolled chart looks subtly wrong on wide screens.
 *
 * Colour comes from the analytical purple in the data-viz palette rather than a semantic
 * status token: this series carries no judgement about whether the numbers are good.
 */

const VIEW_W = 720;
const VIEW_H = 200;
const PAD = { top: 16, right: 16, bottom: 26, left: 34 } as const;

const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

/** Analytical purple — `CATEGORICAL_PALETTE[2]`. */
const SERIES = '#8763cb';

interface AreaChartProps {
  readonly series: NamedSeries;
  /** Roughly how many horizontal gridlines to draw. */
  readonly gridLines?: number;
}

export function AreaChart({ series, gridLines = 4 }: AreaChartProps) {
  const points = series.points;

  if (points.length < 2) {
    return <p className={styles.empty}>Not enough data to plot.</p>;
  }

  const values = points.map((p) => p.value);
  const rawMax = Math.max(...values);
  const rawMin = Math.min(...values);

  // Baseline at zero would flatten a series that oscillates in a narrow band high above
  // it, so the floor is padded below the minimum instead — and the axis is labelled, so
  // the reader can see the scale does not start at zero.
  const floor = Math.max(0, Math.floor((rawMin - (rawMax - rawMin) * 0.35) / 10) * 10);
  const ceiling = Math.ceil((rawMax + (rawMax - rawMin) * 0.1) / 10) * 10;
  const span = Math.max(1, ceiling - floor);

  const x = (index: number) => PAD.left + (index / (points.length - 1)) * PLOT_W;
  const y = (value: number) => PAD.top + PLOT_H - ((value - floor) / span) * PLOT_H;

  const line = points.map((p, i) => `${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  const area = `${PAD.left},${PAD.top + PLOT_H} ${line} ${PAD.left + PLOT_W},${PAD.top + PLOT_H}`;

  const ticks = Array.from({ length: gridLines + 1 }, (_, i) => floor + (span / gridLines) * i);

  // Label roughly six dates, whatever the series length, so ticks never collide.
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  const last = points[points.length - 1]!;
  const gradientId = `area-${series.key}`;

  return (
    <figure className={styles.figure}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className={styles.svg}
        role="img"
        aria-label={`${series.label} over the last ${points.length} days. Latest ${last.value}.`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES} stopOpacity="0.26" />
            <stop offset="100%" stopColor={SERIES} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={PAD.left + PLOT_W}
              y1={y(tick)}
              y2={y(tick)}
              className={styles.grid}
            />
            <text x={PAD.left - 8} y={y(tick)} className={styles.axisLabel} textAnchor="end" dy="0.32em">
              {Math.round(tick)}
            </text>
          </g>
        ))}

        <polygon points={area} fill={`url(#${gradientId})`} />
        <polyline
          points={line}
          fill="none"
          stroke={SERIES}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* The most recent value is what the reader came for; everything else is context. */}
        <circle cx={x(points.length - 1)} cy={y(last.value)} r="3.5" fill={SERIES} />
        <circle
          cx={x(points.length - 1)}
          cy={y(last.value)}
          r="6.5"
          fill="none"
          stroke={SERIES}
          strokeOpacity="0.28"
          strokeWidth="2"
        />

        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={p.date}
              x={x(i)}
              y={VIEW_H - 8}
              className={styles.axisLabel}
              textAnchor={i === points.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'}
            >
              {formatWeekday(p.date)}
            </text>
          ) : null,
        )}
      </svg>
    </figure>
  );
}
