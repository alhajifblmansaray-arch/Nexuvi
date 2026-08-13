/**
 * PostgreSQL Row-Level Security policies for Nexuvi.
 *
 * Blueprint §8.1 specifies: Every tenant-owned record includes country_cell_id,
 * tenant_id, organization_id, facility_id, department_id (where applicable).
 * Clinical tables use RLS keyed to the authenticated database session context.
 *
 * §17.3: Cross-tenant services operate through narrowly scoped service roles and
 * explicit stored procedures, never by disabling RLS broadly.
 *
 * These policies are applied to all tenant-scoped tables. Each policy:
 * 1. Derives the current user's tenant context from the session variables set by the API.
 * 2. Denies access to any rows outside that tenant's scope.
 * 3. Is tested by both positive (can read own org) and negative (cannot read other org) tests.
 */

-- Schema setup
CREATE SCHEMA IF NOT EXISTS nexuvi;

-- Session context: set by the API layer after authentication
-- Example: SELECT set_config('nexuvi.current_user_id', '123', false);
-- Every API request must set these before querying:
--   nexuvi.current_user_id
--   nexuvi.current_tenant_id
--   nexuvi.current_country_cell_id
-- For support impersonation, also set:
--   nexuvi.support_mode = 'true'
--   nexuvi.support_actor_id = '<actual support user ID>'

-- Helper function: get the current user's ID from session
CREATE OR REPLACE FUNCTION nexuvi.current_user_id() RETURNS UUID AS $$
  SELECT COALESCE(
    current_setting('nexuvi.current_user_id', true)::UUID,
    NULL::UUID
  )
$$ LANGUAGE SQL STABLE;

-- Helper: get current tenant
CREATE OR REPLACE FUNCTION nexuvi.current_tenant_id() RETURNS UUID AS $$
  SELECT COALESCE(
    current_setting('nexuvi.current_tenant_id', true)::UUID,
    NULL::UUID
  )
$$ LANGUAGE SQL STABLE;

-- Helper: get current country cell
CREATE OR REPLACE FUNCTION nexuvi.current_country_cell_id() RETURNS TEXT AS $$
  SELECT COALESCE(
    current_setting('nexuvi.current_country_cell_id', true),
    ''::TEXT
  )
$$ LANGUAGE SQL STABLE;

-- Helper: check if in support mode (impersonation)
CREATE OR REPLACE FUNCTION nexuvi.is_support_mode() RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    current_setting('nexuvi.support_mode', true) = 'true',
    FALSE
  )
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- Table definitions (entity skeleton; actual migrations define full schema)
-- ============================================================================

-- Platform tables (control plane): not row-level-secured, platform-wide
CREATE TABLE nexuvi.country_cells (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  default_language TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tenant (organization) and hierarchy
CREATE TABLE nexuvi.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_cell_id TEXT NOT NULL REFERENCES nexuvi.country_cells(id),
  slug TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  custom_domains TEXT[] DEFAULT '{}',
  data_cell JSONB NOT NULL, -- { type: "shared_country_cell" | "dedicated", ... }
  billing_contact_email TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at TIMESTAMP,
  UNIQUE (country_cell_id, slug)
);

-- Organizations (within a tenant; usually identity IS tenant, but can nest)
CREATE TABLE nexuvi.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES nexuvi.tenants(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  website TEXT,
  logo_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, slug)
);

-- Facilities (locations under an organization)
CREATE TABLE nexuvi.facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES nexuvi.organizations(id),
  country_cell_id TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  type TEXT NOT NULL,
  address JSONB NOT NULL, -- { street, city, district, region, postalCode, country }
  phone TEXT,
  email TEXT,
  opening_hours JSONB, -- { monday: { opensAt, closesAt }, ... }
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (country_cell_id, tenant_id) REFERENCES nexuvi.organizations(country_cell_id, tenant_id) DEFERRABLE
);

-- Departments (service units under a facility)
CREATE TABLE nexuvi.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES nexuvi.facilities(id),
  country_cell_id TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  head_user_id UUID,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Users (authentication identity)
