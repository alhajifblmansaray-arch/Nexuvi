import { Injectable } from '@nestjs/common';
import type {
  AuditAction,
  AuditActor,
  AuditChange,
  AuditEvent,
  AuditQuery,
  AuditSource,
  Paginated,
} from '@nexuvi/api-contracts';

import { auditStore } from '../../infrastructure/persistence/audit-store';

/** What an caller supplies to record an event. Everything else the sink assigns itself. */
export interface AppendAuditEvent {
  readonly tenantId: string;
  readonly action: AuditAction;
  readonly actor: AuditActor;
  readonly subject: AuditEvent['subject'];
  readonly facilityId: string;
  readonly changes: readonly AuditChange[];
  readonly reason?: string;
  readonly source?: AuditSource;
}

/**
 * Append-only clinical audit sink.
 *
 * The public surface is `append` and `find`. There is deliberately no update, no delete,
 * and no way to hand out a mutable reference to a stored event — every read returns frozen
 * objects. Blueprint §19 makes the log immutable, and an immutability that depends on
 * callers behaving well is not immutability.
 *
 * `occurredAt` and `id` are assigned here rather than accepted from the caller. A caller
 * that can choose its own timestamp can reorder history.
 *
 * The Postgres adapter enforces the same shape at the database level: the audit table has
 * an `INSERT`-only grant and no `UPDATE`/`DELETE` policy
 * (`database/policies/rls-policies.sql`). This class is the second lock, not the only one.
 */
@Injectable()
export class AuditService {
  /**
   * Newest last. Insertion order is the record; nothing re-sorts it.
   *
   * A single list across every tenant, filtered on read. That is safe only because both
   * read methods below take a `tenantId` and neither has an overload without one — see the
   * note on those methods.
   */
  /**
   * Continues from whatever is already recorded rather than restarting at zero.
   *
   * Resetting the sequence on boot would mint ids that collide with existing entries, and
   * two events sharing an id in an append-only log makes the log ambiguous about which one
   * happened.
   */
  private sequence = auditStore.count();

  append(event: AppendAuditEvent): AuditEvent {
    this.sequence += 1;

    const recorded: AuditEvent = Object.freeze({
      id: `aud_${String(this.sequence).padStart(6, '0')}`,
      tenantId: event.tenantId,
      occurredAt: new Date().toISOString(),
      action: event.action,
      actor: Object.freeze({ ...event.actor }),
      subject: Object.freeze({ ...event.subject }),
      facilityId: event.facilityId,
      changes: Object.freeze(event.changes.map((c) => Object.freeze({ ...c }))),
      ...(event.reason === undefined ? {} : { reason: event.reason }),
      source: event.source ?? 'api',
    });

    auditStore.append(recorded);
    return recorded;
  }

  /**
   * Most recent first — the order a human reads a log in.
   *
   * `tenantId` is the first parameter and is required. An audit log is the one place a
   * cross-tenant read is *most* damaging — it names patients, clinicians, and what was done
   * to whom — and it is also the easiest place to forget a filter, because the natural
   * query is "by actor" or "by action", neither of which mentions a tenant.
   */
  find(tenantId: string, query: AuditQuery = {}): Paginated<AuditEvent> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));

    const matched = auditStore.all()
      .filter((e) => e.tenantId === tenantId)
      .filter((e) => (query.subjectId ? e.subject.id === query.subjectId : true))
      .filter((e) => (query.action ? e.action === query.action : true))
      .filter((e) => (query.actorId ? e.actor.userId === query.actorId : true))
      .slice()
      .reverse();

    const start = (page - 1) * pageSize;

    return {
      items: matched.slice(start, start + pageSize),
      total: matched.length,
      page,
      pageSize,
    };
  }

  /** Every event for one subject, oldest first — the history of a single encounter. */
  findForSubject(tenantId: string, subjectId: string): readonly AuditEvent[] {
    return auditStore.all().filter((e) => e.tenantId === tenantId && e.subject.id === subjectId);
  }
}
