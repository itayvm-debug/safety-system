-- ================================================================
-- SafeDoc — RLS Hotfix: Close vehicle-children + HE-insurance bypasses
-- ================================================================
--
-- PROBLEM CONFIRMED (2026-09-13):
--   migration_session1_legal_security.sql created three open policies:
--     "vehicle_licenses_authenticated"       ON vehicle_licenses
--     "vehicle_insurances_authenticated"     ON vehicle_insurances
--     "heavy_equipment_insurances_authenticated" ON heavy_equipment_insurances
--   All are FOR ALL TO authenticated USING(true) WITH CHECK(true).
--   The original hardening migration (rls_remove_authenticated_mutations.sql)
--   dropped the per-operation _insert_company / _update_company / _delete_company
--   variants but MISSED these three FOR ALL policies.
--
--   Evidence: vehicle_insurances INSERT returned HTTP 409 (unique constraint)
--   instead of 403 (RLS block) — the INSERT passed RLS and reached the DB.
--
-- FIX:
--   Drop the three open authenticated policies.
--   Assertion uses RAISE EXCEPTION so the migration FAILS (and rolls back)
--   if any authenticated/public INSERT/UPDATE/DELETE/ALL policy remains.
--
-- SAFE TO RUN:
--   All DROPs use IF EXISTS — idempotent.
--   service_role policies are NOT touched.
--   No data is modified, no tables altered.
-- ================================================================

BEGIN;

-- vehicle_licenses
DROP POLICY IF EXISTS "vehicle_licenses_authenticated"            ON vehicle_licenses;
DROP POLICY IF EXISTS "vehicle_licenses_insert_company"           ON vehicle_licenses;
DROP POLICY IF EXISTS "vehicle_licenses_update_company"           ON vehicle_licenses;
DROP POLICY IF EXISTS "vehicle_licenses_delete_company"           ON vehicle_licenses;

-- vehicle_insurances
DROP POLICY IF EXISTS "vehicle_insurances_authenticated"          ON vehicle_insurances;
DROP POLICY IF EXISTS "vehicle_insurances_insert_company"         ON vehicle_insurances;
DROP POLICY IF EXISTS "vehicle_insurances_update_company"         ON vehicle_insurances;
DROP POLICY IF EXISTS "vehicle_insurances_delete_company"         ON vehicle_insurances;

-- heavy_equipment_insurances
DROP POLICY IF EXISTS "heavy_equipment_insurances_authenticated"  ON heavy_equipment_insurances;
DROP POLICY IF EXISTS "heavy_equipment_insurances_insert_company" ON heavy_equipment_insurances;
DROP POLICY IF EXISTS "heavy_equipment_insurances_update_company" ON heavy_equipment_insurances;
DROP POLICY IF EXISTS "heavy_equipment_insurances_delete_company" ON heavy_equipment_insurances;

-- Hard assertion — RAISE EXCEPTION rolls back if any mutation policy remains
DO $$
DECLARE
  remaining INT;
  pol_names TEXT;
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['vehicle_licenses','vehicle_insurances','heavy_equipment_insurances']) LOOP
    SELECT COUNT(*), string_agg(policyname, ', ')
      INTO remaining, pol_names
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = tbl
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND (roles @> ARRAY['authenticated']::name[]
        OR roles @> ARRAY['public']::name[]);

    IF remaining > 0 THEN
      RAISE EXCEPTION
        'HOTFIX FAILED: % authenticated/public mutation policies still exist on %: [%]',
        remaining, tbl, pol_names;
    ELSE
      RAISE NOTICE 'HOTFIX OK: % has zero authenticated mutation policies.', tbl;
    END IF;

    -- Confirm service_role policy is present
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename   = tbl
        AND policyname  = tbl || '_service_all'
    ) THEN
      RAISE EXCEPTION 'HOTFIX FAILED: %_service_all policy is missing — app mutations will break!', tbl;
    ELSE
      RAISE NOTICE 'HOTFIX OK: %_service_all (service_role) policy confirmed present.', tbl;
    END IF;
  END LOOP;
END $$;

COMMIT;
