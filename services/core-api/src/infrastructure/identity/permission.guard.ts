import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC } from './auth.guard';
import { currentPrincipal, type Principal } from '../context/request-context';

export const REQUIRED_PERMISSIONS = 'nexuvi:permissions';
export const IS_PATIENT_ROUTE = 'nexuvi:patient-route';

/**
 * Marks a route as belonging to the patient portal.
 *
 * Patient routes take a patient token and **refuse a staff one**. The refusal in that
 * direction is not symmetry for its own sake: a clinician's token carries no `patientId`,
 * so a portal handler given one would have to guess whose record to return, and every
 * available guess is wrong. Better to refuse than to answer.
 *
 * These routes carry no `@RequirePermission`. A patient's authority is not a capability
 * grant — it is one fact, *this record*, enforced by reading `patientId` from the token
 * rather than from the request.
 */
export const PatientRoute = () => SetMetadata(IS_PATIENT_ROUTE, true);

/**
 * Declares the capabilities a route requires.
 *
 * Multiple permissions are **all** required, not any. "Any" semantics read the same in
 * source but grant strictly more, and a reader skimming a controller should not have to
 * know which one this is to know what it lets through.
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

/**
 * Enforces route capabilities.
 *
 * Registered globally and **fails closed**: an authenticated route with no
 * `@RequirePermission` is refused rather than allowed. Forgetting to annotate a new
 * clinical endpoint is the likeliest authorization mistake anyone will make here, and the
 * consequence of that mistake should be a 403 in development, not an open endpoint in
 * production.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const isPatientRoute = this.reflector.getAllAndOverride<boolean>(IS_PATIENT_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPatientRoute) {
      const caller = currentPrincipal();
      if (!caller) throw new ForbiddenException('No authenticated principal.');
      if (caller.subjectType !== 'patient') {
        throw new ForbiddenException('This endpoint requires a patient session.');
      }
      return true;
    }

    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) {
      throw new ForbiddenException(
        'This endpoint declares no required permission. Annotate it with @RequirePermission, ' +
          'or @PatientRoute if it belongs to the portal.',
      );
    }
    const principal = currentPrincipal();
    if (!principal) {
      throw new ForbiddenException('No authenticated principal.');
    }

    // Checked *before* the empty-requirement shortcut below. A route annotated
    // `@RequirePermission()` with no arguments is still a staff route, and letting a
    // patient through it because it happens to demand no capability would make the subject
    // boundary depend on how thoroughly each route was annotated.
    if (principal.subjectType !== 'staff') {
      throw new ForbiddenException('This endpoint requires a staff session.');
    }

    if (required.length === 0) return true;

    const missing = required.filter((permission) => !principal.permissions.has(permission));
    if (missing.length > 0) {
      // The missing capability is named. A clinician who cannot verify a prescription
      // needs to be able to tell their administrator what to grant, and "Forbidden" does
      // not survive that conversation.
      throw new ForbiddenException(`Missing required permission: ${missing.join(', ')}.`);
    }

    return true;
  }
}

/**
 * Whether this session may act within a facility.
 *
 * An empty `facilityIds` set means organisation-wide access, which is the shape an
 * administrator has. That is a real grant, not a missing value — but it is also why the
 * empty case has to be written down rather than left to a `.has()` returning false.
 */
export function canAccessFacility(principal: Principal, facilityId: string): boolean {
  return principal.facilityIds.size === 0 || principal.facilityIds.has(facilityId);
}

/** Throws unless the session may act within the facility. */
export function assertFacilityAccess(principal: Principal, facilityId: string): void {
  if (!canAccessFacility(principal, facilityId)) {
    // Deliberately the same wording whether the facility does not exist or is simply out
    // of scope. Distinguishing them tells an unauthorised caller which facility ids are
    // real, which is an enumeration oracle over the tenant's estate.
    throw new ForbiddenException('Facility not found or not accessible.');
  }
}

/** Narrows a list of facilities to the ones this session may see. */
export function scopeFacilities<T extends { id: string }>(
  principal: Principal,
  facilities: readonly T[],
): readonly T[] {
  if (principal.facilityIds.size === 0) return facilities;
  return facilities.filter((facility) => principal.facilityIds.has(facility.id));
}
