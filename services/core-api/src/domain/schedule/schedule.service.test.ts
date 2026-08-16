import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';

import { ScheduleService } from './schedule.service';
import { FACILITIES } from '../../infrastructure/persistence/roster-store';
import { FREETOWN_GROUP } from '../../infrastructure/persistence/tenants';

const schedule = new ScheduleService();

const FREETOWN = FACILITIES[0]!.id;
const WATERLOO = FACILITIES[1]!.id;
const BO = FACILITIES[2]!.id;

/** Known weekdays in the fixture. 2026-08-10 is a Monday. */
const MONDAY = '2026-08-10';
const TUESDAY = '2026-08-11';
const WEDNESDAY = '2026-08-12';
const SUNDAY = '2026-08-16';

describe('ScheduleService', () => {
  describe('facility switching', () => {
    it('lists every connected facility', () => {
      assert.equal(schedule.listFacilities(FREETOWN_GROUP).length, 3);
    });

    it('defaults to the first facility when none is given', () => {
      assert.equal(schedule.getDaySchedule(FREETOWN_GROUP, undefined, MONDAY).facility.id, FREETOWN);
    });

    it('accepts a slug as well as an id, so URLs can be readable', () => {
      const bySlug = schedule.getDaySchedule(FREETOWN_GROUP, 'waterloo-community', MONDAY);
      assert.equal(bySlug.facility.id, WATERLOO);
    });

    it('throws NotFound for a facility the caller cannot reach', () => {
      assert.throws(() => schedule.getDaySchedule(FREETOWN_GROUP, 'fac_nope', MONDAY), NotFoundException);
    });

    it('shows a different roster per facility on the same date', () => {
      const freetown = schedule.getDaySchedule(FREETOWN_GROUP, FREETOWN, MONDAY);
      const bo = schedule.getDaySchedule(FREETOWN_GROUP, BO, MONDAY);

      assert.ok(freetown.columns.length > bo.columns.length);
      assert.notDeepEqual(
        freetown.columns.map((c) => c.clinicianId),
        bo.columns.map((c) => c.clinicianId),
      );
    });
  });

  describe('roster membership', () => {
    it('places one clinician at different facilities on different days', () => {
      // Dr. Sarah Conteh: Freetown Mon/Wed/Thu/Fri, Waterloo Tue.
      const monday = schedule.getDaySchedule(FREETOWN_GROUP, FREETOWN, MONDAY);
      const tuesday = schedule.getDaySchedule(FREETOWN_GROUP, WATERLOO, TUESDAY);

      assert.ok(monday.columns.some((c) => c.clinicianId === 'usr_101'));
      assert.ok(tuesday.columns.some((c) => c.clinicianId === 'usr_101'));

      // And she is not double-rostered: not in Freetown on the Tuesday.
      const freetownTuesday = schedule.getDaySchedule(FREETOWN_GROUP, FREETOWN, TUESDAY);
      assert.ok(!freetownTuesday.columns.some((c) => c.clinicianId === 'usr_101'));
    });

    it('returns an empty roster on a day nobody is rostered', () => {
      const sunday = schedule.getDaySchedule(FREETOWN_GROUP, FREETOWN, SUNDAY);
      assert.equal(sunday.columns.length, 0);
      assert.equal(sunday.summary.cliniciansOnShift, 0);
    });

    it('still returns a renderable window when nobody is on', () => {
      const sunday = schedule.getDaySchedule(FREETOWN_GROUP, FREETOWN, SUNDAY);
      assert.ok(sunday.dayEndMinute > sunday.dayStartMinute);
    });
  });

  describe('bookable minutes', () => {
    it('deducts breaks from shift time', () => {
      const column = schedule
        .getDaySchedule(FREETOWN_GROUP, FREETOWN, MONDAY)
        .columns.find((c) => c.clinicianId === 'usr_101')!;

      // 08:00–16:00 is 480 minutes, less a 45-minute lunch.
      assert.equal(column.bookableMinutes, 480 - 45);
    });

    it('deducts unavailable blocks as well as breaks', () => {
      // Dr. Michael Sesay on Wednesday: 09:00–17:00, 45m lunch, 15:00–17:00 governance.
      const column = schedule
        .getDaySchedule(FREETOWN_GROUP, FREETOWN, WEDNESDAY)
        .columns.find((c) => c.clinicianId === 'usr_102')!;

      assert.equal(column.bookableMinutes, 480 - 45 - 120);
    });

    it('never returns negative bookable time', () => {
      for (const facility of schedule.listFacilities(FREETOWN_GROUP)) {
        for (const date of [MONDAY, TUESDAY, WEDNESDAY, SUNDAY]) {
          for (const column of schedule.getDaySchedule(FREETOWN_GROUP, facility.id, date).columns) {
            assert.ok(column.bookableMinutes >= 0, `${column.clinicianName} on ${date}`);
          }
        }
      }
    });
  });

  describe('utilisation', () => {
    it('is booked over bookable, rounded server-side', () => {
      for (const column of schedule.getDaySchedule(FREETOWN_GROUP, FREETOWN, MONDAY).columns) {
        if (column.bookableMinutes === 0) {
          assert.equal(column.utilisation, 0);
          continue;
        }
        assert.equal(
          column.utilisation,
          Math.round((column.bookedMinutes / column.bookableMinutes) * 100) / 100,
        );
      }
    });

    it('excludes cancellations from booked time — a cancelled slot is free again', () => {
      const column = schedule
        .getDaySchedule(FREETOWN_GROUP, FREETOWN, MONDAY)
        .columns.find((c) => c.clinicianId === 'usr_101')!;

      const cancelled = column.appointments.filter((a) => a.status === 'cancelled');
      assert.ok(cancelled.length > 0, 'fixture must contain a cancellation to exercise this');

      const consuming = column.appointments
        .filter((a) => a.status !== 'cancelled')
        .reduce((sum, a) => sum + (a.endMinute - a.startMinute), 0);

      assert.equal(column.bookedMinutes, consuming);
    });
  });

  describe('conflicts', () => {
    it('flags a double-booked clinician on both appointments', () => {
      const column = schedule
        .getDaySchedule(FREETOWN_GROUP, FREETOWN, MONDAY)
        .columns.find((c) => c.clinicianId === 'usr_101')!;

      const clashing = column.appointments.filter((a) =>
        ['ENC-10944', 'ENC-10952'].includes(a.reference),
      );

      assert.equal(clashing.length, 2);
      assert.ok(clashing.every((a) => a.conflict), 'both sides of a clash must be flagged');
    });

    it('flags an appointment booked over a break', () => {
      const column = schedule
        .getDaySchedule(FREETOWN_GROUP, FREETOWN, MONDAY)
        .columns.find((c) => c.clinicianId === 'usr_104')!;

      const overLunch = column.appointments.find((a) => a.reference === 'ENC-11029');
      assert.equal(overLunch?.conflict, true);
    });

    it('does not flag back-to-back appointments', () => {
      // Touching spans are normal booking, not a clash.
      const column = schedule
        .getDaySchedule(FREETOWN_GROUP, FREETOWN, MONDAY)
        .columns.find((c) => c.clinicianId === 'usr_107')!;

      const backToBack = column.appointments.find((a) => a.reference === 'ENC-11034');
      assert.equal(backToBack?.conflict, false);
    });

    it('never flags a cancelled appointment — a warning nobody can clear is noise', () => {
      for (const facility of schedule.listFacilities(FREETOWN_GROUP)) {
        for (const column of schedule.getDaySchedule(FREETOWN_GROUP, facility.id, MONDAY).columns) {
          for (const appointment of column.appointments) {
            if (appointment.status === 'cancelled') {
              assert.equal(appointment.conflict, false, appointment.reference);
            }
          }
        }
      }
    });

    it('counts column conflicts consistently with the day summary', () => {
      const day = schedule.getDaySchedule(FREETOWN_GROUP, FREETOWN, MONDAY);
      const fromColumns = day.columns.reduce((sum, c) => sum + c.conflictCount, 0);
      assert.equal(day.summary.conflictCount, fromColumns);
    });
  });

  describe('grid window', () => {
    it('covers every block and appointment on the day', () => {
      const day = schedule.getDaySchedule(FREETOWN_GROUP, FREETOWN, MONDAY);

      for (const column of day.columns) {
        for (const span of [...column.shifts, ...column.appointments]) {
          assert.ok(span.startMinute >= day.dayStartMinute, 'a block starts before the grid');
          assert.ok(span.endMinute <= day.dayEndMinute, 'a block ends after the grid');
        }
      }
    });

    it('snaps to whole hours so row labels read cleanly', () => {
      const day = schedule.getDaySchedule(FREETOWN_GROUP, FREETOWN, MONDAY);
      assert.equal(day.dayStartMinute % 60, 0);
      assert.equal(day.dayEndMinute % 60, 0);
    });
  });

  describe('summary', () => {
    it('agrees with the columns it summarises', () => {
      const day = schedule.getDaySchedule(FREETOWN_GROUP, FREETOWN, MONDAY);
      const appointments = day.columns.flatMap((c) => c.appointments);

      assert.equal(
        day.summary.appointmentCount,
        appointments.filter((a) => a.status !== 'cancelled').length,
      );
      assert.equal(
        day.summary.cancelledCount,
        appointments.filter((a) => a.status === 'cancelled').length,
      );
      assert.equal(day.summary.cliniciansOnShift, day.columns.length);
    });

    it('reports open capacity as bookable time nothing is booked into', () => {
      const day = schedule.getDaySchedule(FREETOWN_GROUP, FREETOWN, MONDAY);
      const bookable = day.columns.reduce((s, c) => s + c.bookableMinutes, 0);
      const booked = day.columns.reduce((s, c) => s + c.bookedMinutes, 0);

      assert.equal(day.summary.openMinutes, bookable - booked);
      assert.ok(day.summary.openMinutes > 0, 'the fixture should leave some capacity free');
    });
  });

  describe('date handling', () => {
    it('falls back to today rather than erroring on a malformed date', () => {
      const today = new Date().toISOString().slice(0, 10);
      assert.equal(schedule.getDaySchedule(FREETOWN_GROUP, FREETOWN, 'not-a-date').date, today);
      assert.equal(schedule.getDaySchedule(FREETOWN_GROUP, FREETOWN, undefined).date, today);
    });
  });
});
