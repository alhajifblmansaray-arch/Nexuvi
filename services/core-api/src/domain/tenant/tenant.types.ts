/**
 * Tenant hierarchy and identity.
 *
 * Blueprint §3.1 specifies:
 * - Global control plane (subscriptions, domains, feature gates)
 * - Country/regional data cell (policy pack, national integrations, data isolation)
 * - Organization/tenant (legal or operational customer boundary)
 * - Facility/location (physical or virtual care location)
 * - Department/service unit (operational grouping: outpatient, lab, pharmacy, etc.)
 */

/**
 * A country or region, the legal and operational boundary for policy, terminology,
 * integrations, and data residency. Created and managed by platform admins.
 * One instance per supported country; Sierra Leone is phase 1.
 */
export interface CountryCell {
  readonly id: string; // UUID, immutable
  readonly slug: string; // 'sierra-leone', lowercase alphanumeric
  readonly name: string;
  readonly currencyCode: string; // 'SLL'
  readonly defaultLanguage: string; // 'en'
  readonly timeZone: string; // 'Africa/Freetown'
  readonly minorVersion: string; // '1.0', incremented on policy/terminology change
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * A subscription and tenant, the customer-visible organizational identity.
 * Corresponds to one clinic, hospital group, pharmacy chain, or government programme.
 * Has its own domain, branding, billing, roles, and (optionally) dedicated database cell.
 *
 * An organization can intentionally create separate tenants when legal ownership,
 * billing, data isolation, or branding requires it (blueprint §3.4, Model B).
 */
export interface Tenant {
  readonly id: string; // UUID, immutable, used in URLs and auth context
  readonly countryCellId: string; // Foreign key to CountryCell
  readonly slug: string; // From signup; becomes part of default domain (clinic-name.nexuvi.health)
  readonly legalName: string;
  readonly plan: TenantPlan; // 'clinic', 'hospital', 'pharmacy', 'government'
  readonly status: TenantStatus; // 'draft', 'verification_pending', 'sandbox', 'activation_review', 'active', ...
  readonly customDomains: readonly string[]; // Additional domains this tenant owns (e.g., care.clinicname.com)
  readonly parentTenantId?: string; // If this is a location group within a larger organization (future)
  readonly dataCell: DataCellPlacement; // Shared country cell, or dedicated
  readonly billingContactEmail: string;
  readonly createdAt: Date;
  readonly activatedAt?: Date;
  readonly closedAt?: Date;
}

export type TenantPlan = 'clinic' | 'pharmacy' | 'lab' | 'hospital' | 'payer' | 'government';
export type TenantStatus =
  | 'draft' // Signup incomplete
  | 'verification_pending' // Awaiting identity verification
  | 'sandbox' // Verified, can pilot in test data
  | 'activation_review' // Ready for go-live, awaiting final sign-off
  | 'active' // Live, processing real care
  | 'restricted' // Active but under review or with limited features
  | 'suspended' // Locked (unpaid, breach, etc.) but data preserved
  | 'closing' // In rundown: export pending, data not yet deleted
  | 'archived'; // Closed, records exported and preserved

/**
 * Where a tenant's data lives: shared country cell, or provisioned separately.
 */
export type DataCellPlacement =
  | { readonly type: 'shared_country_cell'; readonly countryCellId: string }
  | { readonly type: 'dedicated'; readonly accountId: string; readonly region: string };

/**
 * An organization: a legal entity or operational unit within a tenant.
 * Usually the organization IS the tenant, but can be hierarchical for large groups.
 * (Phase 2+: multi-organization hierarchies and consolidated reporting.)
 */
export interface Organization {
  readonly id: string; // UUID
  readonly tenantId: string; // Foreign key to Tenant
  readonly name: string;
  readonly slug: string; // Used in multi-org URLs like clinic.nexuvi.health/orgs/east-location/
  readonly website?: string;
  readonly logoUrl?: string; // S3 key, managed by branding service
  readonly createdAt: Date;
}

/**
 * A facility or location: a physical or virtual care site under an organization.
 * Shares patients, staff, billing, and configuration with its organization,
 * but has its own hours, services, rooms, and departments.
 *
 * A clinic with one location still has exactly one facility record.
 */
export interface Facility {
  readonly id: string; // UUID
  readonly organizationId: string; // Foreign key to Organization
  readonly name: string; // "Central Clinic", "Ward A", "Pharmacy #2"
  readonly slug: string; // 'central', used in location-specific URLs
  readonly type: FacilityType; // 'clinic', 'hospital', 'pharmacy', 'lab', 'imaging', 'telehealth'
  readonly address: Address;
  readonly phone?: string;
  readonly email?: string;
  readonly openingHours: WeeklySchedule;
  readonly createdAt: Date;
}

export type FacilityType =
  | 'clinic'
  | 'hospital'
  | 'pharmacy'
  | 'lab'
  | 'imaging'
  | 'physiotherapy'
  | 'dental'
  | 'mental_health'
  | 'telehealth'
  | 'public_health';

/**
 * A department or service unit: the operational grouping for staff assignment,
 * workflow queues, and schedules. Examples: outpatient, emergency, ward, lab, pharmacy.
 */
export interface Department {
  readonly id: string; // UUID
  readonly facilityId: string; // Foreign key to Facility
  readonly name: string; // "Outpatient", "Emergency", "Pharmacy", "Lab"
  readonly type: DepartmentType;
  readonly head?: string; // User ID of the department head
  readonly createdAt: Date;
}

export type DepartmentType =
  | 'outpatient'
  | 'emergency'
  | 'ward'
  | 'intensive_care'
  | 'pharmacy'
  | 'laboratory'
  | 'imaging'
  | 'theatre'
  | 'physiotherapy'
  | 'maternal_health'
  | 'pediatrics'
  | 'mental_health'
  | 'public_health'
  | 'billing'
  | 'administration';

/**
 * Address block, reusable for organizations, facilities, patients.
 */
export interface Address {
  readonly street?: string;
  readonly city: string;
  readonly district?: string;
  readonly region?: string; // State/province
  readonly postalCode?: string;
  readonly country: string; // 'SL' for Sierra Leone
}

/**
 * Weekly schedule: opening times by day of week. Reused for facilities and departments.
 */
export interface WeeklySchedule {
  readonly monday?: TimeSlot;
  readonly tuesday?: TimeSlot;
  readonly wednesday?: TimeSlot;
  readonly thursday?: TimeSlot;
  readonly friday?: TimeSlot;
  readonly saturday?: TimeSlot;
  readonly sunday?: TimeSlot;
}

export interface TimeSlot {
  readonly opensAt: string; // 'HH:mm' in facility's time zone
  readonly closesAt: string;
  readonly isClosed?: boolean;
}

/**
 * Pagination and filtering helpers for list endpoints.
 */
export interface TenantListFilter {
  readonly countryCellId?: string;
  readonly plan?: TenantPlan;
  readonly status?: TenantStatus;
  readonly createdAfter?: Date;
  readonly limit?: number; // Default 50, max 500
  readonly offset?: number; // Default 0
}
