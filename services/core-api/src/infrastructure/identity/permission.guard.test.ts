import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC } from './auth.guard';
import {
  IS_PATIENT_ROUTE,
  PermissionGuard,
  assertFacilityAccess,
  canAccessFacility,
  scopeFacilities,
} from './permission.guard';
import {
  runWithContext,
  type AnyPrincipal,
  type PatientPrincipal,
  type Principal,
  type RequestContext,
} from '../context/request-context';

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    subjectType: 'staff',
    userId: 'usr_1',
    email: 'a@b.test',
    displayName: 'Test User',
    tenantId: 'ten_1',
    countryCellId: 'cell_sl',
    roles: ['nurse'],
    permissions: new Set(['encounter:read']),
    facilityIds: new Set(['fac_1']),
    ...overrides,
  };
}

function contextWith(p: AnyPrincipal | undefined): RequestContext {
  return {
    correlationId: 'test-correlation-id',
    startedAt: Date.now(),
    method: 'GET',
    path: '/api/test',
    ipAddress: '127.0.0.1',
    principal: p,
    requestHost: 'localhost:3001',
    hostTenantId: undefined,
  };
}

/** Minimal ExecutionContext double — the guard only uses handler/class for metadata. */
function executionContext(): any {
  const handler = () => undefined;
  class TestController {}
  return {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({ getRequest: () => ({}) }),
  };
}

/**
 * Reflector double.
 *
 * Must dispatch on the metadata key. The guard reads `IS_PUBLIC` first, so a double that
 * returns the same value for every key makes any truthy permissions array read as "this
 * route is public" — and the guard then allows everything.
 */
function reflectorReturning(permissions: unknown, isPublic = false): Reflector {
  return {
    getAllAndOverride: (key: string) => {
      if (key === IS_PUBLIC) return isPublic;
      if (key === IS_PATIENT_ROUTE) return false;
      return permissions;
    },
  } as unknown as Reflector;
}

/** A route marked `@PatientRoute()`. */
function patientRouteReflector(): Reflector {
  return {
    getAllAndOverride: (key: string) => key === IS_PATIENT_ROUTE,
  } as unknown as Reflector;
}

describe('PermissionGuard', () => {
  it('fails closed when a route declares no required permission', () => {
    // The likeliest authorization mistake is forgetting the annotation on a new endpoint.
    // That must be a 403 in development, not an open endpoint in production.
    const guard = new PermissionGuard(reflectorReturning(undefined));

    runWithContext(contextWith(principal()), () => {
      assert.throws(() => guard.canActivate(executionContext()), ForbiddenException);
    });
  });

  it('allows a route that explicitly requires nothing', () => {
    const guard = new PermissionGuard(reflectorReturning([]));
    runWithContext(contextWith(principal()), () => {
      assert.equal(guard.canActivate(executionContext()), true);
    });
  });

  it('allows when the principal holds the required permission', () => {
    const guard = new PermissionGuard(reflectorReturning(['encounter:read']));
    runWithContext(contextWith(principal()), () => {
      assert.equal(guard.canActivate(executionContext()), true);
    });
  });

  it('refuses when the principal is missing one of several permissions', () => {
    // Multiple permissions are ALL required, not any.
    const guard = new PermissionGuard(reflectorReturning(['encounter:read', 'audit:read']));
    runWithContext(contextWith(principal()), () => {
      assert.throws(() => guard.canActivate(executionContext()), ForbiddenException);
    });
  });

  it('names the missing capability so it can be granted', () => {
    const guard = new PermissionGuard(reflectorReturning(['encounter:assign']));
    runWithContext(contextWith(principal()), () => {
      assert.throws(
        () => guard.canActivate(executionContext()),
        (error: Error) => error.message.includes('encounter:assign'),
      );
    });
  });

  it('lets a public route through without a principal', () => {
    const guard = new PermissionGuard(reflectorReturning(undefined, true));
    runWithContext(contextWith(undefined), () => {
      assert.equal(guard.canActivate(executionContext()), true);
    });
  });

  it('refuses when there is no principal at all', () => {
    const guard = new PermissionGuard(reflectorReturning(['encounter:read']));
    runWithContext(contextWith(undefined), () => {
      assert.throws(() => guard.canActivate(executionContext()), ForbiddenException);
    });
  });
});

