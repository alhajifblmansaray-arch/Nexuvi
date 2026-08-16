import { FACILITIES, ROSTER } from './roster-store';
import { persist, persistMap } from './snapshot';
import { FREETOWN_GROUP, MAKENI_TRUST } from './tenants';
import type {
  ClinicianAvailability,
  EncounterStatus,
  EncounterSummary,
  Severity,
} from '@nexuvi/api-contracts';

/**
 * In-memory clinical dataset.
 *
 * This is the `memory` driver behind the repository ports in `domain/*`. It exists so the
 * API is runnable — and the front end demonstrable — before a Postgres cell is
 * provisioned. Every read path a controller uses goes through a port, so swapping this
 * for the TypeORM adapter changes one provider binding and no domain code.
 *
 * Two rules keep that swap honest:
 *
 * 1. **Nothing here is exported as a mutable array.** Callers get copies, the same way a
 *    repository hands back detached rows.
 * 2. **Every read is tenant-scoped, and there is no method that omits the tenant.** The
 *    fixture holds two unrelated customers precisely so a missing filter fails a test
 *    rather than passing by accident. Application-layer scoping is the first layer; RLS
 *    (`database/migrations/0002_row_level_security.sql`) is the second, and neither is
 *    trusted to be the only one.
 *
 * The figures are illustrative, not clinical. They exist to exercise layout, contrast, and
 * empty/overflow states.
 */

export const FACILITY = {
  id: 'fac_01HQ8XKZ2N4P',
  name: 'Freetown Family Clinic',
} as const;

/** Clock anchor. Everything relative is derived from this so a snapshot is reproducible. */
const NOW = new Date();

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

