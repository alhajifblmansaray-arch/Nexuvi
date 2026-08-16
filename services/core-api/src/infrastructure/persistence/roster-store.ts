import { persist, persistArray } from './snapshot';
import { FREETOWN_GROUP, MAKENI_TRUST } from './tenants';
import type {
  AppointmentStatus,
  ClinicalFlag,
  EncounterType,
  FacilitySummary,
  MinuteOfDay,
  Severity,
  ShiftKind,
} from '@nexuvi/api-contracts';

/**
 * Roster and booking fixture: several facilities under one tenant.
 *
 * The shape matters more than the data. Two things it deliberately models:
 *
 * 1. **A clinician works at more than one facility.** Dr. Sarah Conteh covers Freetown on
 *    Monday and Waterloo on Tuesday. A roster keyed by clinician alone cannot express
 *    that, and it is the normal case in group practice — so shifts are keyed by
 *    (clinician, facility, weekday), not by clinician.
 *
 * 2. **Coverage exists without bookings.** Several columns are rostered and empty. That is
 *    available capacity, and it is the answer to "can we fit someone in", which a grid
 *    that only draws appointments cannot give.
 */

/** A facility plus its owning tenant. The wire type deliberately omits `tenantId`. */
export interface FacilityRecord extends FacilitySummary {
  readonly tenantId: string;
}

const FACILITY_REGISTRY: FacilityRecord[] = [
  {
    id: 'fac_01HQ8XKZ2N4P',
    tenantId: FREETOWN_GROUP,
    name: 'Freetown Family Clinic',
    slug: 'freetown-family',
    city: 'Freetown',
    timezone: 'Africa/Freetown',
    open: true,
  },
  {
    id: 'fac_01HQ8XM4R7BQ',
    tenantId: FREETOWN_GROUP,
    name: 'Waterloo Community Health',
    slug: 'waterloo-community',
    city: 'Waterloo',
    timezone: 'Africa/Freetown',
    open: true,
  },
  {
    id: 'fac_01HQ8XN9T2CD',
    tenantId: FREETOWN_GROUP,
    name: 'Bo Regional Annex',
    slug: 'bo-regional',
    city: 'Bo',
    timezone: 'Africa/Freetown',
    open: true,
  },

  // --- A second, unrelated customer -----------------------------------------
  // Same country cell, different tenant. Nothing below may ever appear in a
  // Freetown Family session, and vice versa.
  {
    id: 'fac_01HQ9ZM2X8TV',
    tenantId: MAKENI_TRUST,
    name: 'Makeni Regional Hospital',
    slug: 'makeni-regional-hospital',
    city: 'Makeni',
    timezone: 'Africa/Freetown',
    open: true,
  },
  {
    id: 'fac_01HQ9ZN6Y3WX',
    tenantId: MAKENI_TRUST,
    name: 'Makeni Maternity Annex',
    slug: 'makeni-maternity',
    city: 'Makeni',
    timezone: 'Africa/Freetown',
    open: true,
  },
];

persistArray('facilities', FACILITY_REGISTRY);

/**
 * Read-only view. Stays live as facilities are provisioned, so a clinic created at runtime
 * resolves by hostname immediately — indistinguishable from a seeded one.
 */
export const FACILITIES: readonly FacilityRecord[] = FACILITY_REGISTRY;

/** Append a provisioned facility. Refuses a duplicate rather than overwriting. */
export function registerFacility(facility: FacilityRecord): FacilityRecord {
  if (FACILITY_REGISTRY.some((f) => f.id === facility.id)) {
    throw new Error(`Facility ${facility.id} already exists.`);
  }
  const frozen = Object.freeze({ ...facility });
  FACILITY_REGISTRY.push(frozen);
  persist();
  return frozen;
}

export interface RosterClinician {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly role: string;
  readonly credential: string;
}

