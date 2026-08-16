import { persist, persistArray } from './snapshot';
import type { TenantConfig, TenantTemplate } from '@nexuvi/api-contracts';

import { FREETOWN_GROUP, MAKENI_TRUST, TENANTS } from './tenants';

/**
 * Per-tenant configuration: the layer a clinic customises for itself.
 *
 * Both records below are the *same code* rendering differently. That is the whole
 * white-label model — a clinic's portal differs because this row differs, not because
 * anything was built for them. Adding a customer is writing a row.
 *
 * Draft and published are separate versions. A clinic edits a draft; publishing swaps it
 * atomically. Nothing half-edited reaches a patient.
 */

const now = new Date().toISOString();

const CONFIG_REGISTRY: TenantConfig[] = [
  {
    tenantId: FREETOWN_GROUP,
    version: 4,
    status: 'published',
    branding: {
      // A warm clinical green. Passes AA against both surfaces — the resolver checks
      // rather than trusting, and would refuse it otherwise.
      primary: '#1f7a5a',
      secondary: '#3d5a80',
      info: '#2f6fb0',
      typeface: 'inter',
    },
    profile: {
      displayName: 'Freetown Family Clinic',
      tagline: 'Family medicine on Wilkinson Road since 2004',
      about:
        'A three-site family practice offering general medicine, maternal health, ' +
        'paediatrics and physiotherapy across Freetown, Waterloo and Bo.',
      phone: '+232 76 000 000',
      email: 'reception@freetownfamily.sl',
      addressLines: ['14 Wilkinson Road', 'Freetown', 'Sierra Leone'],
      openingHours: [
        { day: 'Monday – Friday', hours: '08:00 – 17:00' },
        { day: 'Saturday', hours: '09:00 – 13:00' },
        { day: 'Sunday', hours: 'Closed' },
      ],
      emergencyNotice:
        'If this is an emergency, call 999 or go to your nearest emergency department. ' +
        'Do not use this portal to report urgent symptoms.',
    },
    portal: {
      sections: ['appointments', 'results', 'visits'],
      welcomeHeading: 'Your care at Freetown Family',
      welcomeBody: 'Appointments, results your clinician has released, and past visits.',
      bookingInstructions: 'Call reception on +232 76 000 000 to book an appointment.',
    },
    domains: [{ host: 'freetown-family-group.nexuvi.health', verified: true, primary: true }],
    updatedAt: now,
  },
  {
    tenantId: MAKENI_TRUST,
    version: 2,
    status: 'published',
    branding: {
      primary: '#1c4f8b',
      secondary: '#5b4a86',
      typeface: 'source-sans',
    },
    profile: {
      displayName: 'Makeni Regional Hospital',
      tagline: 'Regional care for Bombali District',
      about:
        'A district hospital providing inpatient medicine, maternity and outpatient ' +
        'specialty clinics.',
      phone: '+232 76 111 111',
      addressLines: ['Teko Road', 'Makeni', 'Sierra Leone'],
      openingHours: [
        { day: 'Outpatients', hours: 'Monday – Friday, 08:00 – 16:00' },
        { day: 'Emergency', hours: '24 hours' },
      ],
      emergencyNotice: 'Our emergency department is open 24 hours. In an emergency, call 999.',
    },
    portal: {
      // A different clinic switches on a different set. Same code, different row.
      sections: ['appointments', 'visits'],
      welcomeHeading: 'Makeni Regional patient portal',
      welcomeBody: 'Your appointments and visit history.',
      bookingInstructions: 'Outpatient appointments are arranged by your referring clinician.',
    },
    domains: [{ host: 'makeni-regional.nexuvi.health', verified: true, primary: true }],
    updatedAt: now,
  },
];

/**
 * Seeds a newly provisioned tenant's configuration.
 *
 * Written as a **draft**, not published. A portal that goes live the moment a tenant is
 * created is a portal patients can find before anyone at the clinic has checked it — with
 * placeholder hours, no logo, and default copy. Publishing is the clinic's decision and
 * their signal that setup is done.
 *
 * Branding is deliberately left empty. The platform's own palette is contrast-safe by
 * construction, so a clinic that never sets a colour still gets a readable portal.
 */
