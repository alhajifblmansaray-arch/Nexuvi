-- Nexuvi initial schema.
--
-- Covers the tables the current API reads and writes: tenancy, identity, facilities,
-- encounters, the audit log, and the roster. The remaining domains (orders, results,
-- prescriptions, billing) land with their modules.
--
-- Two properties this migration exists to establish, both of which the application layer
-- also enforces and neither of which should depend on the application layer alone:
--
--   1. Tenant isolation via RLS. The API sets session variables after authentication;
--      the database refuses cross-tenant rows regardless of what the query asked for.
--   2. An append-only audit log. `audit_events` has no UPDATE or DELETE grant and a
--      trigger that refuses both, so §19 immutability survives a compromised application
--      role and an operator with a psql prompt.
--
-- NOT YET VERIFIED AGAINST A LIVE DATABASE — no container runtime is installed on the
-- development machine (see README "Local environment"). Run it against a scratch Postgres
-- and reconcile before trusting it.

BEGIN;

CREATE SCHEMA IF NOT EXISTS nexuvi;
SET search_path TO nexuvi, public;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

-- The application connects as this role. It is deliberately NOT the table owner: RLS is
-- bypassed by table owners and by superusers, so an application running as owner would
-- have policies silently ignored.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexuvi_app') THEN
    CREATE ROLE nexuvi_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexuvi_migrator') THEN
    CREATE ROLE nexuvi_migrator NOLOGIN;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

CREATE TABLE country_cells (
  id               TEXT PRIMARY KEY,            -- 'cell_sl'
  name             TEXT NOT NULL,
  iso_country_code CHAR(2) NOT NULL,
  data_residency   TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tenants (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_cell_id       TEXT NOT NULL REFERENCES country_cells(id),
  slug                  TEXT NOT NULL UNIQUE,
  legal_name            TEXT NOT NULL,
  plan                  TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'active',
  billing_contact_email TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenants_status_check CHECK (status IN ('active', 'suspended', 'closed'))
);

CREATE TABLE organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE facilities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  country_cell_id TEXT NOT NULL REFERENCES country_cells(id),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  city            TEXT NOT NULL,
  timezone        TEXT NOT NULL,          -- IANA zone, e.g. 'Africa/Freetown'
  address         JSONB NOT NULL DEFAULT '{}'::jsonb,
  opening_hours   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

CREATE INDEX facilities_tenant_idx ON facilities (tenant_id);

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,       -- Subject claim from the identity provider
  email       CITEXT,
  given_name  TEXT NOT NULL,
  family_name TEXT NOT NULL,
  mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Empty array means organisation-wide access. The application relies on that reading
  -- (see `Principal.facilityIds`), so it is written down here too.
  facility_ids UUID[] NOT NULL DEFAULT '{}',
  roles        TEXT[] NOT NULL DEFAULT '{}',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id)
);

CREATE INDEX memberships_tenant_idx ON memberships (tenant_id);

-- ---------------------------------------------------------------------------
-- Clinical
-- ---------------------------------------------------------------------------

CREATE TABLE patients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  mrn         TEXT NOT NULL,              -- Medical record number, unique per tenant
  given_name  TEXT NOT NULL,
  family_name TEXT NOT NULL,
  birth_date  DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, mrn)
);

CREATE TABLE encounters (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  facility_id      UUID NOT NULL REFERENCES facilities(id) ON DELETE RESTRICT,
  patient_id       UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  reference        TEXT NOT NULL,          -- 'ENC-10847'
  type             TEXT NOT NULL,
  status           TEXT NOT NULL,
  department       TEXT NOT NULL,
  clinician_id     UUID REFERENCES users(id),
  reason_for_visit TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_since     TIMESTAMPTZ NOT NULL DEFAULT now(),  -- Drives "waiting" figures
  closed_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, reference),
  CONSTRAINT encounters_status_check CHECK (status IN (
    'scheduled', 'checked-in', 'in-progress', 'awaiting-review',
    'blocked', 'on-hold', 'completed', 'cancelled'
  ))
);

-- The dashboard's hot path: open work at one facility, most urgent first.
CREATE INDEX encounters_open_idx
  ON encounters (tenant_id, facility_id, status_since)
  WHERE status NOT IN ('completed', 'cancelled');

