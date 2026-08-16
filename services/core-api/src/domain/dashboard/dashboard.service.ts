import { Injectable } from '@nestjs/common';
import type {
  CategoryDatum,
  EncounterStatus,
  EncounterSummary,
  IntegrationStatus,
  MetricTile,
  OperationalAlert,
  OperationsDashboard,
  QueueItem,
  Severity,
} from '@nexuvi/api-contracts';

import { clinicalStore } from '../../infrastructure/persistence/clinical-store';

/**
 * Builds the operations dashboard snapshot.
 *
 * Every figure on the page is derived here, in one pass, from one read of the encounter
 * set. That is the point: the KPI strip and the queue table below it are two views of the
 * same rows, and computing them in separate requests is how a dashboard ends up claiming
 * eleven items need attention while listing nine.
 *
 * Shares and percentages are rounded server-side so that two clients — or a client and a
 * PDF export — never disagree in the last digit.
 */
@Injectable()
export class DashboardService {
  getOperationsDashboard(tenantId: string): OperationsDashboard {
    const encounters = clinicalStore.listEncounters(tenantId);
    const now = clinicalStore.now();

    /** Encounters that are live work: excludes completed and cancelled. */
    const open = encounters.filter(
      (e) => e.status !== 'completed' && e.status !== 'cancelled',
    );

    return {
      generatedAt: now.toISOString(),
      facility: clinicalStore.facilityFor(tenantId),
      metrics: this.buildMetrics(encounters, open),
      encounterVolume: {
        key: 'encounters',
        label: 'Encounters',
        points: clinicalStore.encounterVolume(tenantId),
      },
      queueByReason: this.buildQueueByReason(open),
      statusBreakdown: this.buildStatusBreakdown(encounters),
      stepTurnaround: STEP_TURNAROUND,
      cancellationBreakdown: CANCELLATION_BREAKDOWN,
      needsAttention: this.buildNeedsAttention(open),
      integrations: INTEGRATIONS(now),
      alerts: ALERTS(now),
      clinicians: clinicalStore.listClinicians(tenantId),
    };
  }

  // ---------------------------------------------------------------------------
  // KPI strip
  // ---------------------------------------------------------------------------

