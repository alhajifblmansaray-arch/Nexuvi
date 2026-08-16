import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  DaySchedule,
  FacilitySummary,
  MinuteOfDay,
  ScheduleColumn,
  ScheduledAppointment,
  ScheduleSummary,
  ShiftBlock,
} from '@nexuvi/api-contracts';

import {
  APPOINTMENT_SEEDS,
  FACILITIES,
  SHIFT_SEEDS,
  findRosterClinician,
  minuteOf,
} from '../../infrastructure/persistence/roster-store';

/** Row granularity of the grid. */
const SLOT_MINUTES = 15;

/** Statuses that consume a clinician's time. A cancellation frees the slot; a no-show does not. */
const CONSUMES_TIME = new Set(['booked', 'arrived', 'in-progress', 'completed', 'no-show']);

/** Padding around the day's content so the first and last blocks are not flush to the edge. */
const GRID_PADDING_MINUTES = 30;

/** Fallback window when a facility has no roster at all for the date. */
const EMPTY_DAY = { start: minuteOf('08:00'), end: minuteOf('17:00') } as const;

/**
 * Builds the day schedule for one facility.
 *
 * The service answers "who is working" and "what is booked" as two separate layers, then
 * reports where they disagree. Everything a caller would otherwise have to recompute —
 * bookable minutes, utilisation, conflicts — is derived here once, so two clients cannot
 * arrive at different numbers for the same day.
 */
@Injectable()
export class ScheduleService {
  /** Facilities belonging to one tenant. `tenantId` comes from the verified session. */
  listFacilities(tenantId: string): readonly FacilitySummary[] {
    return FACILITIES.filter((f) => f.tenantId === tenantId).map(toWireFacility);
  }

  getDaySchedule(
    tenantId: string,
    facilityId: string | undefined,
    date: string | undefined,
  ): DaySchedule {
    // Resolution is scoped to the tenant *before* matching on id or slug. Searching the
    // whole estate and checking ownership afterwards would let another customer's slug
    // resolve — and slugs are guessable in a way ids are not.
    const withinTenant = FACILITIES.filter((f) => f.tenantId === tenantId);

    const facility = facilityId
      ? withinTenant.find((f) => f.id === facilityId || f.slug === facilityId)
      : withinTenant[0];

    if (!facility) {
      // Same wording whether the facility belongs to someone else or does not exist.
      throw new NotFoundException(`Facility ${facilityId} not found or not accessible.`);
    }

    const isoDate = normaliseDate(date);
    const weekday = isoWeekday(isoDate);

    const columns = this.buildColumns(facility.id, weekday);
    const { dayStartMinute, dayEndMinute } = gridWindow(columns);

    return {
      date: isoDate,
      facility: toWireFacility(facility),
      dayStartMinute,
      dayEndMinute,
      slotMinutes: SLOT_MINUTES,
      columns,
      summary: summarise(columns),
    };
  }

  // ---------------------------------------------------------------------------

  private buildColumns(facilityId: string, weekday: number): readonly ScheduleColumn[] {
    // A clinician appears in this facility's grid only if they are rostered here today.
    // Membership is expressed by shifts rather than a separate roster table, which is what
    // lets one clinician appear in two facilities on different days.
    // Shifts are reached only through a facility that has already been tenant-scoped
    // above, so filtering by `facilityId` here cannot cross a tenant boundary.
    const clinicianIds = [
      ...new Set(
        SHIFT_SEEDS.filter(
          (s) => s.facilityId === facilityId && s.kind === 'shift' && s.weekdays.includes(weekday),
        ).map((s) => s.clinicianId),
      ),
    ];

    return clinicianIds
      .map((clinicianId) => this.buildColumn(clinicianId, facilityId, weekday))
      .filter((column): column is ScheduleColumn => column !== null)
      .sort((a, b) => a.clinicianName.localeCompare(b.clinicianName));
  }

  private buildColumn(
    clinicianId: string,
    facilityId: string,
    weekday: number,
  ): ScheduleColumn | null {
    const clinician = findRosterClinician(clinicianId);
    if (!clinician) return null;

    const shifts: ShiftBlock[] = SHIFT_SEEDS.filter(
      (s) =>
        s.clinicianId === clinicianId &&
        s.facilityId === facilityId &&
        s.weekdays.includes(weekday),
    )
      .map((s) => ({
        kind: s.kind,
        startMinute: minuteOf(s.start),
        endMinute: minuteOf(s.end),
        ...(s.label === undefined ? {} : { label: s.label }),
      }))
      .sort((a, b) => a.startMinute - b.startMinute);

    const raw = APPOINTMENT_SEEDS.filter(
      (a) =>
        a.clinicianId === clinicianId &&
        a.facilityId === facilityId &&
        a.weekdays.includes(weekday),
    )
      .map((a, index) => ({
        id: `apt_${clinicianId}_${index}`,
        reference: a.reference,
        patientName: a.patientName,
        patientId: a.patientId,
        serviceLabel: a.serviceLabel,
        type: a.type,
        status: a.status,
        startMinute: minuteOf(a.start),
        endMinute: minuteOf(a.end),
        ...(a.room === undefined ? {} : { room: a.room }),
        severity: a.severity ?? ('normal' as const),
        flags: a.flags ?? [],
      }))
      .sort((a, b) => a.startMinute - b.startMinute);

    const appointments: ScheduledAppointment[] = raw.map((appointment) => ({
      ...appointment,
      conflict: isConflicting(appointment, raw, shifts),
    }));

    const bookableMinutes = computeBookableMinutes(shifts);
    const bookedMinutes = appointments
      .filter((a) => CONSUMES_TIME.has(a.status))
      .reduce((sum, a) => sum + (a.endMinute - a.startMinute), 0);

    return {
      clinicianId,
      clinicianName: clinician.name,
      role: clinician.role,
      credential: clinician.credential,
      shifts,
      appointments,
      bookableMinutes,
      bookedMinutes,
      utilisation:
        bookableMinutes === 0 ? 0 : Math.round((bookedMinutes / bookableMinutes) * 100) / 100,
      conflictCount: appointments.filter((a) => a.conflict).length,
    };
  }
}

