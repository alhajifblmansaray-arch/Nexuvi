/**
 * Day schedule — who is working, where, and what is booked into their time.
 *
 * Two things are deliberately modelled separately here, because an administrator asking
 * "who is working today" is not asking "what is booked today":
 *
 * - **Coverage** ({@link ShiftBlock}) is the roster. A clinician on shift with an empty
 *   column is available capacity. A column with no shift at all is nobody — and those two
 *   states look identical on a scheduler that only draws appointments, which is how a
 *   clinic discovers at 15:00 that the afternoon had no cover.
 * - **Bookings** ({@link ScheduledAppointment}) are what has been committed into that
 *   coverage.
 *
 * The grid renders both, and the distinction is the point of the screen.
 *
 * ## Time
 *
 * Every time on this payload is **minutes from local midnight at the facility**, not a
 * timestamp. A schedule grid is laid out in a clinic's own wall-clock time: a 09:00
 * appointment sits in the 09:00 row whatever the viewer's device is set to, and shipping
 * instants would mean every client re-deriving that and one of them getting DST wrong.
 * The facility's IANA zone travels alongside for anything that needs a real instant.
 */

import type { IsoDate, Severity } from './common.ts';
import type { ClinicalFlag, EncounterType } from './encounter.ts';

/** Minutes from local midnight. `540` is 09:00. */
export type MinuteOfDay = number;

export interface FacilitySummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly city: string;
  /** IANA zone, e.g. `Africa/Freetown`. */
  readonly timezone: string;
  /** False when the facility is closed on the requested date. */
  readonly open: boolean;
}

/**
 * A span of a clinician's day.
 *
 * `unavailable` is distinct from an absent block: it means the clinician is rostered but
 * cannot be booked (admin time, travel between sites, a training block). An absent block
 * means they are not here at all.
 */
export type ShiftKind = 'shift' | 'break' | 'unavailable';

export interface ShiftBlock {
  readonly kind: ShiftKind;
  readonly startMinute: MinuteOfDay;
  readonly endMinute: MinuteOfDay;
  readonly label?: string;
}

export type AppointmentStatus =
  | 'booked'
  | 'arrived'
  | 'in-progress'
  | 'completed'
  | 'no-show'
  | 'cancelled';

export interface ScheduledAppointment {
  readonly id: string;
  readonly reference: string;
  readonly patientName: string;
  readonly patientId: string;
  readonly serviceLabel: string;
  readonly type: EncounterType;
  readonly status: AppointmentStatus;
  readonly startMinute: MinuteOfDay;
  readonly endMinute: MinuteOfDay;
  readonly room?: string;
  readonly severity: Severity;
  readonly flags: readonly ClinicalFlag[];
  /**
   * True when this appointment overlaps another in the same column, or falls outside the
   * clinician's rostered coverage. Computed server-side because it is an operational
   * defect, not a layout detail — the grid shows it, but the schedule *has* it.
   */
  readonly conflict: boolean;
}

/** One clinician's column in the grid. */
export interface ScheduleColumn {
  readonly clinicianId: string;
  readonly clinicianName: string;
  readonly role: string;
  /** Professional suffix shown after the name, e.g. `RMT`, `PT`. */
  readonly credential: string;
  readonly shifts: readonly ShiftBlock[];
  readonly appointments: readonly ScheduledAppointment[];
  /** Minutes of bookable coverage — shift time less breaks and unavailable time. */
  readonly bookableMinutes: number;
  /** Minutes actually booked, excluding cancellations and no-shows. */
  readonly bookedMinutes: number;
  /** `bookedMinutes / bookableMinutes`, 0–1, rounded server-side. Zero when off roster. */
  readonly utilisation: number;
  readonly conflictCount: number;
}

/** Roll-up across the whole facility for the day. */
export interface ScheduleSummary {
  readonly cliniciansOnShift: number;
  readonly cliniciansOffShift: number;
  readonly appointmentCount: number;
  readonly cancelledCount: number;
  readonly conflictCount: number;
  /** Bookable minutes with nothing booked into them, across every column. */
  readonly openMinutes: number;
  readonly utilisation: number;
}

/** The complete `GET /schedule` response. */
export interface DaySchedule {
  readonly date: IsoDate;
  readonly facility: FacilitySummary;
  /** Earliest and latest minute the grid needs to render, derived from the day's content. */
  readonly dayStartMinute: MinuteOfDay;
  readonly dayEndMinute: MinuteOfDay;
  /** Row granularity in minutes. */
  readonly slotMinutes: number;
  readonly columns: readonly ScheduleColumn[];
  readonly summary: ScheduleSummary;
}

/** Query parameters for `GET /schedule`. */
export interface ScheduleQuery {
  readonly facilityId?: string;
  /** Defaults to today at the facility. */
  readonly date?: IsoDate;
}
