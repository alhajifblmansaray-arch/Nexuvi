import { persist, persistArray } from './snapshot';

/**
 * The tenant registry.
 *
 * Two tenants exist in the fixture on purpose. A single-tenant fixture cannot detect the
 * failure that matters most in this product — one customer reading another's records —
 * because every query returns the right answer by accident. With two, a missing tenant
 * filter is a failing test rather than a latent breach.
 *
 * They are deliberately different in shape: a three-site primary-care group and a hospital
 * with wards and a theatre. Isolation that only holds between two identical tenants is
 * isolation that has not been tested.
 */

/**
 * A country cell — the deployment a tenant's data physically lives in.
 *
 * Chosen at provisioning and **not changeable afterwards** without a physical migration.
 * Two clinics in different jurisdictions may legally not be able to share a database, so
 * this is the one provisioning decision that cannot be corrected with an UPDATE.
 */
export interface CountryCell {
  readonly id: string;
  readonly label: string;
  readonly isoCountryCode: string;
  /** False while a cell is being stood up; provisioning into it is refused. */
  readonly acceptingTenants: boolean;
}

export const COUNTRY_CELLS: readonly CountryCell[] = [
  { id: 'cell_sl', label: 'Sierra Leone', isoCountryCode: 'SL', acceptingTenants: true },
  { id: 'cell_gh', label: 'Ghana', isoCountryCode: 'GH', acceptingTenants: true },
  { id: 'cell_uk', label: 'United Kingdom', isoCountryCode: 'GB', acceptingTenants: false },
];

export function findCountryCell(id: string): CountryCell | undefined {
  return COUNTRY_CELLS.find((c) => c.id === id);
}

export interface TenantRecord {
  readonly id: string;
  readonly slug: string;
  readonly legalName: string;
  readonly countryCellId: string;
  readonly kind: 'clinic-group' | 'hospital';
  readonly plan?: string;
  readonly template?: string;
  readonly modules?: readonly string[];
  readonly status?: 'active' | 'suspended';
  readonly createdAt?: string;
}

/**
 * The live registry.
 *
 * Mutable because provisioning appends to it. Reads go through the helpers below rather
 * than the array, so the fixture tenants and provisioned ones are indistinguishable to
 * every consumer — which is the point: a clinic created by the API must behave exactly
 * like one that was seeded.
 */
const REGISTRY: TenantRecord[] = [
  {
    id: 'ten_01HQ8XJ4M2NP',
    slug: 'freetown-family-group',
    legalName: 'Freetown Family Health Group',
    countryCellId: 'cell_sl',
    kind: 'clinic-group',
  },
  {
    id: 'ten_01HQ9ZK7P4RS',
    slug: 'makeni-regional',
    legalName: 'Makeni Regional Hospital Trust',
    countryCellId: 'cell_sl',
    kind: 'hospital',
  },
];

persistArray('tenants', REGISTRY);

/**
 * Read-only view of the registry.
 *
 * The same array, typed so consumers cannot push to it. It stays live as tenants are
 * provisioned, which is what lets a clinic created at runtime resolve by hostname
 * immediately.
 */
export const TENANTS: readonly TenantRecord[] = REGISTRY;

export const FREETOWN_GROUP = REGISTRY[0]!.id;
export const MAKENI_TRUST = REGISTRY[1]!.id;

export function findTenant(tenantId: string): TenantRecord | undefined {
  return REGISTRY.find((t) => t.id === tenantId);
}

export function findTenantBySlug(slug: string): TenantRecord | undefined {
  return REGISTRY.find((t) => t.slug === slug.toLowerCase());
}

/**
 * Append a provisioned tenant.
 *
 * Refuses a duplicate id or slug rather than overwriting. Silently replacing a tenant
 * would repoint an existing clinic's portal at a different customer's configuration.
 */
export function registerTenant(record: TenantRecord): TenantRecord {
  if (findTenant(record.id)) {
    throw new Error(`Tenant ${record.id} already exists.`);
  }
  if (findTenantBySlug(record.slug)) {
    throw new Error(`Slug "${record.slug}" is already taken.`);
  }
  const frozen = Object.freeze({ ...record });
  REGISTRY.push(frozen);
  persist();
  return frozen;
}

/**
 * Narrows any tenant-owned collection to one tenant.
 *
 * Every store read goes through this rather than filtering inline, so there is a single
 * place to look when asking "is this path tenant-safe" — and a single place a reviewer can
 * grep for when it is missing.
 */
export function scopedToTenant<T extends { readonly tenantId: string }>(
  rows: readonly T[],
  tenantId: string,
): readonly T[] {
  return rows.filter((row) => row.tenantId === tenantId);
}
