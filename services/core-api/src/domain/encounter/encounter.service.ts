import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AuditActor,
  AuditChange,
  EncounterQuery,
  EncounterStatus,
  EncounterSummary,
  Paginated,
} from '@nexuvi/api-contracts';

import { clinicalStore } from '../../infrastructure/persistence/clinical-store';
import { AuditService } from '../audit/audit.service';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/**
 * Encounter queries and assignment.
 *
 * Assignment is the first write path in the system, and it is deliberately the smallest
 * one: it changes a single field, has an obvious inverse, and touches no clinical content.
 * Status transitions and closure follow, once this shape has proved itself.
 */
@Injectable()
export class EncounterService {
  constructor(private readonly audit: AuditService) {}

  find(tenantId: string, query: EncounterQuery): Paginated<EncounterSummary> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE));

    const filtered = clinicalStore
      .listEncounters(tenantId)
      .filter((e) => (query.status ? e.status === query.status : true))
      .filter((e) => (query.department ? e.department === query.department : true))
      .filter((e) => matchesSearch(e, query.search))
      .sort(byUrgencyThenWait);

    const start = (page - 1) * pageSize;

    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  findByReference(tenantId: string, reference: string): EncounterSummary {
    const match = clinicalStore.findEncounterByReference(tenantId, reference);

    if (!match) {
      throw new NotFoundException(`Encounter ${reference} not found or not accessible`);
    }
    return match;
  }

  /** Distinct departments present in the current result set, for the filter control. */
  listDepartments(tenantId: string): readonly string[] {
    return [...new Set(clinicalStore.listEncounters(tenantId).map((e) => e.department))].sort();
  }

  /** The facility roster, for the assignment control. */
  listClinicians(tenantId: string) {
    return clinicalStore.listClinicians(tenantId);
  }

  /**
   * Assign, reassign, or unassign an encounter's clinician.
   *
   * The audit entry is written inside this method rather than by the controller, so there
   * is no path that changes the assignment without recording it. If the log ever fails,
   * the exception propagates and the caller sees the operation fail — a silent success
   * here would leave state the system cannot account for, which §19 treats as worse than
   * refusing the action.
   */
  assign(
    tenantId: string,
    reference: string,
    clinicianId: string | null,
    actor: AuditActor,
    reason?: string,
  ): EncounterSummary {
    const encounter = this.findByReference(tenantId, reference);

    if (encounter.status === 'completed' || encounter.status === 'cancelled') {
      throw new BadRequestException(
        `Encounter ${encounter.reference} is ${encounter.status} and can no longer be reassigned.`,
      );
    }

    // Unassigning removes a named clinician's responsibility for a live patient. That is
    // exactly the kind of action a reviewer will later want a stated reason for.
    if (clinicianId === null && !reason?.trim()) {
      throw new BadRequestException('A reason is required when unassigning an encounter.');
    }

    let clinician = null;
    if (clinicianId !== null) {
      clinician = clinicalStore.findClinician(tenantId, clinicianId) ?? null;
      if (clinician === null) {
        throw new NotFoundException(`Clinician ${clinicianId} is not on this facility's roster.`);
      }
      if (clinician.state === 'off-shift') {
        throw new BadRequestException(
          `${clinician.name} is off shift. Assign to an available clinician, or record a reason and escalate.`,
        );
      }
    }

    if (encounter.clinicianId === clinicianId) {
      // Nothing moved. Recording an event here would fill the log with entries that
      // describe no change, which is how an audit trail becomes unreadable.
      return encounter;
    }

    const updated = clinicalStore.assignClinician(tenantId, encounter.id, clinician);

    const changes: AuditChange[] = [
      { field: 'clinicianId', from: encounter.clinicianId, to: updated.clinicianId },
      { field: 'clinicianName', from: encounter.clinicianName, to: updated.clinicianName },
    ];

    this.audit.append({
      tenantId,
      action: resolveAssignmentAction(encounter.clinicianId, updated.clinicianId),
      actor,
      subject: { type: 'encounter', id: updated.id, reference: updated.reference },
      facilityId: clinicalStore.facilityFor(tenantId).id,
      changes,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
      source: 'ui',
    });

    return updated;
  }
}

/**
 * Which verb the log records.
 *
 * Derived from the transition rather than taken from the client: the caller sends one
 * request shape for all three cases, and letting it also name the action would let it
 * mislabel its own history.
 */
function resolveAssignmentAction(
  from: string | null,
  to: string | null,
): 'encounter.assigned' | 'encounter.reassigned' | 'encounter.unassigned' {
  if (to === null) return 'encounter.unassigned';
  if (from === null) return 'encounter.assigned';
  return 'encounter.reassigned';
}

/** Free-text match across the fields a receptionist would actually type. */
function matchesSearch(encounter: EncounterSummary, search: string | undefined): boolean {
  if (!search) return true;
  const needle = search.trim().toLowerCase();
  if (needle === '') return true;
  return (
    encounter.patientName.toLowerCase().includes(needle) ||
    encounter.reference.toLowerCase().includes(needle) ||
    encounter.patientId.toLowerCase().includes(needle)
  );
}

const SEVERITY_RANK: Record<EncounterSummary['severity'], number> = {
  critical: 0,
  high: 1,
  warning: 2,
  info: 3,
  normal: 4,
};

/** Closed work sinks below open work regardless of how urgent it once was. */
const TERMINAL_STATUSES: ReadonlySet<EncounterStatus> = new Set(['completed', 'cancelled']);

function byUrgencyThenWait(a: EncounterSummary, b: EncounterSummary): number {
  const aTerminal = TERMINAL_STATUSES.has(a.status) ? 1 : 0;
  const bTerminal = TERMINAL_STATUSES.has(b.status) ? 1 : 0;
  return (
    aTerminal - bTerminal ||
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    b.waitingMinutes - a.waitingMinutes
  );
}