/** The tenant's clinicians. Facility membership is expressed by their shifts, not here. */
export const ROSTER: readonly RosterClinician[] = [
  { id: 'usr_101', tenantId: FREETOWN_GROUP, name: 'Dr. Sarah Conteh', role: 'Physician', credential: 'MBBS' },
  { id: 'usr_102', tenantId: FREETOWN_GROUP, name: 'Dr. Michael Sesay', role: 'Physician', credential: 'MBBS' },
  { id: 'usr_103', tenantId: FREETOWN_GROUP, name: 'Dr. Emily Bangura', role: 'Paediatrician', credential: 'MD, FWACP' },
  { id: 'usr_104', tenantId: FREETOWN_GROUP, name: 'Sister Adama Kamara', role: 'Nurse practitioner', credential: 'RN, NP' },
  { id: 'usr_105', tenantId: FREETOWN_GROUP, name: 'Dr. Joseph Mansaray', role: 'Physician', credential: 'MBBS' },
  { id: 'usr_106', tenantId: FREETOWN_GROUP, name: 'Fatu Bangura', role: 'Physiotherapist', credential: 'BSc PT' },
  { id: 'usr_107', tenantId: FREETOWN_GROUP, name: 'Mariatu Sesay', role: 'Midwife', credential: 'RM' },

  // Makeni Regional Hospital Trust
  { id: 'usr_201', tenantId: MAKENI_TRUST, name: 'Dr. Ibrahim Kamara', role: 'Consultant physician', credential: 'MBBS, FWACP' },
  { id: 'usr_202', tenantId: MAKENI_TRUST, name: 'Dr. Fatmata Bangura', role: 'Obstetrician', credential: 'MBBS, FWACS' },
  { id: 'usr_203', tenantId: MAKENI_TRUST, name: 'Sister Kadiatu Sesay', role: 'Ward sister', credential: 'RN' },
];

const ROSTER_BY_ID = new Map(ROSTER.map((c) => [c.id, c]));

export function findRosterClinician(id: string): RosterClinician | undefined {
  return ROSTER_BY_ID.get(id);
}

