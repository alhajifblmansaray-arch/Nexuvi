import Link from 'next/link';
import type { AppointmentStatus, DaySchedule, ScheduleColumn } from '@nexuvi/api-contracts';

import { formatMinute, hourMarks, placeAppointments } from '../../lib/schedule-layout';
import { severityVar } from '../../lib/format';
import styles from './ScheduleGrid.module.css';

/** Pixels per minute. Sets the whole grid's vertical scale. */
const MINUTE_HEIGHT = 1.15;

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: 'Booked',
  arrived: 'Arrived',
  'in-progress': 'In progress',
  completed: 'Completed',
  'no-show': 'No show',
  cancelled: 'Cancelled',
};

/**
 * The day grid: a time gutter and one column per rostered clinician.
 *
 * Blocks are absolutely positioned inside each column rather than dropped into table
 * cells, because appointments do not respect slot boundaries — a 45-minute booking that
 * starts at 09:20 has to be drawn where it actually is, not rounded into the nearest row.
 * The row lines are background decoration; the geometry comes from the minute values.
 */
export function ScheduleGrid({ schedule }: { schedule: DaySchedule }) {
  const { dayStartMinute, dayEndMinute, columns } = schedule;
  const height = (dayEndMinute - dayStartMinute) * MINUTE_HEIGHT;
  const marks = hourMarks(dayStartMinute, dayEndMinute);

  if (columns.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>Nobody is rostered at this site today.</p>
        <p className={styles.emptyDetail}>
          No clinician has a shift at {schedule.facility.name} on this date. Check another
          date, or another site using the switcher above.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.scroll}>
      <div
        className={styles.grid}
        style={{ ['--column-count' as string]: columns.length }}
      >
        {/* Header row — sticky, so column identity survives scrolling a long day. */}
        <div className={`${styles.gutter} ${styles.gutterHead}`} />
        {columns.map((column) => (
          <ColumnHeader key={column.clinicianId} column={column} />
        ))}

        {/* Time gutter */}
        <div className={styles.gutter} style={{ height }}>
          {marks.map((minute) => (
            <span
              key={minute}
              className={styles.gutterLabel}
              style={{ top: (minute - dayStartMinute) * MINUTE_HEIGHT }}
            >
              {formatMinute(minute)}
            </span>
          ))}
        </div>

        {columns.map((column) => (
          <div key={column.clinicianId} className={styles.column} style={{ height }}>
            {/* Hour rules */}
            {marks.map((minute) => (
              <span
                key={minute}
                className={styles.rule}
                style={{ top: (minute - dayStartMinute) * MINUTE_HEIGHT }}
              />
            ))}

            {/* Coverage first, underneath everything. A column with no shift band is a
                column where nobody is working — the distinction the whole screen exists
                to make. */}
            {column.shifts.map((shift, index) => (
              <span
                key={`${shift.kind}-${shift.startMinute}-${index}`}
                className={styles.band}
                data-kind={shift.kind}
                style={{
                  top: (shift.startMinute - dayStartMinute) * MINUTE_HEIGHT,
                  height: (shift.endMinute - shift.startMinute) * MINUTE_HEIGHT,
                }}
                title={
                  shift.label ??
                  (shift.kind === 'shift' ? 'On shift' : 'Unavailable')
                }
              >
                {shift.kind !== 'shift' ? (
                  <span className={styles.bandLabel}>{shift.label ?? 'Unavailable'}</span>
                ) : null}
              </span>
            ))}

            {placeAppointments(column.appointments).map(({ appointment, lane, lanes }) => {
              const duration = appointment.endMinute - appointment.startMinute;
              return (
                <Link
                  key={appointment.id}
                  href={`/encounters/${appointment.reference}`}
                  className={styles.appointment}
                  data-status={appointment.status}
                  data-conflict={appointment.conflict ? 'true' : undefined}
                  data-compact={duration <= 30 ? 'true' : undefined}
                  style={{
                    top: (appointment.startMinute - dayStartMinute) * MINUTE_HEIGHT,
                    height: duration * MINUTE_HEIGHT,
                    left: `calc(${(lane / lanes) * 100}% + 2px)`,
                    width: `calc(${100 / lanes}% - 4px)`,
                    ['--stripe' as string]: severityVar(appointment.severity),
                  }}
                  title={`${formatMinute(appointment.startMinute)}–${formatMinute(
                    appointment.endMinute,
                  )} · ${appointment.patientName} · ${appointment.serviceLabel}${
                    appointment.conflict ? ' · CONFLICT' : ''
                  }`}
                >
                  <span className={styles.appointmentTime}>
                    {formatMinute(appointment.startMinute)}
                    {appointment.conflict ? (
                      <span className={styles.conflictMark} aria-label="Scheduling conflict">
                        ⚠
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.appointmentPatient}>{appointment.patientName}</span>
                  <span className={styles.appointmentService}>{appointment.serviceLabel}</span>
                  {appointment.flags.length > 0 ? (
                    <span className={styles.appointmentFlags}>
                      {appointment.flags.map((flag) => (
                        <span key={flag.label} className={styles.flag} data-kind={flag.kind}>
                          {flag.label}
                        </span>
                      ))}
                    </span>
                  ) : null}
                  <span className={styles.srOnly}>
                    {STATUS_LABEL[appointment.status]}
                    {appointment.room ? `, ${appointment.room}` : ''}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function ColumnHeader({ column }: { column: ScheduleColumn }) {
  const utilisationPercent = Math.round(column.utilisation * 100);

  return (
    <div className={styles.head}>
      <div className={styles.headTop}>
        <span className={styles.headName}>{column.clinicianName}</span>
        {column.conflictCount > 0 ? (
          <span className={styles.headConflicts} title={`${column.conflictCount} conflicts`}>
            {column.conflictCount}
          </span>
        ) : null}
      </div>
      <span className={styles.headRole}>
        {column.role} · {column.credential}
      </span>

      {/* Utilisation reads as a bar because the useful question is "how full", which is a
          proportion, not a number to be compared digit by digit. */}
      <div className={styles.headMeter} title={`${utilisationPercent}% of bookable time`}>
        <span
          className={styles.headMeterFill}
          style={{ width: `${Math.min(100, utilisationPercent)}%` }}
          data-busy={utilisationPercent >= 85 ? 'true' : undefined}
        />
      </div>
      <span className={styles.headStats}>
        <span className="tabular">{utilisationPercent}%</span> ·{' '}
        {Math.max(0, column.bookableMinutes - column.bookedMinutes)}m free
      </span>
    </div>
  );
}
