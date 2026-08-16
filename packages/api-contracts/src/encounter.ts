/**
 * Encounter payloads.
 *
 * An encounter is one patient's contact with the service: a clinic visit, an admission,
 * a teleconsultation. It is the spine the rest of the clinical record hangs from —
 * orders, results, prescriptions, and notes all cite the encounter they arose in.
 */

import type { IsoTimestamp, Severity } from './common.ts';

/**
 * Where an encounter sits in its lifecycle.
 *
 * `blocked` is distinct from `on-hold`: blocked means the service cannot proceed
 * (no licensed clinician available, integration down), on-hold means someone chose to
 * pause it. Ops needs to tell those apart, because only one of them is theirs to fix.
 */
export type EncounterStatus =
  | 'scheduled'
  | 'checked-in'
  | 'in-progress'
  | 'awaiting-review'
  | 'blocked'
  | 'on-hold'
  | 'completed'
  | 'cancelled';

export type EncounterType = 'clinic-visit' | 'telehealth' | 'admission' | 'follow-up' | 'emergency';

/**
 * A patient-safety flag attached to an encounter.
 *
 * Rendered with the locked `clinical*` tokens, never with tenant-brand colour
 * (blueprint §19.1) — an allergy banner must look identical in every clinic.
 */
export interface ClinicalFlag {
  readonly kind: 'allergy' | 'critical-result' | 'controlled-substance' | 'infection-control';
  readonly label: string;
  readonly detail?: string;
}

export interface EncounterSummary {
  readonly id: string;
  readonly reference: string;
  readonly patientId: string;
  readonly patientName: string;
  readonly patientAge: number;
  readonly type: EncounterType;
  readonly status: EncounterStatus;
  readonly department: string;
  readonly clinicianId: string | null;
  readonly clinicianName: string | null;
  readonly startedAt: IsoTimestamp;
  /** Minutes since the encounter entered its current status. */
  readonly waitingMinutes: number;
  readonly severity: Severity;
  readonly flags: readonly ClinicalFlag[];
  readonly reasonForVisit: string;
}

/**
 * Body of `POST /encounters/:reference/assign`.
 *
 * `clinicianId: null` unassigns. Reassignment is the same call with a different id — the
 * audit log distinguishes the three cases from the previous value, so the client does not
 * have to know which verb it is performing.
 */
export interface AssignEncounterRequest {
  readonly clinicianId: string | null;
  /** Free text. Recorded on the audit event; required by the server when unassigning. */
  readonly reason?: string;
}

/** Query parameters for `GET /encounters`. */
export interface EncounterQuery {
  readonly status?: EncounterStatus;
  readonly department?: string;
  /** Free-text match against patient name and encounter reference. */
  readonly search?: string;
  readonly page?: number;
  readonly pageSize?: number;
}
