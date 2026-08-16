import type { ResultRelease } from '@nexuvi/api-contracts';

import { FREETOWN_GROUP, MAKENI_TRUST } from './tenants';

/**
 * Patient identities and portal-visible records.
 *
 * Two things this fixture is shaped to make testable:
 *
 * 1. **A person registered at two clinics is two records.** `PAT-00142` at Freetown and
 *    `MKN-01180` at Makeni are the same human being with the same name and date of birth,
 *    and they are deliberately *not* linked. Merging them would disclose care received at
 *    one clinic to the other, which is a cross-tenant breach wearing the costume of a
 *    helpful feature. If the platform ever offers a linked view, that is a patient-consented
 *    action with its own record — not a join.
 *
 * 2. **Results are withheld until released.** Every result carries a release state, and
 *    the portal never returns a value for one still under review.
 */

/** A portal login. Separate from the clinical record it can read. */
export interface PatientLogin {
  readonly id: string;
  readonly email: string;
  readonly tenantId: string;
  /** The single clinical record this login may read. */
  readonly patientId: string;
}

export interface PatientRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly recordNumber: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly dateOfBirth: string | null;
  readonly allergies: readonly string[];
}

export interface PatientResult {
  readonly id: string;
  readonly tenantId: string;
  readonly patientId: string;
  readonly name: string;
  readonly requestedAtMinutesAgo: number;
  readonly release: ResultRelease;
  readonly reportedAtMinutesAgo?: number;
  /** Held server-side and only ever emitted for a released result. */
  readonly summary?: string;
  readonly outOfRange?: boolean;
}

const PATIENTS: readonly PatientRecord[] = [
  {
    id: 'pat_0001',
    tenantId: FREETOWN_GROUP,
    recordNumber: 'PAT-00142',
    givenName: 'Fatmata',
    familyName: 'Koroma',
    dateOfBirth: '1992-03-14',
    allergies: ['Penicillin (anaphylaxis, 2021)'],
  },
  {
    id: 'pat_0002',
    tenantId: FREETOWN_GROUP,
    recordNumber: 'PAT-00156',
    givenName: 'Ibrahim',
    familyName: 'Turay',
    dateOfBirth: '1959-11-02',
    allergies: [],
  },
  // Same person as pat_0001, registered separately at another clinic. Not linked.
  {
    id: 'pat_9001',
    tenantId: MAKENI_TRUST,
    recordNumber: 'MKN-01180',
    givenName: 'Fatmata',
    familyName: 'Koroma',
    dateOfBirth: '1992-03-14',
    allergies: ['Penicillin'],
  },
];

const LOGINS: readonly PatientLogin[] = [
  {
    id: 'pusr_0001',
    email: 'fatmata.koroma@example.sl',
    tenantId: FREETOWN_GROUP,
    patientId: 'pat_0001',
  },
  { id: 'pusr_0002', email: 'ibrahim.turay@example.sl', tenantId: FREETOWN_GROUP, patientId: 'pat_0002' },
  // The same human at the other clinic signs in with a separate login to a separate record.
  { id: 'pusr_9001', email: 'fatmata.koroma@example.sl', tenantId: MAKENI_TRUST, patientId: 'pat_9001' },
];

const RESULTS: readonly PatientResult[] = [
  {
    id: 'res_0001',
    tenantId: FREETOWN_GROUP,
    patientId: 'pat_0001',
    name: 'Full blood count',
    requestedAtMinutesAgo: 2880,
    release: 'discussed',
    reportedAtMinutesAgo: 2700,
    summary: 'Haemoglobin low. Iron supplementation started; repeat in six weeks.',
    outOfRange: true,
  },
  {
    id: 'res_0002',
    tenantId: FREETOWN_GROUP,
    patientId: 'pat_0001',
    name: 'Malaria rapid diagnostic test',
    requestedAtMinutesAgo: 1440,
    release: 'released',
    reportedAtMinutesAgo: 1380,
    summary: 'Negative.',
    outOfRange: false,
  },
  {
    // The case the portal must handle honestly: reported, not yet released. The patient
    // sees that it exists and is with the care team — never the value.
    id: 'res_0003',
    tenantId: FREETOWN_GROUP,
    patientId: 'pat_0001',
    name: 'Liver function tests',
    requestedAtMinutesAgo: 180,
    release: 'pending-review',
    summary: 'ALT 210 U/L — markedly raised.',
    outOfRange: true,
  },
  {
    id: 'res_9001',
    tenantId: MAKENI_TRUST,
    patientId: 'pat_9001',
    name: 'Blood pressure series',
    requestedAtMinutesAgo: 600,
    release: 'released',
    reportedAtMinutesAgo: 540,
    summary: 'Averaging 148/92. Review booked.',
    outOfRange: true,
  },
];

export const patientStore = {
  /** Find a portal login. Scoped to a tenant: the same email exists at two clinics. */
  findLogin(tenantId: string, email: string): PatientLogin | undefined {
    const needle = email.trim().toLowerCase();
    return LOGINS.find((l) => l.tenantId === tenantId && l.email.toLowerCase() === needle);
  },

  findPatient(tenantId: string, patientId: string): PatientRecord | undefined {
    return PATIENTS.find((p) => p.tenantId === tenantId && p.id === patientId);
  },

  /**
   * Results for one patient.
   *
   * Both the tenant and the patient are required, and neither has a default. The summary
   * is left on the record here; stripping it for unreleased results is the portal
   * service's job, and it is tested.
   */
  resultsFor(tenantId: string, patientId: string): readonly PatientResult[] {
    return RESULTS.filter((r) => r.tenantId === tenantId && r.patientId === patientId);
  },

  listLogins(): readonly PatientLogin[] {
    return LOGINS;
  },
};
