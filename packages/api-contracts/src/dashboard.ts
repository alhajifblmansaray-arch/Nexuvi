/**
 * Operations dashboard payloads.
 *
 * One endpoint (`GET /dashboard/operations`) returns the whole page. The dashboard is a
 * single glance at one facility's state, so splitting it across six requests would let
 * the tiles disagree with each other — the KPI strip reporting a backlog the queue table
 * below it has already drained. One query, one clock, one consistent read.
 */

import type {
  CategoryDatum,
  IsoTimestamp,
  NamedSeries,
  Severity,
  TrendDirection,
  TrendSentiment,
} from './common.ts';

/** How a metric's raw number should be rendered. */
export type MetricFormat = 'integer' | 'currency' | 'duration-minutes' | 'percent';

/** A single tile in the KPI strip. */
export interface MetricTile {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly format: MetricFormat;
  /** ISO-4217 code. Present only when `format` is `currency`. */
  readonly currency?: string;
  /** Short qualifier under the number, e.g. "2 critical" or "vs. last month". */
  readonly caption?: string;
  readonly trend?: {
    readonly direction: TrendDirection;
    /** Percentage change against the comparison window, already signed. */
    readonly changePercent: number;
    readonly sentiment: TrendSentiment;
  };
  /** Raises the tile's prominence. Reserved for tiles that need action *today*. */
  readonly severity?: Severity;
}

/** A queue entry — the unit of work in the "needs attention" tables. */
export interface QueueItem {
  readonly id: string;
  readonly reference: string;
  readonly patientName: string;
  readonly patientId: string;
  /** Where this item currently sits in its workflow. */
  readonly step: string;
  /** Minutes since the item entered its current step. */
  readonly waitingMinutes: number;
  readonly assignee: string | null;
  readonly reason: string;
  readonly severity: Severity;
}

/** Health of one outbound integration (lab gateway, pharmacy network, HMIS export). */
export interface IntegrationStatus {
  readonly key: string;
  readonly label: string;
  readonly state: 'healthy' | 'degraded' | 'failing';
  readonly lastSyncAt: IsoTimestamp;
  /** Backlog waiting to be delivered. Zero when healthy. */
  readonly pendingCount: number;
  readonly detail?: string;
}

/** An operational alert surfaced on the dashboard. */
export interface OperationalAlert {
  readonly id: string;
  readonly severity: Severity;
  readonly title: string;
  readonly detail: string;
  readonly raisedAt: IsoTimestamp;
}

/** Clinician roster state for the availability panel. */
export interface ClinicianAvailability {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly state: 'available' | 'with-patient' | 'off-shift';
  /** Encounters currently assigned and not yet closed. */
  readonly activeEncounters: number;
  readonly detail?: string;
}

/** The complete `GET /dashboard/operations` response. */
export interface OperationsDashboard {
  /** When the server computed this snapshot. Every figure below shares this clock. */
  readonly generatedAt: IsoTimestamp;
  readonly facility: {
    readonly id: string;
    readonly name: string;
  };
  readonly metrics: readonly MetricTile[];
  /** Encounter volume over the trailing window, for the area chart. */
  readonly encounterVolume: NamedSeries;
  /** Why work is currently queued. Bar list. */
  readonly queueByReason: readonly CategoryDatum[];
  /** Encounter status distribution. Bar list. */
  readonly statusBreakdown: readonly CategoryDatum[];
  /** Median minutes between consecutive workflow steps. Bar list. */
  readonly stepTurnaround: readonly CategoryDatum[];
  /** Why encounters were cancelled. Stacked bar. */
  readonly cancellationBreakdown: readonly CategoryDatum[];
  readonly needsAttention: readonly QueueItem[];
  readonly integrations: readonly IntegrationStatus[];
  readonly alerts: readonly OperationalAlert[];
  readonly clinicians: readonly ClinicianAvailability[];
}
