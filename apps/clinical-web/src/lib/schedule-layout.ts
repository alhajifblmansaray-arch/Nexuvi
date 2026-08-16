import type { ScheduledAppointment } from '@nexuvi/api-contracts';

/**
 * Lane packing for overlapping appointments.
 *
 * Double-booking is a real state in a clinic, not an error the UI can refuse to draw, so
 * the grid has to show both appointments rather than stacking one invisibly on the other.
 * Overlapping appointments are split into side-by-side lanes; everything else keeps the
 * full column width.
 *
 * Lanes are computed per *cluster* — a run of appointments connected by overlap — rather
 * than across the whole column. Otherwise a single clash at 09:00 would narrow every
 * appointment in the day to half width for no reason.
 */

export interface PlacedAppointment {
  readonly appointment: ScheduledAppointment;
  /** Zero-based lane within its cluster. */
  readonly lane: number;
  /** How many lanes the cluster needs. Width is `1 / lanes`. */
  readonly lanes: number;
}

export function placeAppointments(
  appointments: readonly ScheduledAppointment[],
): readonly PlacedAppointment[] {
  const ordered = [...appointments].sort(
    (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
  );

  const placed: PlacedAppointment[] = [];
  let cluster: ScheduledAppointment[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    placed.push(...assignLanes(cluster));
    cluster = [];
    clusterEnd = -1;
  };

  for (const appointment of ordered) {
    // A gap — or a touching boundary — closes the cluster. Back-to-back appointments are
    // not a clash, so they must not share a cluster and get halved.
    if (cluster.length > 0 && appointment.startMinute >= clusterEnd) {
      flush();
    }
    cluster.push(appointment);
    clusterEnd = Math.max(clusterEnd, appointment.endMinute);
  }
  flush();

  return placed;
}

/** Greedy lane assignment: reuse the first lane whose last appointment has finished. */
function assignLanes(cluster: readonly ScheduledAppointment[]): PlacedAppointment[] {
  const laneEnds: number[] = [];
  const assigned = cluster.map((appointment) => {
    let lane = laneEnds.findIndex((end) => end <= appointment.startMinute);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(appointment.endMinute);
    } else {
      laneEnds[lane] = appointment.endMinute;
    }
    return { appointment, lane };
  });

  return assigned.map((entry) => ({ ...entry, lanes: laneEnds.length }));
}

/** `540` → `09:00`. */
export function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Whole-hour marks between two minute bounds, for the time gutter and grid lines. */
export function hourMarks(startMinute: number, endMinute: number): readonly number[] {
  const marks: number[] = [];
  for (let m = Math.ceil(startMinute / 60) * 60; m <= endMinute; m += 60) {
    marks.push(m);
  }
  return marks;
}