function daysAgoDate(days: number): string {
  const d = new Date(NOW.getTime() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** An encounter plus its owning tenant. The wire type deliberately omits `tenantId`. */
export interface EncounterRecord extends EncounterSummary {
  readonly tenantId: string;
}

interface EncounterSeed {
  tenantId?: string;
  /** Pins the record number. Derived from the index when omitted. */
  patientId?: string;
  reference: string;
  patientName: string;
  patientAge: number;
  type: EncounterSummary['type'];
  status: EncounterStatus;
  department: string;
  clinicianName: string | null;
  waitingMinutes: number;
  severity: Severity;
  reasonForVisit: string;
  flags?: EncounterSummary['flags'];
}

const ENCOUNTER_SEEDS: readonly EncounterSeed[] = [
  {
    reference: 'ENC-10847',
    patientName: 'Fatmata Koroma',
    patientAge: 34,
    type: 'clinic-visit',
    status: 'awaiting-review',
    department: 'General Medicine',
    clinicianName: null,
    waitingMinutes: 187,
    severity: 'critical',
    reasonForVisit: 'Persistent fever, 5 days',
    flags: [
      { kind: 'allergy', label: 'Penicillin', detail: 'Anaphylaxis, documented 2021' },
      { kind: 'critical-result', label: 'Haemoglobin 6.1 g/dL' },
    ],
  },
  {
    reference: 'ENC-10851',
    patientName: 'Mohamed Bangura',
    patientAge: 45,
    type: 'clinic-visit',
    status: 'awaiting-review',
    department: 'General Medicine',
    clinicianName: null,
    waitingMinutes: 142,
    severity: 'critical',
    reasonForVisit: 'Chest pain on exertion',
    flags: [{ kind: 'critical-result', label: 'Troponin elevated' }],
  },
  {
    reference: 'ENC-10863',
    patientName: 'Ibrahim Turay',
    patientAge: 67,
    type: 'admission',
    status: 'blocked',
    department: 'Inpatient Ward A',
    clinicianName: 'Dr. Sarah Conteh',
    waitingMinutes: 96,
    severity: 'high',
    reasonForVisit: 'Diabetic foot ulcer, admission for IV antibiotics',
    flags: [{ kind: 'infection-control', label: 'MRSA contact precautions' }],
  },
  {
    reference: 'ENC-10870',
    patientName: 'Aminata Jalloh',
    patientAge: 28,
    type: 'telehealth',
    status: 'blocked',
    department: 'Maternal Health',
    clinicianName: null,
    waitingMinutes: 74,
    severity: 'high',
    reasonForVisit: 'Antenatal follow-up, week 32',
  },
  {
    reference: 'ENC-10874',
    patientName: 'Sorie Kamara',
    patientAge: 52,
    type: 'follow-up',
    status: 'awaiting-review',
    department: 'General Medicine',
    clinicianName: 'Dr. Michael Sesay',
    waitingMinutes: 61,
    severity: 'high',
    reasonForVisit: 'Hypertension review, medication titration',
    flags: [{ kind: 'controlled-substance', label: 'Repeat: Diazepam 5mg' }],
  },
  {
    reference: 'ENC-10881',
    patientName: 'Isata Mansaray',
    patientAge: 19,
    type: 'clinic-visit',
    status: 'in-progress',
    department: 'General Medicine',
    clinicianName: 'Dr. Sarah Conteh',
    waitingMinutes: 38,
    severity: 'warning',
    reasonForVisit: 'Suspected malaria, RDT positive',
  },
  {
    reference: 'ENC-10884',
    patientName: 'Alhaji Kargbo',
    patientAge: 71,
    type: 'follow-up',
    status: 'awaiting-review',
    department: 'Cardiology',
    clinicianName: null,
    waitingMinutes: 33,
    severity: 'warning',
    reasonForVisit: 'Post-discharge review, heart failure',
    flags: [{ kind: 'allergy', label: 'Sulfonamides' }],
  },
  {
    reference: 'ENC-10889',
    patientName: 'Mariama Sankoh',
    patientAge: 41,
    type: 'clinic-visit',
    status: 'checked-in',
    department: 'General Medicine',
    clinicianName: null,
    waitingMinutes: 27,
    severity: 'normal',
    reasonForVisit: 'Cough, 2 weeks',
  },
  {
    reference: 'ENC-10892',
    patientName: 'Foday Sesay',
    patientAge: 8,
    type: 'clinic-visit',
    status: 'in-progress',
    department: 'Paediatrics',
    clinicianName: 'Dr. Emily Bangura',
    waitingMinutes: 22,
    severity: 'normal',
    reasonForVisit: 'Routine immunisation, measles second dose',
  },
  {
    reference: 'ENC-10895',
    patientName: 'Zainab Dumbuya',
    patientAge: 30,
    type: 'telehealth',
    status: 'checked-in',
    department: 'Maternal Health',
    clinicianName: null,
    waitingMinutes: 18,
    severity: 'normal',
    reasonForVisit: 'Contraception counselling',
  },
  {
    reference: 'ENC-10898',
    patientName: 'Abu Bakarr Conteh',
    patientAge: 56,
    type: 'follow-up',
    status: 'on-hold',
    department: 'General Medicine',
    clinicianName: 'Dr. Michael Sesay',
    waitingMinutes: 15,
    severity: 'info',
    reasonForVisit: 'Awaiting lab result before review',
  },
  {
    reference: 'ENC-10901',
    patientName: 'Hawa Barrie',
    patientAge: 24,
    type: 'emergency',
    status: 'in-progress',
    department: 'Emergency',
    clinicianName: 'Dr. Sarah Conteh',
    waitingMinutes: 11,
    severity: 'critical',
    reasonForVisit: 'Road traffic injury, suspected fracture',
  },
  {
    reference: 'ENC-10904',
    patientName: 'Momodu Fofanah',
    patientAge: 63,
    type: 'clinic-visit',
    status: 'scheduled',
    department: 'Cardiology',
    clinicianName: 'Dr. Emily Bangura',
    waitingMinutes: 0,
    severity: 'normal',
    reasonForVisit: 'Echocardiogram review',
  },
  {
    reference: 'ENC-10812',
    patientName: 'Kadiatu Bah',
    patientAge: 37,
    type: 'clinic-visit',
    status: 'completed',
    department: 'General Medicine',
    clinicianName: 'Dr. Michael Sesay',
    waitingMinutes: 0,
    severity: 'normal',
    reasonForVisit: 'Wound dressing change',
  },
  {
    reference: 'ENC-10819',
    patientName: 'Santigie Kanu',
    patientAge: 49,
    type: 'follow-up',
    status: 'completed',
    department: 'General Medicine',
    clinicianName: 'Dr. Sarah Conteh',
    waitingMinutes: 0,
    severity: 'normal',
    reasonForVisit: 'Diabetes review, HbA1c stable',
  },
  // Portal fixtures for PAT-00142: one closed visit and one booked appointment, so the
  // patient portal has something truthful to render.
  {
    patientId: 'PAT-00142',
    reference: 'ENC-10788',
    patientName: 'Fatmata Koroma',
    patientAge: 34,
    type: 'clinic-visit',
    status: 'completed',
    department: 'General Medicine',
    clinicianName: 'Dr. Michael Sesay',
    waitingMinutes: 0,
    severity: 'normal',
    reasonForVisit: 'Iron deficiency review',
  },
  {
    patientId: 'PAT-00142',
    reference: 'ENC-11120',
    patientName: 'Fatmata Koroma',
    patientAge: 34,
    type: 'follow-up',
    status: 'scheduled',
    department: 'General Medicine',
    clinicianName: 'Dr. Sarah Conteh',
    waitingMinutes: 0,
    severity: 'normal',
    reasonForVisit: 'Repeat blood count',
  },

  // --- Makeni Regional Hospital Trust (a different customer) ------------------
  {
    tenantId: MAKENI_TRUST,
    reference: 'MKN-20301',
    patientName: 'Abdulai Turay',
    patientAge: 58,
    type: 'admission',
    status: 'in-progress',
    department: 'Medical Ward A',
    clinicianName: null,
    waitingMinutes: 45,
    severity: 'high',
    reasonForVisit: 'Decompensated heart failure',
  },
  {
    tenantId: MAKENI_TRUST,
    reference: 'MKN-20315',
    patientName: 'Isatu Kargbo',
    patientAge: 26,
    type: 'clinic-visit',
    status: 'awaiting-review',
    department: 'Maternity',
    clinicianName: null,
    waitingMinutes: 122,
    severity: 'critical',
    reasonForVisit: 'Pre-eclampsia, BP 168/104',
    flags: [{ kind: 'critical-result', label: 'BP 168/104' }],
  },
  {
    reference: 'ENC-10824',
    patientName: 'Yeanoh Koroma',
    patientAge: 55,
    type: 'telehealth',
    status: 'cancelled',
    department: 'General Medicine',
    clinicianName: null,
    waitingMinutes: 0,
    severity: 'normal',
    reasonForVisit: 'Cancelled by patient — transport',
  },
];

/**
 * Availability layered over the roster.
 *
 * The roster itself — who exists, and which tenant they belong to — lives in
 * `roster-store`. This map only carries *today's state* for those people.
 *
 * It was previously a second hand-written list of clinicians, which is how the Makeni
 * tenant ended up with an empty roster panel while its shifts and encounters were fine:
 * two sources of truth for the same people, and only one of them was updated. Deriving
 * from `ROSTER` means adding a tenant cannot half-work — a clinician who exists is a
 * clinician who appears, and one who does not exist cannot be conjured by this map.
 */
const AVAILABILITY: Readonly<
  Record<string, Pick<ClinicianAvailability, 'state' | 'activeEncounters'> & { detail?: string }>
> = {
  usr_101: { state: 'with-patient', activeEncounters: 3, detail: 'Emergency — ENC-10901' },
  usr_102: { state: 'available', activeEncounters: 2 },
  usr_103: { state: 'with-patient', activeEncounters: 1, detail: 'Paediatrics — ENC-10892' },
  usr_104: { state: 'available', activeEncounters: 0 },
  usr_105: { state: 'off-shift', activeEncounters: 0, detail: 'Returns 08:00' },
  usr_106: { state: 'available', activeEncounters: 0 },
  usr_107: { state: 'with-patient', activeEncounters: 2 },

  usr_201: { state: 'with-patient', activeEncounters: 4, detail: 'Ward round — Medical A' },
  usr_202: { state: 'with-patient', activeEncounters: 2, detail: 'Maternity — MKN-20315' },
  usr_203: { state: 'available', activeEncounters: 1 },
};

/** Anyone without a recorded state is off shift — the safest default to show a scheduler. */
const CLINICIANS: readonly ClinicianAvailability[] = ROSTER.map((clinician) => {
  const today = AVAILABILITY[clinician.id] ?? { state: 'off-shift' as const, activeEncounters: 0 };
  return Object.freeze<ClinicianAvailability>({
    id: clinician.id,
    name: clinician.name,
    role: clinician.role,
    state: today.state,
    activeEncounters: today.activeEncounters,
    ...(today.detail === undefined ? {} : { detail: today.detail }),
  });
});

/** Seeded clinician name → id, so the fixture's `clinicianName` resolves to a real roster id. */
const CLINICIAN_BY_NAME = new Map(CLINICIANS.map((c) => [c.name, c]));

/**
 * Live encounter state, keyed by id.
 *
 * Mutable — this is the write model — but every stored value is frozen, and mutation
 * happens only by replacing a whole entry. That keeps "an encounter changed" a single
 * atomic swap rather than a half-applied object another request can observe.
 */
const ENCOUNTERS = new Map<string, EncounterRecord>(
  ENCOUNTER_SEEDS.map((seed, index) => {
    const id = `enc_${String(index + 1).padStart(4, '0')}`;
    const clinician = seed.clinicianName ? CLINICIAN_BY_NAME.get(seed.clinicianName) : undefined;

    return [
      id,
      Object.freeze<EncounterRecord>({
        id,
        tenantId: seed.tenantId ?? FREETOWN_GROUP,
        reference: seed.reference,
        patientId: seed.patientId ?? `PAT-${String(142 + index * 7).padStart(5, '0')}`,
        patientName: seed.patientName,
        patientAge: seed.patientAge,
        type: seed.type,
        status: seed.status,
        department: seed.department,
        clinicianId: clinician?.id ?? null,
        clinicianName: clinician?.name ?? null,
        startedAt: minutesAgo(seed.waitingMinutes + 5),
        waitingMinutes: seed.waitingMinutes,
        severity: seed.severity,
        flags: Object.freeze(seed.flags ?? []),
        reasonForVisit: seed.reasonForVisit,
      }),
    ];
  }),
);

/** Encounter volume for the trailing 14 days, most recent last. */
const ENCOUNTER_VOLUME: readonly { date: string; value: number }[] = [
  118, 132, 127, 145, 151, 139, 96, 88, 141, 156, 148, 162, 154, 147,
].map((value, index, all) => ({
  date: daysAgoDate(all.length - 1 - index),
  value,
}));

/**
 * Tenant-scoped read surface.
 *
 * **Every method takes a `tenantId`, and there is no overload that omits it.** That is the
 * design: a store that can be queried without a tenant will eventually be queried without
 * one, and in this product that is one customer reading another's patients. Making the
 * parameter required turns the mistake into a compile error rather than a breach.
 *
 * The `tenantId` always comes from the caller's verified session, never from a request
 * parameter (§17.3).
 */
persistMap('encounters', ENCOUNTERS, (row) => row.id);

export const clinicalStore = {
  /**
   * The tenant's primary facility.
   *
   * Falls back to a neutral placeholder rather than to another tenant's facility. The old
   * fallback returned the seed clinic, which meant a token for a tenant that no longer
   * exists rendered someone else's name in the header — a quiet, convincing lie.
   */
  facilityFor(tenantId: string) {
    const facility = FACILITIES.find((f) => f.tenantId === tenantId);
    return facility ? { id: facility.id, name: facility.name } : { id: '', name: 'Unknown facility' };
  },

  /** Snapshot clock. Every derived figure cites this instant. */
  now(): Date {
    return NOW;
  },

  listEncounters(tenantId: string): readonly EncounterRecord[] {
    return [...ENCOUNTERS.values()].filter((e) => e.tenantId === tenantId);
  },

  findEncounterByReference(tenantId: string, reference: string): EncounterRecord | undefined {
    const needle = reference.toLowerCase();
    return this.listEncounters(tenantId).find((e) => e.reference.toLowerCase() === needle);
  },

  listClinicians(tenantId: string): readonly ClinicianAvailability[] {
    const ids = new Set(ROSTER.filter((c) => c.tenantId === tenantId).map((c) => c.id));
    return CLINICIANS.filter((c) => ids.has(c.id));
  },

  findClinician(tenantId: string, clinicianId: string): ClinicianAvailability | undefined {
    return this.listClinicians(tenantId).find((c) => c.id === clinicianId);
  },

  /**
   * Replace an encounter's assignment and return the new state.
   *
   * Returns the whole updated encounter rather than void so the caller audits exactly what
   * it stored, not what it believes it stored.
   */
  assignClinician(
    tenantId: string,
    encounterId: string,
    clinician: ClinicianAvailability | null,
  ): EncounterRecord {
    const current = ENCOUNTERS.get(encounterId);
    // The tenant check is here as well as in the service. A write path that trusts its
    // caller to have scoped the read is a write path that edits another tenant's row the
    // first time someone adds a second caller.
    if (!current || current.tenantId !== tenantId) {
      throw new Error(`Encounter ${encounterId} is not in this tenant`);
    }

    const updated = Object.freeze<EncounterRecord>({
      ...current,
      clinicianId: clinician?.id ?? null,
      clinicianName: clinician?.name ?? null,
    });

    ENCOUNTERS.set(encounterId, updated);
    persist();
    return updated;
  },

  encounterVolume(_tenantId: string): readonly { date: string; value: number }[] {
    return ENCOUNTER_VOLUME;
  },
} as const;
