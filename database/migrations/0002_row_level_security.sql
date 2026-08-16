-- Row-level security for every tenant-scoped table.
--
-- The second layer after API authorization (§17.3). The application already filters by
-- tenant; this makes a query that *forgets* to return nothing rather than everything.
--
-- Session variables are set by the API after authentication, from verified token claims,
-- never from a request body. Helper functions live in `database/policies/rls-policies.sql`.
--
-- Two things that make RLS quietly useless if missed, both handled here:
--
--   1. **FORCE ROW LEVEL SECURITY.** Without it the table owner bypasses every policy,
--      so a migration or a maintenance session silently sees the whole estate.
--   2. **A restrictive fallback.** Permissive policies OR together, so one over-broad
--      policy re-opens the table. The tenant check is RESTRICTIVE, meaning it ANDs with
--      everything else and cannot be widened by a later addition.
--
-- NOT YET VERIFIED AGAINST A LIVE DATABASE. The positive/negative isolation tests the
-- blueprint requires (§17.3) land with the Postgres adapter.

BEGIN;

SET search_path TO nexuvi, public;

CREATE OR REPLACE FUNCTION nexuvi.current_tenant_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('nexuvi.current_tenant_id', true), '')::UUID
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION nexuvi.current_user_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('nexuvi.current_user_id', true), '')::UUID
$$ LANGUAGE SQL STABLE;

DO $$
DECLARE
  target TEXT;
  tenant_scoped TEXT[] := ARRAY[
    'organizations', 'facilities', 'patients', 'encounters',
    'encounter_flags', 'shifts', 'appointments', 'audit_events'
  ];
BEGIN
  FOREACH target IN ARRAY tenant_scoped LOOP
    EXECUTE format('ALTER TABLE nexuvi.%I ENABLE ROW LEVEL SECURITY', target);
    -- Without FORCE, the owner bypasses policies entirely.
    EXECUTE format('ALTER TABLE nexuvi.%I FORCE ROW LEVEL SECURITY', target);

    -- Restrictive: ANDs with every other policy. A permissive policy added later can
    -- narrow access further but can never widen it past the tenant boundary.
    EXECUTE format($p$
      CREATE POLICY %1$I_tenant_isolation ON nexuvi.%1$I
        AS RESTRICTIVE
        FOR ALL
        USING (tenant_id = nexuvi.current_tenant_id())
        WITH CHECK (tenant_id = nexuvi.current_tenant_id())
    $p$, target);

    -- Permissive companion, so the RESTRICTIVE policy has something to AND against.
    -- Without it PostgreSQL denies everything: restrictive policies filter, they do not grant.
    EXECUTE format($p$
      CREATE POLICY %1$I_app_access ON nexuvi.%1$I
        FOR ALL TO nexuvi_app
        USING (true)
        WITH CHECK (true)
    $p$, target);
  END LOOP;
END
$$;

-- A session with no tenant set reads nothing anywhere, rather than reading everything.
-- `current_tenant_id()` returns NULL, and `tenant_id = NULL` is NULL, which is not true.
-- Stated explicitly because it is the property the whole file rests on.
COMMENT ON FUNCTION nexuvi.current_tenant_id() IS
  'Tenant for the current session, set by API middleware from verified token claims. '
  'NULL when unset, which makes every RLS check fail closed.';

-- Memberships are read during authorization, scoped to the tenant being entered.
ALTER TABLE nexuvi.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexuvi.memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY memberships_tenant_isolation ON nexuvi.memberships
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = nexuvi.current_tenant_id())
  WITH CHECK (tenant_id = nexuvi.current_tenant_id());

CREATE POLICY memberships_app_access ON nexuvi.memberships
  FOR ALL TO nexuvi_app USING (true) WITH CHECK (true);

COMMIT;