describe('subject types', () => {
  const patient: PatientPrincipal = {
    subjectType: 'patient',
    userId: 'pusr_1',
    patientId: 'pat_1',
    tenantId: 'ten_1',
    displayName: 'A Patient',
  };

  it('refuses a patient token on a capability-gated staff route', () => {
    // The single most dangerous confusion in the system: a patient reaching the clinical
    // workspace. Their empty permission set would already fail; refusing on subject type
    // means it keeps failing if someone later grants a patient a permission by mistake.
    const guard = new PermissionGuard(reflectorReturning(['encounter:read']));
    runWithContext(contextWith(patient), () => {
      assert.throws(() => guard.canActivate(executionContext()), ForbiddenException);
    });
  });

  it('refuses a patient even on a route that requires no permission', () => {
    const guard = new PermissionGuard(reflectorReturning([]));
    runWithContext(contextWith(patient), () => {
      assert.throws(() => guard.canActivate(executionContext()), ForbiddenException);
    });
  });

  it('allows a patient on a patient route', () => {
    const guard = new PermissionGuard(patientRouteReflector());
    runWithContext(contextWith(patient), () => {
      assert.equal(guard.canActivate(executionContext()), true);
    });
  });

  it('refuses a staff token on a patient route', () => {
    // Not symmetry for its own sake: a staff token carries no patientId, so the handler
    // would have to guess whose record to return, and every guess is wrong.
    const guard = new PermissionGuard(patientRouteReflector());
    runWithContext(contextWith(principal()), () => {
      assert.throws(() => guard.canActivate(executionContext()), ForbiddenException);
    });
  });

  it('requires a session on a patient route', () => {
    const guard = new PermissionGuard(patientRouteReflector());
    runWithContext(contextWith(undefined), () => {
      assert.throws(() => guard.canActivate(executionContext()), ForbiddenException);
    });
  });
});

describe('facility scoping', () => {
  const FACILITIES = [{ id: 'fac_1' }, { id: 'fac_2' }, { id: 'fac_3' }];

  it('treats an empty facility set as organisation-wide', () => {
    const admin = principal({ facilityIds: new Set() });

    assert.equal(canAccessFacility(admin, 'fac_2'), true);
    assert.deepEqual(scopeFacilities(admin, FACILITIES), FACILITIES);
    assert.doesNotThrow(() => assertFacilityAccess(admin, 'fac_3'));
  });

  it('narrows the facility list to the session’s memberships', () => {
    const scoped = principal({ facilityIds: new Set(['fac_2']) });

    // Returning the whole estate would leak the organisation's shape — site names, count —
    // to anyone holding a token.
    assert.deepEqual(scopeFacilities(scoped, FACILITIES), [{ id: 'fac_2' }]);
  });

  it('refuses a facility outside the session’s scope', () => {
    const scoped = principal({ facilityIds: new Set(['fac_1']) });
    assert.throws(() => assertFacilityAccess(scoped, 'fac_2'), ForbiddenException);
  });

  it('does not distinguish "absent" from "not permitted"', () => {
    // Distinguishing them is an enumeration oracle over the tenant's facility ids.
    const scoped = principal({ facilityIds: new Set(['fac_1']) });

    const outOfScope = captureMessage(() => assertFacilityAccess(scoped, 'fac_2'));
    const nonExistent = captureMessage(() => assertFacilityAccess(scoped, 'fac_does_not_exist'));

    assert.equal(outOfScope, nonExistent);
  });
});

function captureMessage(fn: () => void): string {
  try {
    fn();
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
