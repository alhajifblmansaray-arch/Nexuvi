/**
 * Primitives shared across every Nexuvi payload.
 *
 * These exist so the API and the apps agree on the *shape* of a severity or a trend
 * without either side inventing its own string union. A dashboard tile that renders
 * `severity` picks its colour from this closed set, so a new severity added on the
 * server is a compile error in the client rather than an unstyled pill in production.
 */

/** ISO-8601 timestamp, always UTC with an explicit offset. */
export type IsoTimestamp = string;

/** ISO-8601 calendar date, `YYYY-MM-DD`. */
export type IsoDate = string;

/**
 * Operational severity, ordered least to most urgent.
 *
 * Deliberately *not* the same vocabulary as clinical criticality. A referral that has
 * been sitting unassigned for six hours is `critical` operationally; that says nothing
 * about the patient. Blueprint §19.1 keeps clinical-safety signalling on its own locked
 * tokens, and mixing the two here would let an ops backlog borrow the visual language
 * reserved for patient harm.
 */
export type Severity = 'normal' | 'info' | 'warning' | 'high' | 'critical';

/** Direction of a metric against its comparison window. */
export type TrendDirection = 'up' | 'down' | 'flat';

/**
 * Whether a movement is good, bad, or neither.
 *
 * Kept separate from {@link TrendDirection} because direction and desirability are
 * independent: cancellations trending `up` is bad, revenue trending `up` is good, and
 * the tile needs both facts to choose a colour.
 */
export type TrendSentiment = 'positive' | 'negative' | 'neutral';

/** A single point in a time series. */
export interface TimeSeriesPoint {
  readonly date: IsoDate;
  readonly value: number;
}

/** A named series for multi-line and stacked charts. */
export interface NamedSeries {
  readonly key: string;
  readonly label: string;
  readonly points: readonly TimeSeriesPoint[];
}

/** One labelled magnitude — the row of a bar list or a segment of a stacked bar. */
export interface CategoryDatum {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  /** Share of the parent total, 0–1. Server-computed so every client rounds identically. */
  readonly share: number;
  readonly severity?: Severity;
}

/** Envelope for every list endpoint. */
export interface Paginated<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