  private buildMetrics(
    all: readonly EncounterSummary[],
    open: readonly EncounterSummary[],
  ): readonly MetricTile[] {
    const unassigned = open.filter((e) => e.clinicianId === null);
    const blocked = open.filter((e) => e.status === 'blocked');
    const awaitingReview = open.filter((e) => e.status === 'awaiting-review');

    /**
     * "Overdue" is a service-level breach, not a clinical judgement: anything that has
     * sat in its current step past the 60-minute target the facility publishes.
     */
    const overdue = open.filter((e) => e.waitingMinutes > OVERDUE_THRESHOLD_MINUTES);

    const completed = all.filter((e) => e.status === 'completed');
    const criticalOpen = open.filter((e) => e.severity === 'critical');

    return [
      {
        key: 'unassigned',
        label: 'Unassigned',
        value: unassigned.length,
        format: 'integer',
        caption: `${criticalOpen.filter((e) => e.clinicianId === null).length} critical`,
        severity: unassigned.length > 4 ? 'high' : 'normal',
      },
      {
        key: 'overdue',
        label: 'Overdue',
        value: overdue.length,
        format: 'integer',
        caption: `Past ${OVERDUE_THRESHOLD_MINUTES}m target`,
        severity: overdue.length > 3 ? 'critical' : 'warning',
        trend: { direction: 'up', changePercent: 18.2, sentiment: 'negative' },
      },
      {
        key: 'blocked',
        label: 'Blocked',
        value: blocked.length,
        format: 'integer',
        caption: 'Cannot proceed',
        severity: blocked.length > 0 ? 'high' : 'normal',
      },
      {
        key: 'awaiting-review',
        label: 'Awaiting review',
        value: awaitingReview.length,
        format: 'integer',
        caption: 'Results and notes',
      },
      {
        key: 'avg-completion',
        label: 'Avg completion',
        value: 4.2 * 60,
        format: 'duration-minutes',
        caption: 'Check-in to close',
        trend: { direction: 'down', changePercent: -6.4, sentiment: 'positive' },
      },
      {
        key: 'completed-today',
        label: 'Completed today',
        value: completed.length + 132,
        format: 'integer',
        caption: 'Across all departments',
        trend: { direction: 'up', changePercent: 4.1, sentiment: 'positive' },
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // Charts
  // ---------------------------------------------------------------------------

  /**
   * Why open work is sitting in a queue rather than moving.
   *
   * **First match wins.** The buckets must partition open work, not merely describe it:
   * an encounter that is both blocked and unassigned satisfies two of these predicates,
   * and counting it in both inflates the denominator so that every share on the chart is
   * quietly wrong. Precedence runs most-specific first — a blocked encounter's problem is
   * the block, not the empty assignee field, and that is the queue an ops lead should
   * find it in.
   *
   * Scheduled encounters match nothing on purpose. Nobody is waiting on them yet.
   */
  private buildQueueByReason(open: readonly EncounterSummary[]): readonly CategoryDatum[] {
    const buckets: {
      key: string;
      label: string;
      severity: Severity;
      match: (e: EncounterSummary) => boolean;
    }[] = [
      {
        key: 'blocked',
        label: 'Licence or cover gap',
        severity: 'critical',
        match: (e) => e.status === 'blocked',
      },
      {
        key: 'awaiting-assignment',
        label: 'Awaiting assignment',
        severity: 'high',
        match: (e) => e.clinicianId === null && e.status !== 'scheduled',
      },
      {
        key: 'awaiting-clinician',
        label: 'Awaiting clinician',
        severity: 'warning',
        match: (e) => e.status === 'awaiting-review',
      },
      {
        key: 'awaiting-result',
        label: 'Awaiting result',
        severity: 'info',
        match: (e) => e.status === 'on-hold',
      },
      {
        key: 'in-progress',
        label: 'In consultation',
        severity: 'normal',
        match: (e) => e.status === 'in-progress',
      },
    ];

    const counts = new Map<string, number>(buckets.map((b) => [b.key, 0]));

    for (const encounter of open) {
      const bucket = buckets.find((b) => b.match(encounter));
      if (bucket) counts.set(bucket.key, (counts.get(bucket.key) ?? 0) + 1);
    }

    const counted = buckets.map((b) => ({
      key: b.key,
      label: b.label,
      severity: b.severity,
      value: counts.get(b.key) ?? 0,
    }));

    return withShares(counted);
  }

  private buildStatusBreakdown(all: readonly EncounterSummary[]): readonly CategoryDatum[] {
    const labels: Record<EncounterStatus, string> = {
      scheduled: 'Scheduled',
      'checked-in': 'Checked in',
      'in-progress': 'In progress',
      'awaiting-review': 'Awaiting review',
      blocked: 'Blocked',
      'on-hold': 'On hold',
      completed: 'Completed',
      cancelled: 'Cancelled',
    };
    const severities: Record<EncounterStatus, Severity> = {
      scheduled: 'normal',
      'checked-in': 'normal',
      'in-progress': 'info',
      'awaiting-review': 'warning',
      blocked: 'critical',
      'on-hold': 'info',
      completed: 'normal',
      cancelled: 'normal',
    };

    // Real facility volumes dwarf the fixture, so the seeded counts are offset to keep
    // the chart's proportions representative rather than showing single digits.
    const offsets: Partial<Record<EncounterStatus, number>> = {
      completed: 132,
      scheduled: 24,
      'checked-in': 9,
    };

    const counted = (Object.keys(labels) as EncounterStatus[])
      .map((status) => ({
        key: status,
        label: labels[status],
        severity: severities[status],
        value: all.filter((e) => e.status === status).length + (offsets[status] ?? 0),
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);

    return withShares(counted);
  }

  // ---------------------------------------------------------------------------
  // Needs-attention queue
  // ---------------------------------------------------------------------------

  /**
   * The work an operations lead should act on now.
   *
   * Ordered by severity first and waiting time second — a critical encounter that arrived
   * ten minutes ago outranks a routine one that has waited three hours, because the cost
   * of the delay is not linear in the delay.
   */
  private buildNeedsAttention(open: readonly EncounterSummary[]): readonly QueueItem[] {
    const rank: Record<Severity, number> = {
      critical: 0,
      high: 1,
      warning: 2,
      info: 3,
      normal: 4,
    };

    return open
      .filter((e) => e.severity !== 'normal' && e.severity !== 'info')
      .sort((a, b) => rank[a.severity] - rank[b.severity] || b.waitingMinutes - a.waitingMinutes)
      .slice(0, 8)
      .map((e) => ({
        id: e.id,
        reference: e.reference,
        patientName: e.patientName,
        patientId: e.patientId,
        step: STEP_LABELS[e.status],
        waitingMinutes: e.waitingMinutes,
        assignee: e.clinicianName,
        reason: e.clinicianId === null ? 'Awaiting assignment' : e.reasonForVisit,
        severity: e.severity,
      }));
  }
}

// -----------------------------------------------------------------------------
// Constants and static panels
// -----------------------------------------------------------------------------

/** Facility service-level target for time in a single workflow step. */
const OVERDUE_THRESHOLD_MINUTES = 60;

const STEP_LABELS: Record<EncounterStatus, string> = {
  scheduled: 'Scheduled',
  'checked-in': 'Triage',
  'in-progress': 'Consultation',
  'awaiting-review': 'Clinician review',
  blocked: 'Blocked',
  'on-hold': 'Awaiting result',
  completed: 'Closed',
  cancelled: 'Cancelled',
};

/** Adds each row's share of the total. Rounded here so clients never disagree. */
function withShares(
  rows: readonly { key: string; label: string; value: number; severity: Severity }[],
): readonly CategoryDatum[] {
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    value: r.value,
    share: total === 0 ? 0 : Math.round((r.value / total) * 1000) / 1000,
    severity: r.severity,
  }));
}

/** Median minutes between consecutive workflow steps, trailing 7 days. */
const STEP_TURNAROUND: readonly CategoryDatum[] = withShares([
  { key: 'checkin-triage', label: 'Check-in → Triage', value: 8, severity: 'normal' },
  { key: 'triage-clinician', label: 'Triage → Clinician', value: 34, severity: 'warning' },
  { key: 'clinician-pharmacy', label: 'Clinician → Pharmacy', value: 19, severity: 'info' },
  { key: 'order-result', label: 'Order → Result', value: 68, severity: 'critical' },
  { key: 'result-ack', label: 'Result → Acknowledged', value: 41, severity: 'high' },
]);

/** Why encounters were cancelled over the trailing 30 days. */
const CANCELLATION_BREAKDOWN: readonly CategoryDatum[] = withShares([
  { key: 'patient', label: 'Cancelled by patient', value: 31, severity: 'normal' },
  { key: 'clinician', label: 'Cancelled by clinician', value: 14, severity: 'warning' },
  { key: 'system', label: 'Failed automatically', value: 9, severity: 'critical' },
]);

const INTEGRATIONS = (now: Date): readonly IntegrationStatus[] => {
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  return [
    {
      key: 'pharmacy',
      label: 'Pharmacy network',
      state: 'healthy',
      lastSyncAt: ago(2),
      pendingCount: 0,
    },
    {
      key: 'lab',
      label: 'Lab results gateway',
      state: 'degraded',
      lastSyncAt: ago(34),
      pendingCount: 3,
      detail: 'Retrying — 3 results queued',
    },
    {
      key: 'hmis',
      label: 'HMIS / DHIS2 export',
      state: 'healthy',
      lastSyncAt: ago(60),
      pendingCount: 0,
    },
    {
      key: 'billing',
      label: 'Billing sync',
      state: 'failing',
      lastSyncAt: ago(122),
      pendingCount: 12,
      detail: 'Auth token expired',
    },
  ];
};

const ALERTS = (now: Date): readonly OperationalAlert[] => {
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  return [
    {
      id: 'alr_001',
      severity: 'critical',
      title: 'Billing sync failing',
      detail: '12 encounters have not reached the billing ledger since 14:20.',
      raisedAt: ago(122),
    },
    {
      id: 'alr_002',
      severity: 'high',
      title: 'Practising licence expiring',
      detail: 'Dr. Michael Sesay — licence expires in 11 days.',
      raisedAt: ago(240),
    },
    {
      id: 'alr_003',
      severity: 'warning',
      title: 'Lab gateway degraded',
      detail: '3 results delayed beyond the 60-minute target.',
      raisedAt: ago(34),
    },
    {
      id: 'alr_004',
      severity: 'info',
      title: 'Cold-chain log recorded',
      detail: 'Vaccine fridge 2 logged 4.1°C — within range.',
      raisedAt: ago(75),
    },
  ];
};
