-- ============================================================================
-- Migration: Phase 2 Batch 3 — Vehicle Children Tenant Isolation
-- mt_phase2_batch3_vehicle_children.sql
--
-- אין לבצע SQL על Supabase Production ללא אישור מפורש.
-- Do NOT run SQL. Do NOT commit. Do NOT push. Do NOT deploy.
--
-- Idempotent: every DDL uses IF NOT EXISTS / IF EXISTS / conditional logic.
-- Run preview SQL first, verify migration_state = 'CLEAN PRE-MIGRATION'.
-- Run preview SQL again after this script, verify 'MIGRATION COMPLETE'.
--
-- Tables: vehicle_licenses, vehicle_insurances
-- Changes: add company_id NOT NULL, backfill from parent vehicle,
--          consistency trigger, company-scoped RLS.
-- ============================================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- SAFETY GUARD 1: Abort if vehicles.company_id is not yet populated.
-- Batch 2 must complete before Batch 3.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicles'
      AND column_name = 'company_id'
  ) THEN
    RAISE EXCEPTION
      'BLOCKED: vehicles.company_id does not exist. '
      'Run Phase 2 Batch 2 migration (mt_phase2_batch2_subcontractors_vehicles.sql) first.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM vehicles WHERE company_id IS NULL LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'BLOCKED: Some vehicles rows have NULL company_id. '
      'Batch 2 migration must complete successfully before running Batch 3.';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- SAFETY GUARD 2: Verify no orphan vehicle_id in vehicle_licenses.
-- Structurally impossible (FK exists), but verified for clarity.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_orphan_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_orphan_count
  FROM vehicle_licenses vl
  LEFT JOIN vehicles v ON v.id = vl.vehicle_id
  WHERE v.id IS NULL;

  IF v_orphan_count > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % vehicle_license row(s) have vehicle_id with no matching vehicle. '
      'Inspect vehicle_licenses.vehicle_id for referential integrity.',
      v_orphan_count;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- SAFETY GUARD 3: Same check for vehicle_insurances.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_orphan_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_orphan_count
  FROM vehicle_insurances vi
  LEFT JOIN vehicles v ON v.id = vi.vehicle_id
  WHERE v.id IS NULL;

  IF v_orphan_count > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % vehicle_insurance row(s) have vehicle_id with no matching vehicle. '
      'Inspect vehicle_insurances.vehicle_id for referential integrity.',
      v_orphan_count;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: vehicle_licenses — add company_id
-- ════════════════════════════════════════════════════════════════════════════

-- 1a. Add column nullable first (backfill before enforcing NOT NULL)
ALTER TABLE vehicle_licenses
  ADD COLUMN IF NOT EXISTS company_id UUID
    REFERENCES companies(id) ON DELETE RESTRICT;

-- 1b. Backfill: derive company_id from parent vehicle
--     vehicles.company_id is NOT NULL (asserted in Safety Guard 1)
UPDATE vehicle_licenses vl
SET company_id = v.company_id
FROM vehicles v
WHERE vl.vehicle_id = v.id
  AND vl.company_id IS NULL;

-- 1c. Assert zero NULL after backfill
DO $$
DECLARE v_null_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM vehicle_licenses WHERE company_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % vehicle_license row(s) have NULL company_id after backfill. '
      'This should not occur if all vehicle_id values reference vehicles with company_id set.',
      v_null_count;
  END IF;
END $$;

-- 1d. Assert zero parent-company mismatch
DO $$
DECLARE v_mismatch_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_mismatch_count
  FROM vehicle_licenses vl
  JOIN vehicles v ON v.id = vl.vehicle_id
  WHERE vl.company_id IS DISTINCT FROM v.company_id;

  IF v_mismatch_count > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % vehicle_license row(s) have company_id different from parent vehicle. '
      'Expected: child.company_id = parent_vehicle.company_id.',
      v_mismatch_count;
  END IF;
END $$;

-- 1e. Index for efficient company-scoped queries
CREATE INDEX IF NOT EXISTS vehicle_licenses_company_id_idx
  ON vehicle_licenses (company_id);

-- 1f. Enforce NOT NULL (backfill verified at 1c)
ALTER TABLE vehicle_licenses ALTER COLUMN company_id SET NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: vehicle_insurances — add company_id
-- ════════════════════════════════════════════════════════════════════════════

-- 2a. Add column nullable first
ALTER TABLE vehicle_insurances
  ADD COLUMN IF NOT EXISTS company_id UUID
    REFERENCES companies(id) ON DELETE RESTRICT;