CREATE TABLE nexuvi.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  given_name TEXT NOT NULL,
  family_name TEXT NOT NULL,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  last_sign_in_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Memberships (user + role + org/facility/dept)
-- This table is NOT row-level-secured; it's how we look up permissions.
-- Access to it is restricted at the application layer (service roles).
CREATE TABLE nexuvi.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES nexuvi.users(id),
  organization_id UUID NOT NULL REFERENCES nexuvi.organizations(id),
  country_cell_id TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  facility_ids UUID[] DEFAULT '{}',
  department_ids UUID[] DEFAULT '{}',
  roles TEXT[] NOT NULL,
  specialties TEXT[],
  license_number TEXT,
  license_expiry TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  invited_at TIMESTAMP,
  accepted_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- RLS Policies: Tenant Isolation (§17.3)
-- ============================================================================

-- Enable RLS on tenant-scoped tables
ALTER TABLE nexuvi.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexuvi.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexuvi.departments ENABLE ROW LEVEL SECURITY;

-- Policy: Organizations - users can only see their own tenant's organizations
CREATE POLICY org_isolation ON nexuvi.organizations
  FOR SELECT
  USING (
    -- Allow access if tenant_id matches the current session context
    tenant_id = nexuvi.current_tenant_id()
    -- Or if the user is a support agent in support mode
    OR nexuvi.is_support_mode()
  );

-- Policy: Facilities - users can only see their tenant's facilities
CREATE POLICY facility_isolation ON nexuvi.facilities
  FOR SELECT
  USING (
    tenant_id = nexuvi.current_tenant_id()
    OR nexuvi.is_support_mode()
  );

-- Policy: Departments - users can only see their tenant's departments
CREATE POLICY department_isolation ON nexuvi.departments
  FOR SELECT
  USING (
    tenant_id = nexuvi.current_tenant_id()
    OR nexuvi.is_support_mode()
  );

-- ============================================================================
-- Audit table (append-only, never modified or deleted)
-- ============================================================================

CREATE TABLE nexuvi.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_cell_id TEXT NOT NULL,
  tenant_id UUID,
  organization_id UUID,
  facility_id UUID,
  actor_user_id UUID,
  represented_user_id UUID, -- If impersonation
  action TEXT NOT NULL, -- 'encounter:create', 'prescription:sign', 'patient:merge', etc.
  resource_type TEXT, -- 'encounter', 'prescription', 'patient', etc.
  resource_id TEXT,
  patient_id UUID, -- For clinical events
  decision TEXT, -- 'allow', 'deny'
  reason TEXT,
  policy_id UUID,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,
  device_id TEXT
);

-- Audit is never row-level-secured; it is queried through service roles only
ALTER TABLE nexuvi.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_append_only ON nexuvi.audit_events
  FOR INSERT
  WITH CHECK (TRUE) -- Anyone can write
;

CREATE POLICY audit_read_restricted ON nexuvi.audit_events
  FOR SELECT
  USING (
    -- Only service roles and support staff can read audit
    nexuvi.is_support_mode()
  )
;

-- ============================================================================
-- Notes
-- ============================================================================

/*
These policies are templates. The actual policies will be:
1. More sophisticated, accounting for facility-level scoping, department assignment, etc.
2. Extensively tested by RLS tests (§26.1) covering:
   - Positive cases: users can access their own org/tenant
   - Negative cases: users cannot access other orgs/tenants
   - Edge cases: support impersonation, break-glass sessions
3. Part of the migration system, versioned and deployed through CI/CD (§2.1)

The session context (nexuvi.current_tenant_id, etc.) is SET by the API layer
(TypeORM middleware or NestJS interceptor) AFTER authentication and BEFORE
any database query. This is the §17.3 requirement: tenant context from trusted
routing/session, never from request body.

For multi-tenant applications, the RLS policy is the final defense against
data leakage. It is tested rigorously, and all authorization logic is duplicated
in the application layer for speed (database RLS is checked, but applications
perform authorization before showing UI).
*/
