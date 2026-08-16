/**
 * Audit trail.
 *
 * Blueprint §19: every clinical state change must be attributable and immutable. The log
 * is append-only — there is no update and no delete in this contract, and that absence is
 * the whole design. A correction is a *new* event that references the one it corrects, so
 * the record of what was believed at the time survives the correction.
 *
 * This is why write paths could not ship before this module: an assignment the system
 * cannot account for afterwards is worse than one it refuses to make.
 */

import type { IsoTimestamp } from './common.ts';

/**
 * Who performed an action.
 *
 * Denormalised on purpose. The audit log records the actor's name and role *as they were
 * at the time*, because a clinician who later changes role or leaves the organisation must
 * not retroactively rewrite what the record says about who did what.
 */
export interface AuditActor {
  readonly userId: string;
  readonly displayName: string;
  readonly role: string;
}

/**
 * What happened.
 *
 * A closed set: an action the log has no name for is one nobody can search for later.
 * Adding a write path means adding its verb here first.
 */
export type AuditAction =
  | 'encounter.assigned'
  | 'encounter.reassigned'
  | 'encounter.unassigned'
  | 'encounter.status-changed'
  /** Platform actions. A bug in provisioning creates or modifies a paying customer. */
  | 'tenant.provisioned'
  | 'tenant.suspended'
  /** Identity. Who gained access to a clinic, and on whose invitation. */
  | 'user.invited'
  | 'user.joined';

/** How the action reached the system. */
export type AuditSource = 'ui' | 'api' | 'integration' | 'system';

/** A single immutable entry. */
export interface AuditEvent {
  readonly id: string;
  /**
   * Owning tenant.
   *
   * Recorded on the event rather than derived by joining the subject, because the audit
   * log is queried by actor and by action as often as by subject — and a filter that
   * depends on a join is a filter someone eventually writes without.
   */
  readonly tenantId: string;
  readonly occurredAt: IsoTimestamp;
  readonly action: AuditAction;
  readonly actor: AuditActor;

  /** What the action was performed on. */
  readonly subject: {
    readonly type: 'encounter' | 'tenant' | 'user';
    readonly id: string;
    /** Human-facing reference, so the log is searchable without joining. */
    readonly reference: string;
  };

  readonly facilityId: string;

  /**
   * The specific fields that moved. Only changed fields appear, and both sides are
   * recorded — "assigned to Dr. Conteh" is not answerable later without knowing what it
   * was assigned to before.
   */
  readonly changes: readonly AuditChange[];

  /**
   * Why. Optional for routine actions, mandatory for break-glass and for any override of
   * a clinical safety check (§16.3).
   */
  readonly reason?: string;

  readonly source: AuditSource;
}

export interface AuditChange {
  readonly field: string;
  readonly from: string | null;
  readonly to: string | null;
}

/**
 * Query parameters for `GET /audit`.
 *
 * Note what is absent: a tenant parameter. The tenant is taken from the caller's verified
 * session, never from the query — §17.3. A tenant that can be *asked for* is a tenant that
 * can be guessed.
 */
export interface AuditQuery {
  readonly subjectId?: string;
  readonly action?: AuditAction;
  readonly actorId?: string;
  readonly page?: number;
  readonly pageSize?: number;
}
