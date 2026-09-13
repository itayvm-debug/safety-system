-- ================================================================
-- SafeDoc — RLS Hotfix: Close workers INSERT bypass
-- ================================================================
--
-- PROBLEM CONFIRMED (2026-09-13):
--   Live attack test proved that an authenticated member JWT can INSERT
--   workers rows directly via the Supabase REST API (HTTP 201).
--
--   workers_insert_company policy survived the rls_remove_authenticated_mutations
--   migration for reasons that are unclear (UPDATE and DELETE policies were
--   dropped correctly; only INSERT survived).
--
-- FIX:
--   Drop workers_insert_company (the surviving policy).
--   Also drop all other possible legacy names as a safety net.
--   Assertion uses RAISE EXCEPTION so the migration FAILS (and rolls back)
--   if any authenticated INSERT/UPDATE/DELETE policies remain on workers.
--
-- SAFE TO RUN:
--   All DROPs use IF EXISTS — idempotent, no-op if already removed.
--   No data is modified. No tables are altered.
-- ================================================================

BEGIN;

-- Drop all known authenticated mutation policy names for workers
DROP POLICY IF EXISTS "workers_insert_company"            ON workers;
DROP POLICY IF EXISTS "workers_update_company"            ON workers;
DROP POLICY IF EXISTS "workers_delete_company"            ON workers;
DROP POLICY IF EXISTS "authenticated users can manage workers" ON workers;
-- Any other possible names that could have been applied
DROP POLICY IF EXISTS "workers_authenticated"             ON workers;
DROP POLICY IF EXISTS "Auth users can manage workers"     ON workers;

-- Hard assertion — RAISE EXCEPTION rolls back if any mutation policy remains
DO $$
DECLARE
  remaining INT;
  pol_names TEXT;
BEGIN
  SELECT COUNT(*), string_agg(policyname, ', ')
    INTO remaining, pol_names
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename   = 'workers'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    AND (roles @> ARRAY['authenticated']::name[]
      OR roles @> ARRAY['public']::name[]);

  IF remaining > 0 THEN
    RAISE EXCEPTION
      'HOTFIX FAILED: % authenticated/public mutation policies still exist on workers: [%]',
      remaining, pol_names;
  ELSE
    RAISE NOTICE 'HOTFIX OK: workers table has zero authenticated mutation policies.';
  END IF;

  -- Confirm service_role ALL policy is still present
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'workers'
      AND policyname  = 'workers_service_all'
  ) THEN
    RAISE EXCEPTION 'HOTFIX FAILED: workers_service_all policy is missing — app mutations will break!';
  ELSE
    RAISE NOTICE 'HOTFIX OK: workers_service_all (service_role) policy confirmed present.';
  END IF;
END $$;

COMMIT;