// -----------------------------------------------------------------------------
// Derivations
// -----------------------------------------------------------------------------

interface Span {
  readonly startMinute: MinuteOfDay;
  readonly endMinute: MinuteOfDay;
}

function overlaps(a: Span, b: Span): boolean {
  // Touching spans do not overlap: an appointment ending at 10:00 and another starting at
  // 10:00 are back-to-back, which is normal booking, not a clash.
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

/**
 * An appointment conflicts when it double-books the clinician, lands on a break or
 * unavailable block, or falls outside their rostered coverage entirely.
 *
 * Cancelled appointments are exempt: a cancelled slot no longer competes for the
 * clinician's time, and flagging it would leave a warning on the grid that nobody can
 * clear.
 */
function isConflicting(
  appointment: ScheduledAppointment | Omit<ScheduledAppointment, 'conflict'>,
  siblings: readonly Omit<ScheduledAppointment, 'conflict'>[],
  shifts: readonly ShiftBlock[],
): boolean {
  if (appointment.status === 'cancelled') return false;

  const doubleBooked = siblings.some(
    (other) =>
      other.reference !== appointment.reference &&
      other.status !== 'cancelled' &&
      overlaps(appointment, other),
  );
  if (doubleBooked) return true;

  const blocking = shifts.filter((s) => s.kind !== 'shift');
  if (blocking.some((block) => overlaps(appointment, block))) return true;

  const covered = shifts
    .filter((s) => s.kind === 'shift')
    .some((s) => appointment.startMinute >= s.startMinute && appointment.endMinute <= s.endMinute);

  return !covered;
}

/** Shift time less breaks and unavailable time — the minutes that can actually be booked. */
function computeBookableMinutes(shifts: readonly ShiftBlock[]): number {
  const working = shifts.filter((s) => s.kind === 'shift');
  const blocked = shifts.filter((s) => s.kind !== 'shift');

  const total = working.reduce((sum, s) => sum + (s.endMinute - s.startMinute), 0);

  // Only the part of a block that actually falls inside a shift is deducted; a break
  // recorded outside the shift would otherwise subtract time the clinician never had.
  const deducted = blocked.reduce((sum, block) => {
    const inside = working.reduce((acc, shift) => {
      const start = Math.max(block.startMinute, shift.startMinute);
      const end = Math.min(block.endMinute, shift.endMinute);
      return acc + Math.max(0, end - start);
    }, 0);
    return sum + inside;
  }, 0);

  return Math.max(0, total - deducted);
}

/** The window the grid must render, padded so nothing sits flush against the edge. */
function gridWindow(columns: readonly ScheduleColumn[]): {
  dayStartMinute: number;
  dayEndMinute: number;
} {
  const points = columns.flatMap((c) => [
    ...c.shifts.flatMap((s) => [s.startMinute, s.endMinute]),
    ...c.appointments.flatMap((a) => [a.startMinute, a.endMinute]),
  ]);

  if (points.length === 0) {
    return { dayStartMinute: EMPTY_DAY.start, dayEndMinute: EMPTY_DAY.end };
  }

  const earliest = Math.min(...points) - GRID_PADDING_MINUTES;
  const latest = Math.max(...points) + GRID_PADDING_MINUTES;

  // Snap outward to whole hours so the row labels read 08:00, 09:00 rather than 07:45.
  return {
    dayStartMinute: Math.max(0, Math.floor(earliest / 60) * 60),
    dayEndMinute: Math.min(24 * 60, Math.ceil(latest / 60) * 60),
  };
}

/** Strips the internal `tenantId` before the facility crosses the wire. */
function toWireFacility(facility: FacilitySummary & { tenantId: string }): FacilitySummary {
  const { tenantId: _omitted, ...wire } = facility;
  return wire;
}

function summarise(columns: readonly ScheduleColumn[]): ScheduleSummary {
  const appointments = columns.flatMap((c) => c.appointments);
  const bookable = columns.reduce((sum, c) => sum + c.bookableMinutes, 0);
  const booked = columns.reduce((sum, c) => sum + c.bookedMinutes, 0);

  return {
    cliniciansOnShift: columns.filter((c) => c.bookableMinutes > 0).length,
    cliniciansOffShift: columns.filter((c) => c.bookableMinutes === 0).length,
    appointmentCount: appointments.filter((a) => a.status !== 'cancelled').length,
    cancelledCount: appointments.filter((a) => a.status === 'cancelled').length,
    conflictCount: appointments.filter((a) => a.conflict).length,
    openMinutes: Math.max(0, bookable - booked),
    utilisation: bookable === 0 ? 0 : Math.round((booked / bookable) * 100) / 100,
  };
}

/** `YYYY-MM-DD`, defaulting to today. An unparseable date falls back rather than erroring. */
function normaliseDate(date: string | undefined): string {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date))) {
    return date;
  }
  return new Date().toISOString().slice(0, 10);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
function isoWeekday(isoDate: string): number {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}
