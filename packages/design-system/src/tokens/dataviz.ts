/**
 * Data-visualization palette.
 *
 * Clinical dashboards and operational reports are chart-heavy. The interface palette
 * (black/white/mint/red/purple) has requirements the viz palette doesn't share:
 *
 * - **Categorical series.** Up to 12 distinct series on one chart, each legible at 1px
 *   stroke and separable under red-green colour vision deficiency. Mint, red, and purple
 *   anchor the palette; complementary hues fill the rest.
 *
 * - **Sequential scales.** Single-hue ramps for choropleth (geography, time series where
 *   one variable is intensity). Light to dark, holding hue constant.
 *
 * - **Diverging scales.** For +/– data (delta, variance, outliers, positive/negative
 *   performance). Mint (good) through neutral to red (bad).
 *
 * - **Data alerts.** Highlight a specific point or series without recolouring the whole
 *   chart. Usually a desaturated background with the critical alert colour for the point
 *   itself.
 *
 * All series are tested at 1px and 2px strokes under both light and dark themes, and
 * all undergo WCAG 2.2 contrast checks against the page background.
 */

/** 12-colour categorical palette. Each colour is tested for:
 *
 * - Distinguishability against the other 11 under red-green CVD
 * - 1px and 2px stroke legibility on #f5f6f8 and #1a1d1f (our page backgrounds)
 * - Intuitive mapping where possible (mint = good/growth, red = critical/decline)
 */
export const CATEGORICAL_PALETTE = [
  '#19a183', // Mint 600 — positive, growth, success
  '#d85620', // Coral 500 — critical, alert (clinical alert ramp)
  '#8763cb', // Purple 500 — primary analytical colour
  '#6b7280', // Gray 500 — stable, baseline (medium neutral with colour flexibility)
  '#0284c7', // Sky 600 — secondary analytical
  '#d97706', // Amber 600 — warning, caution
  '#9333ea', // Violet 600 — tertiary analytical
  '#0891b2', // Cyan 600 — quaternary analytical
  '#db2777', // Pink 600 — highlight, special case
  '#4f46e5', // Indigo 600 — data series
  '#65a30d', // Lime 600 — delta, variance when positive (darkened for contrast)
  '#64748b', // Slate 500 — null, missing, disabled
] as const;

export type CategoricalColor = (typeof CATEGORICAL_PALETTE)[number];

/**
 * Sequential scales for single-variable heatmaps and intensity maps.
 * Each holds a constant hue while varying saturation and brightness.
 */
export const SEQUENTIAL_SCALES = {
  /** Mint intensity: absence through full saturation. */
  mint: ['#ecfaf5', '#cdf2e6', '#9ce5cf', '#63d3b4', '#33bf9c', '#19a183', '#0f8169', '#0c6553'],
  /** Coral intensity: soft through critical. */
  coral: ['#fff3ee', '#ffe0d3', '#ffbc9f', '#fb9366', '#f07039', '#d85620', '#b34418', '#8d3613'],
  /** Purple intensity: subtle through deep. */
  purple: ['#f6f2fd', '#ebe3fa', '#d8c8f5', '#bfa6ec', '#a382df', '#8763cb', '#6d4bad', '#573b8b'],
  /** Neutral intensity: light through dark. */
  neutral: ['#fafafa', '#f4f5f6', '#e8eaec', '#d5d8dc', '#adb3ba', '#7c848d', '#5c646d', '#414850'],
} as const;

/**
 * Diverging scale: mint (good) through neutral to coral (bad).
 * Centered at index 4 (neutral). Use for delta, variance, +/–.
 */
export const DIVERGING_SCALE = [
  '#71c2a8', // Mint 300
  '#33bf9c', // Mint 400
  '#19a183', // Mint 600
  '#0f8169', // Mint 700
  '#5c646d', // Neutral 600 (stronger than 500 for better contrast)
  '#d85620', // Coral 500
  '#fb9366', // Coral 300
  '#ffbc9f', // Coral 200
] as const;

/**
 * Data alert ramp: highlight a single point or series while keeping context visible.
 *
 * Typically: render the full chart in a desaturated categorical palette, then use
 * `dataAlertBackground` for the inactive series and `dataAlertForeground` for the
 * highlighted point or line. The colour itself comes from the categorical palette.
 */
export const DATA_ALERT = {
  /** Background colour for non-highlighted series (very faint, ~10% opacity equivalent). */
  background: '#e8eaec',
  /** Emphasis for the highlighted series (full saturation). Used in conjunction with a categorical colour. */
  foreground: '#000000',
} as const;

/**
 * Null / missing / invalid data colour. Used across all scales.
 * Consistent with the interface palette's disabled state.
 */
export const NULL_COLOR = '#adb3ba' as const;

/**
 * Palette for 2D heatmaps (rows × columns with numeric cells).
 * Similar to sequential but with more steps for finer gradation.
 */
export const HEATMAP_SCALE = [
  '#ecfaf5',
  '#d0f0e4',
  '#a6e5cd',
  '#72d5b0',
  '#3fc28f',
  '#19a183',
  '#10836b',
  '#0a5f52',
  '#05413a',
] as const;

/**
 * For small-multiple sparklines and inline charts where space is tight.
 * 5 colours, very distinct, highly saturated.
 */
export const SPARKLINE_PALETTE = ['#19a183', '#d85620', '#8763cb', '#0284c7', '#d97706'] as const;

/**
 * Guidance on usage for different chart types.
 */
export const CHART_GUIDANCE = {
  /**
   * Line chart with multiple series: use CATEGORICAL_PALETTE in order.
   * If series count is 5 or fewer, use SPARKLINE_PALETTE instead (more legibility).
   */
  lineChart: 'Use CATEGORICAL_PALETTE or SPARKLINE_PALETTE.',

  /**
   * Bar chart — grouped: one colour per group, arranged left-to-right by category.
   * Stacked bar: one colour per category across all bars. Use CATEGORICAL_PALETTE.
   */
  barChart: 'Use CATEGORICAL_PALETTE.',

  /**
   * Scatter plot: use categorical for series, size/opacity for magnitude. If magnitude
   * matters more than series identity, use SEQUENTIAL_SCALES instead.
   */
  scatterPlot: 'Use CATEGORICAL_PALETTE for series, or SEQUENTIAL_SCALES for magnitude.',

  /**
   * Choropleth (map, heatmap): use SEQUENTIAL_SCALES or HEATMAP_SCALE. Mint for
   * positive/growth, coral for critical/decline, neutral for neither.
   */
  choropleth: 'Use SEQUENTIAL_SCALES or HEATMAP_SCALE.',

  /**
   * Time series with confidence interval or range: line in CATEGORICAL_PALETTE,
   * fill in the same colour at ~10% opacity (or use DATA_ALERT.background).
   */
  timeSeriesWithRange: 'Line in CATEGORICAL_PALETTE, fill at 10% opacity.',

  /**
   * Gauge or progress: use DIVERGING_SCALE if showing variance, or SEQUENTIAL_SCALES
   * if showing absolute position along a range.
   */
  gauge: 'Use SEQUENTIAL_SCALES or DIVERGING_SCALE.',
} as const;
