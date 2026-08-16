import { getOperationsDashboard } from '../lib/api';
import { formatClock } from '../lib/format';
import { AppShell } from '../components/shell/AppShell';
import { Card } from '../components/ui/Card';
import { MetricTile } from '../components/ui/MetricTile';
import { ApiErrorState } from '../components/ui/ApiErrorState';
import { AreaChart } from '../components/charts/AreaChart';
import { BarList } from '../components/charts/BarList';
import { StackedBar } from '../components/charts/StackedBar';
import { AttentionTable } from '../components/dashboard/AttentionTable';
import { AlertList, ClinicianList, IntegrationList } from '../components/dashboard/Panels';
import styles from './page.module.css';

/** Operational reads are only useful if they are current, so nothing here is cached. */
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let dashboard;
  try {
    dashboard = await getOperationsDashboard();
  } catch (error) {
    return (
      <AppShell title="Operations" subtitle="Could not reach the core API">
        <ApiErrorState error={error} />
      </AppShell>
    );
  }

  // Every relative time on the page is measured against the server's snapshot clock, not
  // the render clock, so "34m ago" stays consistent with the figures beside it.
  const generatedAt = new Date(dashboard.generatedAt);

  return (
    <AppShell
      title="Operations"
      subtitle={dashboard.facility.name}
      actions={
        <span className={styles.stamp}>
          Snapshot <time dateTime={dashboard.generatedAt}>{formatClock(dashboard.generatedAt)}</time>
        </span>
      }
    >
      <section className={styles.metrics} aria-label="Key metrics">
        {dashboard.metrics.map((metric) => (
          <MetricTile key={metric.key} metric={metric} />
        ))}
      </section>

      <section className={styles.chartRow} aria-label="Volume and queue">
        <Card title="Encounter volume" meta="Last 14 days">
          <AreaChart series={dashboard.encounterVolume} />
        </Card>

        <Card title="Queue by reason" meta="Open work">
          <BarList data={dashboard.queueByReason} showShare />
        </Card>

        <Card title="Status breakdown" meta="All encounters">
          {/* Bars are off here: completed encounters outnumber every other status by an
              order of magnitude, and proportional bars would render the rest invisible. */}
          <BarList data={dashboard.statusBreakdown} bars={false} showShare />
        </Card>
      </section>

      <Card
        title="Needs attention"
        meta={`${dashboard.needsAttention.length} items`}
        flush
      >
        <AttentionTable items={dashboard.needsAttention} />
      </Card>

      <section className={styles.chartRow} aria-label="Turnaround and cancellations">
        <Card title="Median step turnaround" meta="Last 7 days">
          <BarList data={dashboard.stepTurnaround} valueAs="duration" />
        </Card>

        <Card title="Cancellations" meta="Last 30 days">
          <StackedBar data={dashboard.cancellationBreakdown} totalLabel="Total cancelled" />
        </Card>

        <Card title="Integration health" meta="Outbound">
          <IntegrationList integrations={dashboard.integrations} now={generatedAt} />
        </Card>
      </section>

      <section className={styles.panelRow} aria-label="Roster and alerts">
        <Card title="Clinician availability">
          <ClinicianList clinicians={dashboard.clinicians} />
        </Card>

        <Card title="Recent alerts">
          <AlertList alerts={dashboard.alerts} now={generatedAt} />
        </Card>
      </section>
    </AppShell>
  );
}
