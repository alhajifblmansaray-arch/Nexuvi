import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuditActor } from '@nexuvi/api-contracts';

/**
 * Per-request context.
 *
 * Held in `AsyncLocalStorage` rather than passed down through every method signature.
 * That is a deliberate exception to "pass your dependencies": the alternative is threading
 * an actor and a tenant id through every service, repository, and query builder, and the
 * one place someone forgets is the place a query runs without a tenant filter.
 *
 * The rule that keeps this honest: **nothing writes to the context after the middleware
 * has established it.** It is set once, at the edge, from verified token claims — never
 * from a request body (§17.3) — and is read-only thereafter.
 */

/**
 * What kind of subject a token represents.
 *
 * Staff and patients are **separate identity domains**, not two roles in one. A staff user
 * is one identity with memberships across tenants; a patient registered at two clinics is
 * two records that must never be merged, because merging them is a cross-tenant disclosure
 * of care they received elsewhere.
 *
 * Carrying the distinction in the token — and checking it in the guards — means a patient
 * token cannot satisfy a staff route even if someone later grants a patient a permission
 * string by accident. Empty permissions would already fail closed; this makes it fail
 * closed for a reason that cannot be edited away.
 */
export type SubjectType = 'staff' | 'patient';

/** The verified caller. */
export interface Principal {
  readonly subjectType: 'staff';
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  /** The organisation context this session is operating in (§16.2). */
  readonly tenantId: string;
  readonly countryCellId: string;
  readonly roles: readonly string[];
  /** Resolved capability strings, e.g. `encounter:read`. */
  readonly permissions: ReadonlySet<string>;
  /**
   * Facilities this session may reach. An **empty set means every facility in the tenant** —
   * the shape an organisation-wide administrator has.
   */
  readonly facilityIds: ReadonlySet<string>;
  /** Set when a support agent is acting as this user (§16.3). Never silent. */
  readonly supportActorId?: string;
}

/**
 * A signed-in patient.
 *
 * Note what it does **not** carry: a permission set or a facility list. A patient's
 * authority is not a capability grant, it is a single fact — *this record, and no other*.
 * Modelling it as permissions would invite a future route to check `permissions.has(...)`
 * and forget the part that matters.
 */
export interface PatientPrincipal {
  readonly subjectType: 'patient';
  /** The portal login identity. */
  readonly userId: string;
  /** The clinical record this login may read. The only record it may read. */
  readonly patientId: string;
  readonly tenantId: string;
  readonly displayName: string;
}

export type AnyPrincipal = Principal | PatientPrincipal;

export interface RequestContext {
  /** Correlates every log line, audit entry, and downstream call for one request. */
  readonly correlationId: string;
  readonly startedAt: number;
  readonly method: string;
  readonly path: string;
  readonly ipAddress: string | undefined;
  /** Absent on unauthenticated routes (health, docs). */
  readonly principal: AnyPrincipal | undefined;
  /**
   * The host the request arrived on, normalised. Used to tell a local caller from a
   * remote one — see the development token endpoint.
   */
  readonly requestHost: string | undefined;
  /**
   * Tenant implied by the hostname, when the request arrived on a tenant domain.
   *
   * Selects *branding and public content* only. It never selects data — that is always the
   * verified token's tenant (§17.3). The two are cross-checked; see `requirePrincipal`.
   */
  readonly hostTenantId: string | undefined;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * Attaches the verified principal to the active context.
 *
 * The single sanctioned write, called once by `AuthGuard` after signature and claim checks
 * pass. It is a function rather than a mutable field so the cast lives in one place that
 * can be grepped, and so a second call is a loud failure instead of a silent identity swap
 * halfway through a request.
 */
export function attachPrincipal(principal: AnyPrincipal): void {
  const store = storage.getStore();
  if (!store) {
    throw new Error('Cannot attach a principal outside a request context.');
  }
  if (store.principal) {
    throw new Error('A principal is already attached to this request.');
  }
  (store as { principal: AnyPrincipal | undefined }).principal = principal;
}

/** The current context, or `undefined` outside a request (startup, background jobs). */
export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

export function currentCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

/**
 * The verified caller, whichever kind.
 *
 * Prefer {@link requirePrincipal} (staff) or {@link requirePatient} — they narrow the
 * subject type, so a staff-only code path cannot silently receive a patient.
 */
export function currentPrincipal(): AnyPrincipal | undefined {
  return storage.getStore()?.principal;
}

export class MissingPrincipalError extends Error {
  constructor() {
    super('No authenticated principal in the current request context.');
    this.name = 'MissingPrincipalError';
  }
}

/** The signed-in **staff** principal. Throws if the caller is a patient or absent. */
export function requirePrincipal(): Principal {
  const principal = storage.getStore()?.principal;
  if (!principal) throw new MissingPrincipalError();
  if (principal.subjectType !== 'staff') throw new WrongSubjectTypeError('staff');
  return principal;
}

/** The signed-in **patient**. Throws if the caller is staff or absent. */
export function requirePatient(): PatientPrincipal {
  const principal = storage.getStore()?.principal;
  if (!principal) throw new MissingPrincipalError();
  if (principal.subjectType !== 'patient') throw new WrongSubjectTypeError('patient');
  return principal;
}

export class WrongSubjectTypeError extends Error {
  constructor(readonly expected: SubjectType) {
    super(`This route requires a ${expected} session.`);
    this.name = 'WrongSubjectTypeError';
  }
}

/**
 * The principal as an audit actor.
 *
 * Under support impersonation the *support agent* is recorded as the actor, not the user
 * being represented. A log that credits the customer's own account for an action taken by
 * support is a false record (§16.3), and the whole point of the log is that it is not.
 */
export function principalAsActor(principal: Principal): AuditActor {
  if (principal.supportActorId) {
    return {
      userId: principal.supportActorId,
      displayName: `Support (as ${principal.displayName})`,
      role: 'Support agent',
    };
  }
  return {
    userId: principal.userId,
    displayName: principal.displayName,
    role: principal.roles[0] ?? 'Unknown role',
  };
}
