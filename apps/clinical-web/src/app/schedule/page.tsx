import { getFacilities, getSchedule } from '../../lib/api';
import { formatDuration } from '../../lib/format';
import { AppShell } from '../../components/shell/AppShell';
import { Card } from '../../components/ui/Card';
import { ApiErrorState } from '../../components/ui/ApiErrorState';
import { ScheduleGrid } from '../../components/schedule/ScheduleGrid';
import { FacilitySwitcher } from './FacilitySwitcher';
import { DateNav } from './DateNav';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const facilityParam = typeof params.facility === 'string' ? params.facility : undefined;
  const dateParam = typeof params.date === 'string' ? params.date : undefined;

  let facilities;
  let schedule;
  try {
    [facilities, schedule] = await Promise.all([
      getFacilities(),
      getSchedule(facilityParam, dateParam),
    ]);
  } catch (error) {
    return (
      <AppShell title="Schedule" subtitle="Could not reach the core API">
        <ApiErrorState error={error} />
      </AppShell>
    );
  }

  const { summary } = schedule;

  return (
    <AppShell
      title="Schedule"
      subtitle={`${schedule.facility.name} · ${schedule.facility.city}`}
      actions={
        <>
          <FacilitySwitcher
            facilities={facilities}
            activeSlug={schedule.facility.slug}
            date={schedule.date}
          />
          <DateNav date={schedule.date} facilitySlug={schedule.facility.slug} />
        </>
      }
    >
      <section className={styles.summary} aria-label="Coverage summary">
        <SummaryTile label="On shift" value={String(summary.cliniciansOnShift)} caption="Clinicians rostered" />
        <SummaryTile
          label="Booked"
          value={String(summary.appointmentCount)}
          caption={summary.cancelledCount > 0 ? `${summary.cancelledCount} cancelled` : 'Appointments'}
        />
        <SummaryTile
          label="Utilisation"
          value={`${Math.round(summary.utilisation * 100)}%`}
          caption="Of bookable time"
        />
        <SummaryTile
          label="Open capacity"
          value={formatDuration(summary.openMinutes)}
          caption="Unbooked, on shift"
        />
        {/* `exactOptionalPropertyTypes` treats an explicit `undefined` as a value, so the
            prop is spread in only when it applies. */}
        <SummaryTile
          label="Conflicts"
          value={String(summary.conflictCount)}
          caption="Clashes and overruns"
          {...(summary.conflictCount > 0 ? { tone: 'danger' as const } : {})}
        />
      </section>

      <Card flush>
        <ScheduleGrid schedule={schedule} />
      </Card>

      <Legend />
    </AppShell>
  );
}

function SummaryTile({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  tone?: 'danger';
}) {
  return (
    <article className={styles.tile} data-tone={tone}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={`${styles.tileValue} tabular`}>{value}</span>
      <span className={styles.tileCaption}>{caption}</span>
    </article>
  );
}

/**
 * The grid encodes coverage in the background and bookings in the foreground, which is not
 * self-evident on first look. A five-item key is cheaper than a screen full of colour
 * nobody can decode.
 */
function Legend() {
  return (
    <div className={styles.legend}>
      <span className={styles.legendItem}>
        <span className={`${styles.swatch} ${styles.swatchShift}`} /> On shift
      </span>
      <span className={styles.legendItem}>
        <span className={`${styles.swatch} ${styles.swatchOff}`} /> Not working
      </span>
      <span className={styles.legendItem}>
        <span className={`${styles.swatch} ${styles.swatchBreak}`} /> Break or unavailable
      </span>
      <span className={styles.legendItem}>
        <span className={`${styles.swatch} ${styles.swatchConflict}`} /> Conflict
      </span>
      <span className={styles.legendItem}>
        <span className={`${styles.swatch} ${styles.swatchCancelled}`} /> Cancelled
      </span>
    </div>
  );
}
