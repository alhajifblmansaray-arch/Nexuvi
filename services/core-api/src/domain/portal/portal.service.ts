import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  PortalAppointment,
  PortalOverview,
  PortalPatient,
  PortalResult,
  PortalVisit,
} from '@nexuvi/api-contracts';

import { patientStore, type PatientResult } from '../../infrastructure/persistence/patient-store';
import { clinicalStore } from '../../infrastructure/persistence/clinical-store';
import { FACILITIES } from '../../infrastructure/persistence/roster-store';

/**
 * What a patient sees about themselves.
 *
 * Every method takes `(tenantId, patientId)` from the **verified token**, and there is no
 * variant that takes them from a request. A portal endpoint that accepts a patient id is
 * one guessed identifier away from being a breach, so the id never travels that way.
 */
@Injectable()
export class PortalService {
  getOverview(tenantId: string, patientId: string): PortalOverview {
    const record = patientStore.findPatient(tenantId, patientId);
    if (!record) {
      // Same wording whether the record belongs to another tenant or does not exist.
      throw new NotFoundException('Record not found.');
    }

    const now = clinicalStore.now();
    const results = patientStore
      .resultsFor(tenantId, patientId)
      .map((result) => toPortalResult(result, now));

    const upcoming = this.upcomingFor(tenantId, record.recordNumber, now);

    return {
      generatedAt: now.toISOString(),
      patient: toPortalPatient(record),
      nextAppointment: upcoming[0] ?? null,
      upcoming,
      recentVisits: this.visitsFor(tenantId, record.recordNumber),
      // Only results the patient may actually see. The count below carries the rest.
      results: results.filter((r) => r.release !== 'pending-review'),
      resultsAwaitingReview: results.filter((r) => r.release === 'pending-review').length,
    };
  }

  // ---------------------------------------------------------------------------

  /**
   * Upcoming appointments.
   *
   * Derived from the clinical fixture by record number. When the appointment module lands
   * this reads its query service instead; the portal never reaches into another module's
   * tables (§10.2).
   */
  private upcomingFor(
    tenantId: string,
    recordNumber: string,
    now: Date,
  ): readonly PortalAppointment[] {
    const facilityName = FACILITIES.find((f) => f.tenantId === tenantId)?.name ?? 'Your clinic';

    return clinicalStore
      .listEncounters(tenantId)
      .filter((e) => e.patientId === recordNumber)
      .filter((e) => e.status === 'scheduled' || e.status === 'checked-in')
      .map((e) => ({
        id: e.id,
        startsAt: e.startedAt,
        endsAt: new Date(new Date(e.startedAt).getTime() + 30 * 60_000).toISOString(),
        serviceLabel: e.reasonForVisit,
        clinicianName: e.clinicianName,
        facilityName,
        location: e.department,
        status: 'booked' as const,
      }))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  private visitsFor(tenantId: string, recordNumber: string): readonly PortalVisit[] {
    const facilityName = FACILITIES.find((f) => f.tenantId === tenantId)?.name ?? 'Your clinic';

    return clinicalStore
      .listEncounters(tenantId)
      .filter((e) => e.patientId === recordNumber)
      .filter((e) => e.status === 'completed')
      .map((e) => ({
        id: e.id,
        date: e.startedAt.slice(0, 10),
        reason: e.reasonForVisit,
        clinicianName: e.clinicianName,
        facilityName,
        department: e.department,
      }));
  }
}

function toPortalPatient(record: {
  givenName: string;
  familyName: string;
  recordNumber: string;
  dateOfBirth: string | null;
  allergies: readonly string[];
}): PortalPatient {
  return {
    displayName: `${record.givenName} ${record.familyName}`,
    givenName: record.givenName,
    recordNumber: record.recordNumber,
    dateOfBirth: record.dateOfBirth,
    allergies: record.allergies,
  };
}

/**
 * Projects a stored result into what the patient may see.
 *
 * **The summary is only ever attached to a released result.** It is stripped here rather
 * than filtered at the edge, so a future endpoint that returns results cannot accidentally
 * expose a value by forgetting a filter — the unreleased shape simply has no value in it.
 *
 * A patient reading an abnormal result at 23:00, with no clinician available and no context
 * for what it means, is a known cause of avoidable harm. `pending-review` is a state the
 * portal renders honestly, not an absence it hides.
 */
function toPortalResult(result: PatientResult, now: Date): PortalResult {
  const requestedAt = new Date(now.getTime() - result.requestedAtMinutesAgo * 60_000).toISOString();

  if (result.release === 'pending-review') {
    return {
      id: result.id,
      name: result.name,
      requestedAt,
      release: 'pending-review',
    };
  }

  const reportedAt =
    result.reportedAtMinutesAgo === undefined
      ? undefined
      : new Date(now.getTime() - result.reportedAtMinutesAgo * 60_000).toISOString();

  return {
    id: result.id,
    name: result.name,
    requestedAt,
    release: result.release,
    ...(reportedAt ? { reportedAt } : {}),
    ...(result.summary ? { summary: result.summary } : {}),
    ...(result.outOfRange === undefined ? {} : { outOfRange: result.outOfRange }),
  };
}