-- 2b. Backfill from parent vehicle
UPDATE vehicle_insurances vi
SET company_id = v.company_id
FROM vehicles v
WHERE vi.vehicle_id = v.id
  AND vi.company_id IS NULL;

-- 2c. Assert zero NULL after backfill
DO $$
DECLARE v_null_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM vehicle_insurances WHERE company_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % vehicle_insurance row(s) have NULL company_id after backfill.',
      v_null_count;
  END IF;
END $$;

-- 2d. Assert zero parent-company mismatch
DO $$
DECLARE v_mismatch_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_mismatch_count
  FROM vehicle_insurances vi
  JOIN vehicles v ON v.id = vi.vehicle_id
  WHERE vi.company_id IS DISTINCT FROM v.company_id;

  IF v_mismatch_count > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % vehicle_insurance row(s) have company_id different from parent vehicle.',
      v_mismatch_count;
  END IF;
END $$;

-- 2e. Index for efficient company-scoped queries
CREATE INDEX IF NOT EXISTS vehicle_insurances_company_id_idx
  ON vehicle_insurances (company_id);

-- 2f. Enforce NOT NULL
ALTER TABLE vehicle_insurances ALTER COLUMN company_id SET NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: Consistency trigger
-- Invariant: child.company_id MUST equal parent vehicle.company_id.
-- Enforces this on INSERT and UPDATE; prevents cross-company vehicle re-assignment.
-- ════════════════════════════════════════════════════════════════════════════

-- 3a. Shared trigger function (TG_TABLE_NAME identifies which table fired it)
CREATE OR REPLACE FUNCTION public.enforce_vehicle_child_company_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_vehicle_company_id UUID;
BEGIN
  SELECT company_id INTO v_vehicle_company_id
  FROM public.vehicles
  WHERE id = NEW.vehicle_id;

  IF v_vehicle_company_id IS NULL THEN
    RAISE EXCEPTION
      'INTEGRITY VIOLATION: vehicle_id % not found or has NULL company_id in vehicles.',
      NEW.vehicle_id;
  END IF;

  -- IS DISTINCT FROM handles NULL correctly (NULL IS DISTINCT FROM uuid → true)
  IF NEW.company_id IS DISTINCT FROM v_vehicle_company_id THEN
    RAISE EXCEPTION
      'INTEGRITY VIOLATION: %.company_id (%) must equal parent vehicle.company_id (%). '
      'Ensure child rows inherit company_id from the parent vehicle.',
      TG_TABLE_NAME, NEW.company_id, v_vehicle_company_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 3b. Trigger on vehicle_licenses
DROP TRIGGER IF EXISTS vehicle_licenses_company_id_check ON vehicle_licenses;
CREATE TRIGGER vehicle_licenses_company_id_check
  BEFORE INSERT OR UPDATE ON vehicle_licenses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_vehicle_child_company_id();

-- 3c. Trigger on vehicle_insurances
DROP TRIGGER IF EXISTS vehicle_insurances_company_id_check ON vehicle_insurances;
CREATE TRIGGER vehicle_insurances_company_id_check
  BEFORE INSERT OR UPDATE ON vehicle_insurances
  FOR EACH ROW EXECUTE FUNCTION public.enforce_vehicle_child_company_id();

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: RLS — vehicle_licenses
-- No existing blanket policies (vehicle_licenses had no RLS before Batch 3).
-- service_role bypasses RLS in all API routes — these policies are defense-in-depth.
-- ════════════════════════════════════════════════════════════════════════════

-- 4a. Enable RLS (idempotent: no-op if already enabled)
ALTER TABLE vehicle_licenses ENABLE ROW LEVEL SECURITY;

-- 4b. Drop new policies before creating (idempotency for re-runs)
DROP POLICY IF EXISTS "vehicle_licenses_select_company"  ON vehicle_licenses;
DROP POLICY IF EXISTS "vehicle_licenses_insert_company"  ON vehicle_licenses;
DROP POLICY IF EXISTS "vehicle_licenses_update_company"  ON vehicle_licenses;
DROP POLICY IF EXISTS "vehicle_licenses_delete_company"  ON vehicle_licenses;
DROP POLICY IF EXISTS "vehicle_licenses_service_all"     ON vehicle_licenses;

-- 4c. Company-scoped policies
CREATE POLICY "vehicle_licenses_select_company"
  ON vehicle_licenses FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "vehicle_licenses_insert_company"
  ON vehicle_licenses FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "vehicle_licenses_update_company"
  ON vehicle_licenses FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "vehicle_licenses_delete_company"
  ON vehicle_licenses FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

