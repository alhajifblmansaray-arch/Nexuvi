/**
 * Tenant provisioning — what happens when a clinic buys Nexuvi.
 *
 * This is a **platform** surface, not a tenant one. It creates customers, so it is
 * authorised by platform capabilities that no tenant administrator holds, and every call
 * is audited: a bug here creates or modifies a paying account.
 *
 * ## What provisioning is not
 *
 * It does not grant access to a customer's clinical data. A platform operator can create a
 * tenant and cannot read its patients. When someone at Nexuvi genuinely needs to see a
 * customer's screen to diagnose a problem, that is a **support session** (§16.3) — time
 * boxed, consented, visible to the customer, and separately audited. Conflating the two is
 * how a provisioning tool quietly becomes a back door into every clinic on the platform.
 */

import type { IsoTimestamp } from './common.ts';
import type { PortalSection } from './tenant-config.ts';

/**
 * The shape of organisation being onboarded.
 *
 * Determines the seed bundle, not the code path. A new vertical is a new template — a row
 * of data — never a fork of the application.
 */
export type TenantTemplateKey = 'primary-care' | 'hospital' | 'dental' | 'pharmacy';

/** Commercial plan. Gates which modules are switched on, enforced server-side. */
export type PlanKey = 'essentials' | 'practice' | 'enterprise';

export interface AppointmentTypeSeed {
  readonly label: string;
  readonly minutes: number;
}

/**
 * A seed bundle.
 *
 * Everything a new clinic starts with so their first day is not an empty database:
 * departments to file encounters under, appointment types to book, roles to invite people
 * into, and a portal that already renders something sensible before they have configured
 * anything.
 */
export interface TenantTemplate {
  readonly key: TenantTemplateKey;
  readonly label: string;
  readonly description: string;
  readonly departments: readonly string[];
  readonly appointmentTypes: readonly AppointmentTypeSeed[];
  /** Role presets enabled for this kind of organisation. */
  readonly roles: readonly string[];
  readonly portalSections: readonly PortalSection[];
  /** Modules this template expects; intersected with the plan's entitlements. */
  readonly modules: readonly string[];
}

export interface PlanDefinition {
  readonly key: PlanKey;
  readonly label: string;
  readonly modules: readonly string[];
  readonly maxFacilities: number;
  readonly maxStaffUsers: number;
  /** Whether the clinic may point its own domain at the portal. */
  readonly customDomains: boolean;
}

/** What an operator supplies to create a tenant. */
export interface ProvisionTenantRequest {
  readonly legalName: string;
  /**
   * URL label. Ends up in the portal address, patients' bookmarks, and printed material,
   * so it is validated hard and effectively permanent.
   */
  readonly slug: string;
  /**
   * Data residency. **Chosen once and not changeable** without a physical migration —
   * a clinic in one jurisdiction may legally not be able to share a database with another.
   */
  readonly countryCellId: string;
  readonly template: TenantTemplateKey;
  readonly plan: PlanKey;
  /** The first administrator. They receive the setup invitation. */
  readonly adminEmail: string;
  readonly adminName: string;
  /** The clinic's first site. More can be added later, up to the plan's limit. */
  readonly facilityName: string;
  readonly city: string;
  readonly timezone: string;
}

/** What the operator gets back — enough to hand the clinic their starting point. */
export interface ProvisionTenantResult {
  readonly tenantId: string;
  readonly slug: string;
  readonly facilityId: string;
  /** Where their patients will go. */
  readonly portalUrl: string;
  /**
   * Where the first administrator finishes setup.
   *
   * Contains their invitation token. Shown to the operator **once**, for delivery — the
   * plaintext is never stored, so it cannot be retrieved afterwards. That is deliberate:
   * a token the system can re-display is a token an attacker with database access can use.
   */
  readonly setupUrl: string;
  readonly inviteExpiresAt: string;
  readonly plan: PlanKey;
  readonly template: TenantTemplateKey;
  readonly seeded: {
    readonly departments: number;
    readonly appointmentTypes: number;
    readonly roles: number;
    readonly modules: readonly string[];
  };
  readonly provisionedAt: IsoTimestamp;
}

/** Why a slug cannot be used. */
export interface SlugAvailability {
  readonly slug: string;
  readonly available: boolean;
  readonly reason?: string;
  readonly suggestion?: string;
}
