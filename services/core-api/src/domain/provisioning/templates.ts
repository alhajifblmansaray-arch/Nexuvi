import type { PlanDefinition, PlanKey, TenantTemplate, TenantTemplateKey } from '@nexuvi/api-contracts';

/**
 * Seed bundles and commercial plans.
 *
 * Both are **data**. A new vertical — veterinary, physiotherapy, diagnostics — is a new
 * entry in `TEMPLATES`, not a fork of the application. That is the same argument as
 * runtime-multi-tenant rendering, applied to onboarding: the moment a customer type needs
 * its own code path, every security fix needs to be applied N times.
 *
 * Templates describe *what kind of organisation this is*. Plans describe *what they paid
 * for*. They are separate because they vary independently — a single-site dental practice
 * and a hospital group can both be on `practice`, and the same hospital can upgrade its
 * plan without changing what kind of organisation it is.
 */

export const TEMPLATES: Readonly<Record<TenantTemplateKey, TenantTemplate>> = {
  'primary-care': {
    key: 'primary-care',
    label: 'Primary care / family practice',
    description: 'General practice, one or more sites, appointment-led.',
    departments: ['General Medicine', 'Maternal Health', 'Paediatrics', 'Immunisation'],
    appointmentTypes: [
      { label: 'Routine consultation', minutes: 15 },
      { label: 'Extended consultation', minutes: 30 },
      { label: 'Follow-up', minutes: 15 },
      { label: 'Antenatal check', minutes: 30 },
      { label: 'Immunisation', minutes: 10 },
    ],
    roles: ['administrator', 'physician', 'nurse', 'receptionist'],
    portalSections: ['appointments', 'results', 'visits'],
    modules: ['encounters', 'schedule', 'portal'],
  },

  hospital: {
    key: 'hospital',
    label: 'Hospital / inpatient',
    description: 'Wards, theatres, outpatient clinics, 24-hour cover.',
    departments: [
      'Emergency',
      'Medical Ward',
      'Surgical Ward',
      'Maternity',
      'Outpatients',
      'Theatre',
    ],
    appointmentTypes: [
      { label: 'Outpatient clinic', minutes: 20 },
      { label: 'Consultant review', minutes: 30 },
      { label: 'Pre-operative assessment', minutes: 45 },
      { label: 'Ward round', minutes: 120 },
    ],
    roles: ['administrator', 'physician', 'nurse', 'receptionist'],
    // Inpatients change the portal's shape: appointments matter less than visits, and
    // results are usually discussed on the ward rather than released to a portal.
    portalSections: ['appointments', 'visits'],
    modules: ['encounters', 'schedule', 'portal', 'wards'],
  },

  dental: {
    key: 'dental',
    label: 'Dental practice',
    description: 'Chair-based scheduling, recall-driven.',
    departments: ['General Dentistry', 'Hygiene', 'Orthodontics'],
    appointmentTypes: [
      { label: 'Check-up', minutes: 20 },
      { label: 'Hygiene', minutes: 30 },
      { label: 'Filling', minutes: 45 },
      { label: 'Extraction', minutes: 45 },
    ],
    roles: ['administrator', 'physician', 'receptionist'],
    portalSections: ['appointments', 'visits'],
    modules: ['encounters', 'schedule', 'portal'],
  },

  pharmacy: {
    key: 'pharmacy',
    label: 'Pharmacy',
    description: 'Dispensing and medication review; no encounter scheduling by default.',
    departments: ['Dispensary', 'Consultation Room'],
    appointmentTypes: [{ label: 'Medication review', minutes: 20 }],
    roles: ['administrator', 'receptionist'],
    portalSections: ['medications'],
    modules: ['portal', 'pharmacy'],
  },
};

export const PLANS: Readonly<Record<PlanKey, PlanDefinition>> = {
  essentials: {
    key: 'essentials',
    label: 'Essentials',
    modules: ['encounters', 'schedule'],
    maxFacilities: 1,
    maxStaffUsers: 10,
    customDomains: false,
  },
  practice: {
    key: 'practice',
    label: 'Practice',
    modules: ['encounters', 'schedule', 'portal'],
    maxFacilities: 5,
    maxStaffUsers: 50,
    customDomains: true,
  },
  enterprise: {
    key: 'enterprise',
    label: 'Enterprise',
    modules: ['encounters', 'schedule', 'portal', 'wards', 'pharmacy', 'billing'],
    maxFacilities: 100,
    maxStaffUsers: 1000,
    customDomains: true,
  },
};

/**
 * Modules a tenant actually gets: what the template expects, narrowed by what they bought.
 *
 * The intersection is deliberate. A hospital on `essentials` does not get ward management
 * because their template mentions it — and a practice on `enterprise` does not get
 * pharmacy because their plan includes it. Entitlement is the floor *and* the ceiling, and
 * it is resolved here rather than checked at each call site, where one place would forget.
 */
export function resolveModules(template: TenantTemplate, plan: PlanDefinition): readonly string[] {
  const purchased = new Set(plan.modules);
  return template.modules.filter((module) => purchased.has(module));
}