export function seedTenantConfig(input: {
  tenantId: string;
  template: TenantTemplate;
  displayName: string;
  city: string;
  portalHost: string;
  portalIncluded: boolean;
}): TenantConfig {
  const seeded: TenantConfig = {
    tenantId: input.tenantId,
    version: 1,
    status: 'draft',
    branding: { typeface: 'system' },
    profile: {
      displayName: input.displayName,
      addressLines: [input.city],
      emergencyNotice:
        'If this is an emergency, call your local emergency number or go to your nearest ' +
        'emergency department. Do not use this portal to report urgent symptoms.',
    },
    portal: {
      sections: input.portalIncluded ? [...input.template.portalSections] : [],
      welcomeHeading: `${input.displayName} patient portal`,
    },
    domains: input.portalIncluded
      ? [{ host: input.portalHost, verified: true, primary: true }]
      : [],
    updatedAt: new Date().toISOString(),
  };

  CONFIG_REGISTRY.push(Object.freeze(seeded));
  persist();
  return seeded;
}

/**
 * Publish a tenant's draft.
 *
 * An atomic swap: the previous published version is replaced only once the new one is
 * complete. Nothing half-edited ever reaches a patient.
 */
export function publishTenantConfig(tenantId: string): TenantConfig | undefined {
  const draft = CONFIG_REGISTRY.find((c) => c.tenantId === tenantId && c.status === 'draft');
  if (!draft) return undefined;

  const published: TenantConfig = {
    ...draft,
    status: 'published',
    version: draft.version + 1,
    updatedAt: new Date().toISOString(),
  };

  const index = CONFIG_REGISTRY.findIndex(
    (c) => c.tenantId === tenantId && c.status === 'published',
  );
  if (index >= 0) CONFIG_REGISTRY[index] = Object.freeze(published);
  else CONFIG_REGISTRY.push(Object.freeze(published));

  persist();
  return published;
}

persistArray('tenantConfigs', CONFIG_REGISTRY);

/**
 * The clinic's working copy.
 *
 * Created from the published version on first edit, so a clinic that has been live for a
 * year can start changing things without their portal flickering between versions.
 */
export function draftFor(tenantId: string): TenantConfig | undefined {
  const draft = CONFIG_REGISTRY.find((c) => c.tenantId === tenantId && c.status === 'draft');
  if (draft) return draft;

  const published = CONFIG_REGISTRY.find(
    (c) => c.tenantId === tenantId && c.status === 'published',
  );
  if (!published) return undefined;

  const forked: TenantConfig = { ...published, status: 'draft' };
  CONFIG_REGISTRY.push(Object.freeze(forked));
  persist();
  return forked;
}

/**
 * Applies a partial edit to the draft, leaving the published version untouched.
 *
 * Accepts values that may be `undefined`, because that is what a JSON patch actually looks
 * like once it has been through a DTO — every unfilled field arrives as an explicit
 * `undefined`. Those keys are dropped here rather than written, so "field not sent" means
 * "leave it alone" and never "clear it".
 */
type Patchable<T> = { [K in keyof T]?: T[K] | undefined };

export function updateDraft(
  tenantId: string,
  patch: {
    branding?: Patchable<TenantConfig['branding']> | undefined;
    profile?: Patchable<TenantConfig['profile']> | undefined;
    portal?: Patchable<TenantConfig['portal']> | undefined;
  },
): TenantConfig | undefined {
  const draft = draftFor(tenantId);
  if (!draft) return undefined;

  const updated = {
    ...draft,
    branding: { ...draft.branding, ...defined(patch.branding) },
    profile: { ...draft.profile, ...defined(patch.profile) },
    portal: { ...draft.portal, ...defined(patch.portal) },
    updatedAt: new Date().toISOString(),
  } as TenantConfig;

  const index = CONFIG_REGISTRY.findIndex((c) => c.tenantId === tenantId && c.status === 'draft');
  CONFIG_REGISTRY[index] = Object.freeze(updated);
  persist();
  return updated;
}

/** Drops keys whose value is `undefined`, so an unsent field is not a cleared one. */
function defined<T extends object>(patch: T | undefined): Partial<T> {
  if (!patch) return {};
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export const tenantConfigStore = {
  /** The published config for a tenant, or `undefined` if it has never published one. */
  published(tenantId: string): TenantConfig | undefined {
    return CONFIG_REGISTRY.find((c) => c.tenantId === tenantId && c.status === 'published');
  },

  /** Tenant slug, used to scope the emitted stylesheet. */
  themeKeyFor(tenantId: string): string | undefined {
    return TENANTS.find((t) => t.id === tenantId)?.slug;
  },
};