-- 4d. service_role full access (explicit — redundant because service_role bypasses RLS, but clear)
CREATE POLICY "vehicle_licenses_service_all"
  ON vehicle_licenses FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: RLS — vehicle_insurances
-- ════════════════════════════════════════════════════════════════════════════

-- 5a. Enable RLS
ALTER TABLE vehicle_insurances ENABLE ROW LEVEL SECURITY;

-- 5b. Drop existing policies (idempotency)
DROP POLICY IF EXISTS "vehicle_insurances_select_company"  ON vehicle_insurances;
DROP POLICY IF EXISTS "vehicle_insurances_insert_company"  ON vehicle_insurances;
DROP POLICY IF EXISTS "vehicle_insurances_update_company"  ON vehicle_insurances;
DROP POLICY IF EXISTS "vehicle_insurances_delete_company"  ON vehicle_insurances;
DROP POLICY IF EXISTS "vehicle_insurances_service_all"     ON vehicle_insurances;

-- 5c. Company-scoped policies
CREATE POLICY "vehicle_insurances_select_company"
  ON vehicle_insurances FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "vehicle_insurances_insert_company"
  ON vehicle_insurances FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "vehicle_insurances_update_company"
  ON vehicle_insurances FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "vehicle_insurances_delete_company"
  ON vehicle_insurances FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

-- 5d. service_role full access
CREATE POLICY "vehicle_insurances_service_all"
  ON vehicle_insurances FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 6: Pre-commit assertions
-- Verify all migration steps completed correctly.
-- RAISE EXCEPTION triggers automatic rollback on any failure.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_lic_total      INT;
  v_lic_with_cid   INT;
  v_ins_total      INT;
  v_ins_with_cid   INT;
  v_lic_nullable   BOOLEAN;
  v_ins_nullable   BOOLEAN;
  v_lic_mismatch   INT;
  v_ins_mismatch   INT;
BEGIN
  -- Row counts
  SELECT COUNT(*)  INTO v_lic_total    FROM vehicle_licenses;
  SELECT COUNT(*)  INTO v_lic_with_cid FROM vehicle_licenses WHERE company_id IS NOT NULL;
  SELECT COUNT(*)  INTO v_ins_total    FROM vehicle_insurances;
  SELECT COUNT(*)  INTO v_ins_with_cid FROM vehicle_insurances WHERE company_id IS NOT NULL;

  -- Nullable status
  SELECT (is_nullable = 'YES') INTO v_lic_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'vehicle_licenses'
    AND column_name = 'company_id';

  SELECT (is_nullable = 'YES') INTO v_ins_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'vehicle_insurances'
    AND column_name = 'company_id';

  -- Parent-company mismatch counts
  SELECT COUNT(*) INTO v_lic_mismatch
  FROM vehicle_licenses vl
  JOIN vehicles v ON v.id = vl.vehicle_id
  WHERE vl.company_id IS DISTINCT FROM v.company_id;

  SELECT COUNT(*) INTO v_ins_mismatch
  FROM vehicle_insurances vi
  JOIN vehicles v ON v.id = vi.vehicle_id
  WHERE vi.company_id IS DISTINCT FROM v.company_id;

  -- Assert: backfill complete
  IF v_lic_with_cid <> v_lic_total THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % of % vehicle_license rows have NULL company_id.',
      (v_lic_total - v_lic_with_cid), v_lic_total;
  END IF;

  IF v_ins_with_cid <> v_ins_total THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % of % vehicle_insurance rows have NULL company_id.',
      (v_ins_total - v_ins_with_cid), v_ins_total;
  END IF;

  -- Assert: NOT NULL enforced
  IF v_lic_nullable IS TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: vehicle_licenses.company_id is still nullable.';
  END IF;

  IF v_ins_nullable IS TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: vehicle_insurances.company_id is still nullable.';
  END IF;

  -- Assert: zero parent-company mismatches
  IF v_lic_mismatch > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % vehicle_license rows have company_id mismatch with parent vehicle.',
      v_lic_mismatch;
  END IF;

  IF v_ins_mismatch > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % vehicle_insurance rows have company_id mismatch with parent vehicle.',
      v_ins_mismatch;
  END IF;

  -- Assert: indexes exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'vehicle_licenses'
      AND indexname = 'vehicle_licenses_company_id_idx'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: vehicle_licenses_company_id_idx missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'vehicle_insurances'
      AND indexname = 'vehicle_insurances_company_id_idx'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: vehicle_insurances_company_id_idx missing.';
  END IF;

  -- Assert: consistency triggers exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'vehicle_licenses'
      AND t.tgname = 'vehicle_licenses_company_id_check' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: vehicle_licenses_company_id_check trigger missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'vehicle_insurances'
      AND t.tgname = 'vehicle_insurances_company_id_check' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: vehicle_insurances_company_id_check trigger missing.';
  END IF;

  -- Assert: RLS enabled
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.vehicle_licenses'::regclass) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: RLS is not enabled on vehicle_licenses.';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.vehicle_insurances'::regclass) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: RLS is not enabled on vehicle_insurances.';
  END IF;

  -- Assert: key policies exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vehicle_licenses'
      AND policyname = 'vehicle_licenses_select_company'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: vehicle_licenses_select_company policy missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vehicle_insurances'
      AND policyname = 'vehicle_insurances_select_company'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: vehicle_insurances_select_company policy missing.';
  END IF;