/** `HH:MM` → minutes from local midnight. Keeps the fixture readable. */
function at(time: `${number}:${number}` | string): MinuteOfDay {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

interface ShiftSeed {
  readonly clinicianId: string;
  readonly facilityId: string;
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  readonly weekdays: readonly number[];
  readonly kind: ShiftKind;
  readonly start: string;
  readonly end: string;
  readonly label?: string;
}

const FREETOWN = FACILITIES[0]!.id;
const WATERLOO = FACILITIES[1]!.id;
const BO = FACILITIES[2]!.id;
const MAKENI_HOSPITAL = FACILITIES[3]!.id;
const MAKENI_MATERNITY = FACILITIES[4]!.id;

const WEEKDAYS = [1, 2, 3, 4, 5];

export const SHIFT_SEEDS: readonly ShiftSeed[] = [
  // — Freetown ————————————————————————————————————————————————
  { clinicianId: 'usr_101', facilityId: FREETOWN, weekdays: [1, 3, 4, 5], kind: 'shift', start: '08:00', end: '16:00' },
  { clinicianId: 'usr_101', facilityId: FREETOWN, weekdays: [1, 3, 4, 5], kind: 'break', start: '12:30', end: '13:15', label: 'Lunch' },

  { clinicianId: 'usr_102', facilityId: FREETOWN, weekdays: WEEKDAYS, kind: 'shift', start: '09:00', end: '17:00' },
  { clinicianId: 'usr_102', facilityId: FREETOWN, weekdays: WEEKDAYS, kind: 'break', start: '13:00', end: '13:45', label: 'Lunch' },
  { clinicianId: 'usr_102', facilityId: FREETOWN, weekdays: [3], kind: 'unavailable', start: '15:00', end: '17:00', label: 'Clinical governance' },

  { clinicianId: 'usr_103', facilityId: FREETOWN, weekdays: [1, 2, 4], kind: 'shift', start: '08:30', end: '14:30' },
  { clinicianId: 'usr_103', facilityId: FREETOWN, weekdays: [1, 2, 4], kind: 'break', start: '11:30', end: '12:00', label: 'Break' },

  { clinicianId: 'usr_104', facilityId: FREETOWN, weekdays: WEEKDAYS, kind: 'shift', start: '07:30', end: '15:30' },
  { clinicianId: 'usr_104', facilityId: FREETOWN, weekdays: WEEKDAYS, kind: 'break', start: '12:00', end: '12:30', label: 'Lunch' },

  { clinicianId: 'usr_106', facilityId: FREETOWN, weekdays: [2, 4], kind: 'shift', start: '09:00', end: '13:00' },
  { clinicianId: 'usr_107', facilityId: FREETOWN, weekdays: WEEKDAYS, kind: 'shift', start: '08:00', end: '16:00' },
  { clinicianId: 'usr_107', facilityId: FREETOWN, weekdays: WEEKDAYS, kind: 'break', start: '12:00', end: '12:45', label: 'Lunch' },

  // — Waterloo ————————————————————————————————————————————————
  // Dr. Conteh covers a second site on the days she is not in Freetown.
  { clinicianId: 'usr_101', facilityId: WATERLOO, weekdays: [2], kind: 'shift', start: '09:00', end: '15:00' },
  { clinicianId: 'usr_105', facilityId: WATERLOO, weekdays: [1, 2, 3, 4, 5], kind: 'shift', start: '08:00', end: '14:00' },
  { clinicianId: 'usr_105', facilityId: WATERLOO, weekdays: WEEKDAYS, kind: 'break', start: '11:00', end: '11:30', label: 'Break' },
  { clinicianId: 'usr_106', facilityId: WATERLOO, weekdays: [1, 3, 5], kind: 'shift', start: '08:30', end: '16:30' },
  { clinicianId: 'usr_106', facilityId: WATERLOO, weekdays: [1, 3, 5], kind: 'break', start: '12:00', end: '12:45', label: 'Lunch' },

  // — Bo ——————————————————————————————————————————————————————
  // A thin site: one clinician, two days a week. The empty columns are the point.
  { clinicianId: 'usr_103', facilityId: BO, weekdays: [3, 5], kind: 'shift', start: '09:00', end: '15:00' },
  { clinicianId: 'usr_103', facilityId: BO, weekdays: [3, 5], kind: 'break', start: '12:00', end: '12:30', label: 'Lunch' },

  // — Makeni Regional Hospital Trust (a different customer) ——————————————
  { clinicianId: 'usr_201', facilityId: MAKENI_HOSPITAL, weekdays: WEEKDAYS, kind: 'shift', start: '07:00', end: '19:00' },
  { clinicianId: 'usr_201', facilityId: MAKENI_HOSPITAL, weekdays: WEEKDAYS, kind: 'break', start: '13:00', end: '13:30', label: 'Lunch' },
  { clinicianId: 'usr_203', facilityId: MAKENI_HOSPITAL, weekdays: WEEKDAYS, kind: 'shift', start: '07:00', end: '19:00' },
  { clinicianId: 'usr_202', facilityId: MAKENI_MATERNITY, weekdays: [1, 2, 3, 4, 5], kind: 'shift', start: '08:00', end: '18:00' },
  { clinicianId: 'usr_202', facilityId: MAKENI_MATERNITY, weekdays: WEEKDAYS, kind: 'unavailable', start: '16:00', end: '18:00', label: 'Theatre list' },
];

interface AppointmentSeed {
  readonly clinicianId: string;
  readonly facilityId: string;
  readonly weekdays: readonly number[];
  readonly reference: string;
  readonly patientName: string;
  readonly patientId: string;
  readonly serviceLabel: string;
  readonly type: EncounterType;
  readonly status: AppointmentStatus;
  readonly start: string;
  readonly end: string;
  readonly room?: string;
  readonly severity?: Severity;
  readonly flags?: readonly ClinicalFlag[];
}

export const APPOINTMENT_SEEDS: readonly AppointmentSeed[] = [
  // Freetown — Dr. Sarah Conteh
  {
    clinicianId: 'usr_101', facilityId: FREETOWN, weekdays: [1, 3, 4, 5],
    reference: 'ENC-10901', patientName: 'Hawa Barrie', patientId: 'PAT-00219',
    serviceLabel: 'Emergency review', type: 'emergency', status: 'in-progress',
    start: '08:15', end: '09:00', room: 'Room 1', severity: 'critical',
  },
  {
    clinicianId: 'usr_101', facilityId: FREETOWN, weekdays: [1, 3, 4, 5],
    reference: 'ENC-10863', patientName: 'Ibrahim Turay', patientId: 'PAT-00156',
    serviceLabel: 'Wound review — 45 min', type: 'follow-up', status: 'arrived',
    start: '09:15', end: '10:00', room: 'Room 1', severity: 'high',
    flags: [{ kind: 'infection-control', label: 'MRSA precautions' }],
  },
  {
    clinicianId: 'usr_101', facilityId: FREETOWN, weekdays: [1, 3, 4, 5],
    reference: 'ENC-10944', patientName: 'Kadiatu Bah', patientId: 'PAT-00301',
    serviceLabel: 'Diabetes review', type: 'follow-up', status: 'booked',
    start: '10:30', end: '11:15', room: 'Room 1',
  },
  // Double-booked on purpose: two patients, one clinician, same 40 minutes.
  {
    clinicianId: 'usr_101', facilityId: FREETOWN, weekdays: [1, 3, 4, 5],
    reference: 'ENC-10952', patientName: 'Santigie Kanu', patientId: 'PAT-00318',
    serviceLabel: 'Hypertension review', type: 'follow-up', status: 'booked',
    start: '11:00', end: '11:40', room: 'Room 2',
  },
  {
    clinicianId: 'usr_101', facilityId: FREETOWN, weekdays: [1, 3, 4, 5],
    reference: 'ENC-10967', patientName: 'Momodu Fofanah', patientId: 'PAT-00344',
    serviceLabel: 'Post-op check', type: 'follow-up', status: 'cancelled',
    start: '13:30', end: '14:15', room: 'Room 1',
  },
  {
    clinicianId: 'usr_101', facilityId: FREETOWN, weekdays: [1, 3, 4, 5],
    reference: 'ENC-10971', patientName: 'Yeanoh Koroma', patientId: 'PAT-00352',
    serviceLabel: 'General consultation', type: 'clinic-visit', status: 'booked',
    start: '14:30', end: '15:15', room: 'Room 1',
  },

  // Freetown — Dr. Michael Sesay
  {
    clinicianId: 'usr_102', facilityId: FREETOWN, weekdays: WEEKDAYS,
    reference: 'ENC-10874', patientName: 'Sorie Kamara', patientId: 'PAT-00177',
    serviceLabel: 'Medication titration', type: 'follow-up', status: 'arrived',
    start: '09:30', end: '10:15', room: 'Room 3', severity: 'high',
    flags: [{ kind: 'controlled-substance', label: 'Diazepam 5mg' }],
  },
  {
    clinicianId: 'usr_102', facilityId: FREETOWN, weekdays: WEEKDAYS,
    reference: 'ENC-10847', patientName: 'Fatmata Koroma', patientId: 'PAT-00142',
    serviceLabel: 'Fever workup — 60 min', type: 'clinic-visit', status: 'booked',
    start: '10:30', end: '11:30', room: 'Room 3', severity: 'critical',
    flags: [
      { kind: 'allergy', label: 'Penicillin' },
      { kind: 'critical-result', label: 'Hb 6.1 g/dL' },
    ],
  },
  {
    clinicianId: 'usr_102', facilityId: FREETOWN, weekdays: WEEKDAYS,
    reference: 'ENC-10988', patientName: 'Abu Bakarr Conteh', patientId: 'PAT-00191',
    serviceLabel: 'Results review', type: 'follow-up', status: 'booked',
    start: '11:45', end: '12:30', room: 'Room 3',
  },
  {
    clinicianId: 'usr_102', facilityId: FREETOWN, weekdays: WEEKDAYS,
    reference: 'ENC-10994', patientName: 'Alusine Turay', patientId: 'PAT-00366',
    serviceLabel: 'New patient assessment', type: 'clinic-visit', status: 'booked',
    start: '14:00', end: '15:00', room: 'Room 3',
  },

  // Freetown — Dr. Emily Bangura (paediatrics)
  {
    clinicianId: 'usr_103', facilityId: FREETOWN, weekdays: [1, 2, 4],
    reference: 'ENC-10892', patientName: 'Foday Sesay', patientId: 'PAT-00198',
    serviceLabel: 'Immunisation — measles 2', type: 'clinic-visit', status: 'in-progress',
    start: '09:00', end: '09:30', room: 'Paeds 1',
  },
  {
    clinicianId: 'usr_103', facilityId: FREETOWN, weekdays: [1, 2, 4],
    reference: 'ENC-11002', patientName: 'Aminata Kargbo', patientId: 'PAT-00377',
    serviceLabel: 'Growth check — 6 months', type: 'follow-up', status: 'booked',
    start: '10:00', end: '10:30', room: 'Paeds 1',
  },
  {
    clinicianId: 'usr_103', facilityId: FREETOWN, weekdays: [1, 2, 4],
    reference: 'ENC-11008', patientName: 'Ishmael Koroma', patientId: 'PAT-00381',
    serviceLabel: 'Asthma review', type: 'follow-up', status: 'no-show',
    start: '10:45', end: '11:15', room: 'Paeds 1',
  },

  // Freetown — Sister Adama Kamara
  {
    clinicianId: 'usr_104', facilityId: FREETOWN, weekdays: WEEKDAYS,
    reference: 'ENC-10851', patientName: 'Mohamed Bangura', patientId: 'PAT-00149',
    serviceLabel: 'Nurse-led review', type: 'clinic-visit', status: 'booked',
    start: '08:00', end: '08:45', room: 'Room 4', severity: 'critical',
    flags: [{ kind: 'critical-result', label: 'Troponin elevated' }],
  },
  {
    clinicianId: 'usr_104', facilityId: FREETOWN, weekdays: WEEKDAYS,
    reference: 'ENC-11015', patientName: 'Isata Mansaray', patientId: 'PAT-00212',
    serviceLabel: 'Dressing change', type: 'follow-up', status: 'completed',
    start: '09:00', end: '09:30', room: 'Room 4',
  },
  {
    clinicianId: 'usr_104', facilityId: FREETOWN, weekdays: WEEKDAYS,
    reference: 'ENC-11021', patientName: 'Zainab Dumbuya', patientId: 'PAT-00226',
    serviceLabel: 'Contraception counselling', type: 'telehealth', status: 'booked',
    start: '13:00', end: '13:45', room: 'Telehealth',
  },
  // Booked into the 12:00–12:30 lunch break — a real rostering error, flagged as a conflict.
  {
    clinicianId: 'usr_104', facilityId: FREETOWN, weekdays: WEEKDAYS,
    reference: 'ENC-11029', patientName: 'Marie Sankoh', patientId: 'PAT-00390',
    serviceLabel: 'Urgent dressing', type: 'clinic-visit', status: 'booked',
    start: '12:05', end: '12:35', room: 'Room 4', severity: 'warning',
  },

  // Freetown — Mariatu Sesay (midwife)
  {
    clinicianId: 'usr_107', facilityId: FREETOWN, weekdays: WEEKDAYS,
    reference: 'ENC-10870', patientName: 'Aminata Jalloh', patientId: 'PAT-00163',
    serviceLabel: 'Antenatal — week 32', type: 'telehealth', status: 'arrived',
    start: '08:30', end: '09:15', room: 'Maternity 1', severity: 'high',
  },
  {
    clinicianId: 'usr_107', facilityId: FREETOWN, weekdays: WEEKDAYS,
    reference: 'ENC-11034', patientName: 'Fatmata Sankoh', patientId: 'PAT-00402',
    serviceLabel: 'Antenatal — week 20', type: 'clinic-visit', status: 'booked',
    start: '09:30', end: '10:15', room: 'Maternity 1',
  },
  {
    clinicianId: 'usr_107', facilityId: FREETOWN, weekdays: WEEKDAYS,
    reference: 'ENC-11041', patientName: 'Hawa Kamara', patientId: 'PAT-00411',
    serviceLabel: 'Postnatal check', type: 'follow-up', status: 'booked',
    start: '14:00', end: '14:45', room: 'Maternity 1',
  },

  // — Waterloo ————————————————————————————————————————————————
  {
    clinicianId: 'usr_105', facilityId: WATERLOO, weekdays: WEEKDAYS,
    reference: 'ENC-11050', patientName: 'Brima Koroma', patientId: 'PAT-00420',
    serviceLabel: 'General consultation', type: 'clinic-visit', status: 'booked',
    start: '08:30', end: '09:15', room: 'Consult A',
  },
  {
    clinicianId: 'usr_105', facilityId: WATERLOO, weekdays: WEEKDAYS,
    reference: 'ENC-11056', patientName: 'Salamatu Bah', patientId: 'PAT-00431',
    serviceLabel: 'Hypertension review', type: 'follow-up', status: 'booked',
    start: '09:30', end: '10:15', room: 'Consult A',
  },
  {
    clinicianId: 'usr_105', facilityId: WATERLOO, weekdays: WEEKDAYS,
    reference: 'ENC-11062', patientName: 'Osman Jalloh', patientId: 'PAT-00444',
    serviceLabel: 'Diabetes review', type: 'follow-up', status: 'cancelled',
    start: '11:45', end: '12:30', room: 'Consult A',
  },
  {
    clinicianId: 'usr_106', facilityId: WATERLOO, weekdays: [1, 3, 5],
    reference: 'ENC-11070', patientName: 'Alhaji Kargbo', patientId: 'PAT-00205',
    serviceLabel: 'Physiotherapy — 60 min', type: 'clinic-visit', status: 'arrived',
    start: '09:00', end: '10:00', room: 'Gym',
  },
  {
    clinicianId: 'usr_106', facilityId: WATERLOO, weekdays: [1, 3, 5],
    reference: 'ENC-11077', patientName: 'Mariama Sankoh', patientId: 'PAT-00184',
    serviceLabel: 'Physiotherapy — 45 min', type: 'follow-up', status: 'booked',
    start: '10:15', end: '11:00', room: 'Gym',
  },
  {
    clinicianId: 'usr_101', facilityId: WATERLOO, weekdays: [2],
    reference: 'ENC-11084', patientName: 'Adama Turay', patientId: 'PAT-00455',
    serviceLabel: 'Outreach clinic', type: 'clinic-visit', status: 'booked',
    start: '09:30', end: '10:30', room: 'Consult B',
  },

  // — Bo ——————————————————————————————————————————————————————
  {
    clinicianId: 'usr_103', facilityId: BO, weekdays: [3, 5],
    reference: 'ENC-11090', patientName: 'Sia Momoh', patientId: 'PAT-00468',
    serviceLabel: 'Paediatric review', type: 'clinic-visit', status: 'booked',
    start: '09:30', end: '10:15', room: 'Room A',
  },
  {
    clinicianId: 'usr_103', facilityId: BO, weekdays: [3, 5],
    reference: 'ENC-11095', patientName: 'Tamba Ngegba', patientId: 'PAT-00479',
    serviceLabel: 'Immunisation', type: 'clinic-visit', status: 'booked',
    start: '10:30', end: '11:00', room: 'Room A',
  },

  // — Makeni Regional Hospital Trust ————————————————————————————————————
  {
    clinicianId: 'usr_201', facilityId: MAKENI_HOSPITAL, weekdays: WEEKDAYS,
    reference: 'MKN-20301', patientName: 'Abdulai Turay', patientId: 'MKN-01120',
    serviceLabel: 'Ward round — Medical A', type: 'admission', status: 'in-progress',
    start: '08:00', end: '10:00', room: 'Ward A',
  },
  {
    clinicianId: 'usr_201', facilityId: MAKENI_HOSPITAL, weekdays: WEEKDAYS,
    reference: 'MKN-20308', patientName: 'Memunatu Koroma', patientId: 'MKN-01133',
    serviceLabel: 'Consultant review', type: 'follow-up', status: 'booked',
    start: '11:00', end: '11:45', room: 'Outpatients 2', severity: 'high',
  },
  {
    clinicianId: 'usr_202', facilityId: MAKENI_MATERNITY, weekdays: WEEKDAYS,
    reference: 'MKN-20315', patientName: 'Isatu Kargbo', patientId: 'MKN-01147',
    serviceLabel: 'Antenatal — high risk', type: 'clinic-visit', status: 'arrived',
    start: '09:00', end: '10:00', room: 'Maternity 1', severity: 'critical',
    flags: [{ kind: 'critical-result', label: 'BP 168/104' }],
  },
  {
    clinicianId: 'usr_203', facilityId: MAKENI_HOSPITAL, weekdays: WEEKDAYS,
    reference: 'MKN-20322', patientName: 'Santigie Bangura', patientId: 'MKN-01158',
    serviceLabel: 'Observations round', type: 'admission', status: 'booked',
    start: '14:00', end: '15:00', room: 'Ward A',
  },
];

export const minuteOf = at;