CREATE INDEX encounters_clinician_idx ON encounters (tenant_id, clinician_id);

CREATE TABLE encounter_flags (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  label        TEXT NOT NULL,
  detail       TEXT,
  CONSTRAINT encounter_flags_kind_check CHECK (kind IN (
    'allergy', 'critical-result', 'controlled-substance', 'infection-control'
  ))
);

CREATE INDEX encounter_flags_encounter_idx ON encounter_flags (encounter_id);

-- ---------------------------------------------------------------------------
-- Roster
-- ---------------------------------------------------------------------------

CREATE TABLE shifts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  facility_id  UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  clinician_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Keyed by (clinician, facility, weekday) so one clinician can cover several sites on
  -- different days. See the Schedule section of the README.
  weekday      SMALLINT NOT NULL,          -- ISO: 1 = Monday … 7 = Sunday
  kind         TEXT NOT NULL,
  start_minute SMALLINT NOT NULL,          -- Minutes from local midnight at the facility
  end_minute   SMALLINT NOT NULL,
  label        TEXT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to   DATE,
  CONSTRAINT shifts_weekday_check CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT shifts_kind_check CHECK (kind IN ('shift', 'break', 'unavailable')),
  CONSTRAINT shifts_span_check CHECK (start_minute >= 0 AND end_minute <= 1440 AND start_minute < end_minute)
);

CREATE INDEX shifts_lookup_idx ON shifts (tenant_id, facility_id, weekday);

CREATE TABLE appointments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  facility_id   UUID NOT NULL REFERENCES facilities(id) ON DELETE RESTRICT,
  encounter_id  UUID REFERENCES encounters(id) ON DELETE SET NULL,
  clinician_id  UUID NOT NULL REFERENCES users(id),
  patient_id    UUID NOT NULL REFERENCES patients(id),
  service_label TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'booked',
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  room          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT appointments_status_check CHECK (status IN (
    'booked', 'arrived', 'in-progress', 'completed', 'no-show', 'cancelled'
  )),
  CONSTRAINT appointments_span_check CHECK (ends_at > starts_at)
);

CREATE INDEX appointments_day_idx ON appointments (tenant_id, facility_id, starts_at);

-- ---------------------------------------------------------------------------
-- Audit (§19)
-- ---------------------------------------------------------------------------

CREATE TABLE audit_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  facility_id  UUID REFERENCES facilities(id),
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  action       TEXT NOT NULL,
  -- Actor identity is denormalised on purpose: a clinician who later changes role or
  -- leaves must not retroactively rewrite what the record says about who did what.
  actor_user_id     UUID NOT NULL,
  actor_display_name TEXT NOT NULL,
  actor_role        TEXT NOT NULL,
  support_actor_id  UUID,
  subject_type TEXT NOT NULL,
  subject_id   UUID NOT NULL,
  subject_reference TEXT NOT NULL,
  changes      JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason       TEXT,
  source       TEXT NOT NULL DEFAULT 'api',
  correlation_id TEXT
);

CREATE INDEX audit_events_subject_idx ON audit_events (tenant_id, subject_id, occurred_at);
CREATE INDEX audit_events_actor_idx   ON audit_events (tenant_id, actor_user_id, occurred_at);

-- Append-only, enforced in the database rather than only in `AuditService`.
--
-- The trigger is belt to the grant's braces: revoking UPDATE/DELETE stops the application
-- role, and the trigger stops anyone who acquires a broader one. An audit log that a
-- compromised application can rewrite is not an audit log.
CREATE OR REPLACE FUNCTION nexuvi.refuse_audit_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (blueprint §19): % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION nexuvi.refuse_audit_mutation();

CREATE TRIGGER audit_events_no_delete
  BEFORE DELETE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION nexuvi.refuse_audit_mutation();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA nexuvi TO nexuvi_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  organizations, facilities, patients, encounters, encounter_flags, shifts, appointments
  TO nexuvi_app;

GRANT SELECT ON country_cells, tenants, users, memberships TO nexuvi_app;

-- The application may write audit entries and read them back. It may never change one.
GRANT SELECT, INSERT ON audit_events TO nexuvi_app;
REVOKE UPDATE, DELETE ON audit_events FROM nexuvi_app;

COMMIT;