END $$;

-- STEP 6 confirmation row — only reached if all assertions passed.
SELECT
  'ALL ASSERTIONS PASSED'                                              AS assertion_status,
  (SELECT COUNT(*)::int FROM vehicle_licenses WHERE company_id IS NOT NULL) AS lic_cid_populated,
  (SELECT COUNT(*)::int FROM vehicle_licenses)                         AS lic_total,
  (SELECT COUNT(*)::int FROM vehicle_insurances WHERE company_id IS NOT NULL) AS ins_cid_populated,
  (SELECT COUNT(*)::int FROM vehicle_insurances)                       AS ins_total,
  (SELECT COUNT(*)::int FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'vehicle_licenses')     AS lic_policy_count,
  (SELECT COUNT(*)::int FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'vehicle_insurances')   AS ins_policy_count,
  (SELECT relrowsecurity FROM pg_class
   WHERE oid = 'public.vehicle_licenses'::regclass)                    AS lic_rls_enabled,
  (SELECT relrowsecurity FROM pg_class
   WHERE oid = 'public.vehicle_insurances'::regclass)                  AS ins_rls_enabled,
  (SELECT COUNT(*)::int FROM pg_trigger t
   JOIN pg_class c ON c.oid = t.tgrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('vehicle_licenses', 'vehicle_insurances')
     AND t.tgname LIKE '%company_id_check%'
     AND NOT t.tgisinternal)                                           AS consistency_trigger_count;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION (run after COMMIT)
-- ════════════════════════════════════════════════════════════════════════════
-- Run: supabase/mt_phase2_batch3_vehicle_children_preview.sql
-- Expected: migration_state = 'MIGRATION COMPLETE'

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (use only if needed — see docs/multi-tenant/PHASE2_BATCH3_ROLLBACK_HE.md)
-- ════════════════════════════════════════════════════════════════════════════
/*
BEGIN;

DROP TRIGGER IF EXISTS vehicle_licenses_company_id_check   ON vehicle_licenses;
DROP TRIGGER IF EXISTS vehicle_insurances_company_id_check ON vehicle_insurances;
DROP FUNCTION IF EXISTS public.enforce_vehicle_child_company_id();

DROP POLICY IF EXISTS "vehicle_licenses_select_company"  ON vehicle_licenses;
DROP POLICY IF EXISTS "vehicle_licenses_insert_company"  ON vehicle_licenses;
DROP POLICY IF EXISTS "vehicle_licenses_update_company"  ON vehicle_licenses;
DROP POLICY IF EXISTS "vehicle_licenses_delete_company"  ON vehicle_licenses;
DROP POLICY IF EXISTS "vehicle_licenses_service_all"     ON vehicle_licenses;
ALTER TABLE vehicle_licenses DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicle_insurances_select_company"  ON vehicle_insurances;
DROP POLICY IF EXISTS "vehicle_insurances_insert_company"  ON vehicle_insurances;
DROP POLICY IF EXISTS "vehicle_insurances_update_company"  ON vehicle_insurances;
DROP POLICY IF EXISTS "vehicle_insurances_delete_company"  ON vehicle_insurances;
DROP POLICY IF EXISTS "vehicle_insurances_service_all"     ON vehicle_insurances;
ALTER TABLE vehicle_insurances DISABLE ROW LEVEL SECURITY;

DROP INDEX IF EXISTS public.vehicle_licenses_company_id_idx;
DROP INDEX IF EXISTS public.vehicle_insurances_company_id_idx;

ALTER TABLE vehicle_licenses  DROP COLUMN IF EXISTS company_id;
ALTER TABLE vehicle_insurances DROP COLUMN IF EXISTS company_id;

COMMIT;
*/
