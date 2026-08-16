import { Controller, Get, Query } from '@nestjs/common';
import type { DaySchedule, FacilitySummary } from '@nexuvi/api-contracts';

import { ScheduleService } from './schedule.service';
import { requirePrincipal } from '../../infrastructure/context/request-context';
import {
  RequirePermission,
  assertFacilityAccess,
  scopeFacilities,
} from '../../infrastructure/identity/permission.guard';
import { PERMISSIONS } from '../../infrastructure/identity/permissions';

/**
 * Schedule read API.
 *
 * Read-only. Booking and rostering are write paths with their own audit obligations (§19)
 * and land with the appointment module.
 *
 * Both routes are **facility-scoped**. The permission guard answers "may this session read
 * schedules at all"; it cannot answer "may it read *this* facility's schedule", because
 * that depends on the request. So the check happens here, against the principal's
 * memberships — never against a facility id the caller supplies, which is the whole point
 * of §17.3.
 */
@Controller()
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  /**
   * Facilities the caller may switch between.
   *
   * Filtered to the session's memberships. Returning the tenant's whole estate would leak
   * the shape of the organisation to anyone with a token — site names, cities, and count —
   * to a receptionist who works at one of them.
   */
  @RequirePermission(PERMISSIONS.FACILITY_READ)
  @Get('facilities')
  listFacilities(): readonly FacilitySummary[] {
    const principal = requirePrincipal();
    // Two narrowings, in order: the tenant (a different customer), then the principal's
    // facility memberships (a different site at the same customer). They are separate
    // failures with separate blast radii, so neither stands in for the other.
    return scopeFacilities(principal, this.scheduleService.listFacilities(principal.tenantId));
  }

  /** One facility's day: who is rostered, and what is booked into their time. */
  @RequirePermission(PERMISSIONS.SCHEDULE_READ)
  @Get('schedule')
  getSchedule(
    @Query('facilityId') facilityId?: string,
    @Query('date') date?: string,
  ): DaySchedule {
    const principal = requirePrincipal();

    // With no facility requested, default to one this session can actually reach. The
    // service's own default is the tenant's first facility, which is right for an
    // organisation-wide administrator and wrong for everyone else — a receptionist at
    // Waterloo opening the schedule should land on Waterloo, not on a 403.
    const requested = facilityId ?? this.defaultFacilityFor(principal.facilityIds);

    // Resolved before the check so it runs against a real facility id rather than the
    // slug the caller sent; a check keyed on ids would otherwise let a slug through.
    const schedule = this.scheduleService.getDaySchedule(principal.tenantId, requested, date);
    assertFacilityAccess(principal, schedule.facility.id);

    return schedule;
  }

  private facilitiesForCurrentTenant() {
    return this.scheduleService.listFacilities(requirePrincipal().tenantId);
  }

  private defaultFacilityFor(scoped: ReadonlySet<string>): string | undefined {
    if (scoped.size === 0) return undefined; // Organisation-wide: the service default is fine.

    // Preserve the catalogue's order rather than the set's insertion order, so the landing
    // facility is stable across sessions instead of depending on token claim ordering.
    return this.facilitiesForCurrentTenant().find((f) => scoped.has(f.id))?.id;
  }
}
