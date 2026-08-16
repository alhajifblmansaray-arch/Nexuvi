/**
 * Patient portal payloads.
 *
 * Everything a *patient* sees about themselves. Deliberately a separate contract from the
 * clinical ones: `EncounterSummary` is written for a clinician triaging a queue, and
 * handing that shape to a patient would leak triage severity, internal references, and
 * staff notes that were never written to be read by the person they describe.
 *
 * ## Scope
 *
 * Every payload here is implicitly scoped to one patient — *the signed-in one*. There is
 * no `patientId` parameter on any portal query, and that absence is the design. A portal
 * endpoint that accepts a patient id is one guessed identifier away from being a breach.
 */

import type { IsoTimestamp, IsoDate } from './common.ts';

/** The signed-in patient's own summary. */
export interface PortalPatient {
  readonly displayName: string;
  readonly givenName: string;
  /** The clinic's own record number. Patients quote it on the phone. */
  readonly recordNumber: string;
  readonly dateOfBirth: IsoDate | null;
  /**
   * Allergies the clinic holds.
   *
   * Shown to patients on purpose: an allergy the record knows and the patient does not is
   * a safety gap, and a patient noticing a missing or wrong allergy is a genuine
   * correction path. Rendered with the locked `clinical*` tokens, identically at every
   * clinic (§19.1).
   */
  readonly allergies: readonly string[];
}

export type PortalAppointmentStatus = 'booked' | 'confirmed' | 'cancelled' | 'completed';

export interface PortalAppointment {
  readonly id: string;
  readonly startsAt: IsoTimestamp;
  readonly endsAt: IsoTimestamp;
  readonly serviceLabel: string;
  readonly clinicianName: string | null;
  readonly facilityName: string;
  readonly location: string | null;
  readonly status: PortalAppointmentStatus;
  /** Preparation the patient must do — fasting, bring medication, arrive early. */
  readonly instructions?: string;
}

/**
 * A past visit, as the patient sees it.
 *
 * No triage severity, no queue position, no internal encounter reference. Those are
 * operational facts about how the clinic ran that day, not clinical facts about the
 * patient, and showing them invites a reading nobody intended.
 */
export interface PortalVisit {
  readonly id: string;
  readonly date: IsoDate;
  readonly reason: string;
  readonly clinicianName: string | null;
  readonly facilityName: string;
  readonly department: string;
}

/**
 * Release state for a result.
 *
 * Results are **not** visible to a patient by default. A clinician releases them, and
 * until then the portal shows that a result exists and is with the care team rather than
 * the value itself.
 *
 * This is a clinical safety rule, not a product preference: a patient reading an abnormal
 * result at 23:00 with no clinician available, and no context for what it means, is a
 * known cause of avoidable harm. `pending-review` is therefore a first-class state the UI
 * renders honestly, not an absence it hides.
 */
export type ResultRelease = 'pending-review' | 'released' | 'discussed';

export interface PortalResult {
  readonly id: string;
  readonly name: string;
  readonly requestedAt: IsoTimestamp;
  readonly release: ResultRelease;
  /** Present only when `release` is not `pending-review`. */
  readonly reportedAt?: IsoTimestamp;
  /** Present only when released. Never populated for `pending-review`. */
  readonly summary?: string;
  /**
   * Set when the result is outside the reference range *and* released. Drives a "your
   * clinician has reviewed this" note rather than an alarming colour — the patient is not
   * the person who should be triaging it.
   */
  readonly outOfRange?: boolean;
}

/** Everything the portal home needs, in one read. */
export interface PortalOverview {
  readonly generatedAt: IsoTimestamp;
  readonly patient: PortalPatient;
  readonly nextAppointment: PortalAppointment | null;
  readonly upcoming: readonly PortalAppointment[];
  readonly recentVisits: readonly PortalVisit[];
  readonly results: readonly PortalResult[];
  /** Results the care team is still reviewing — counted, never detailed. */
  readonly resultsAwaitingReview: number;
}
