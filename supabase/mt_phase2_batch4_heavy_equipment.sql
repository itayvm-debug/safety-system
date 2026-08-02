-- ============================================================================
-- Migration: Phase 2 Batch 4 — Heavy Equipment Tenant Isolation
-- mt_phase2_batch4_heavy_equipment.sql
--
-- אין לבצע SQL על Supabase Production ללא אישור מפורש.
-- Do NOT run SQL. Do NOT commit. Do NOT push. Do NOT deploy.
--
-- Idempotent: every DDL uses IF NOT EXISTS / IF EXISTS / conditional logic.
-- Run preview SQL first, verify migration_state = 'CLEAN PRE-MIGRATION'.
-- Run preview SQL again after this script, verify 'MIGRATION COMPLETE'.
--
-- Tables: heavy_equipment, heavy_equipment_insurances
-- Changes:
--   1. Add company_id NOT NULL to heavy_equipment (backfill from single active company)
--   2. Add company_id NOT NULL to heavy_equipment_insurances (backfill from parent)
--   3. Drop blanket RLS policy on heavy_equipment; add company-scoped policies
--   4. Add subcontractor same-company trigger on heavy_equipment
--   5. Add parent-child consistency trigger on heavy_equipment_insurances
--   6. Enable company-scoped RLS on heavy_equipment_insurances
--
-- Prerequisites:
--   - Batch 2 (subcontractors + vehicles) must be complete
--   - subcontractors.company_id must be NOT NULL
--   - Exactly ONE active company in companies table (for backfill)
-- ============================================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- SAFETY GUARD 1: Batch 2 prerequisite — subcontractors.company_id must exist
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subcontractors'
      AND column_name = 'company_id'
  ) THEN
    RAISE EXCEPTION
      'BLOCKED: subcontractors.company_id does not exist. '
      'Run Phase 2 Batch 2 migration first.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM subcontractors WHERE company_id IS NULL LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'BLOCKED: Some subcontractors rows have NULL company_id. '
      'Batch 2 migration must complete successfully before running Batch 4.';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- SAFETY GUARD 2: Single active company assertion
-- Batch 4 backfills all heavy_equipment rows to the single active company.
-- If multiple companies exist, manual assignment is required — abort.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_company_count INT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'heavy_equipment'
      AND column_name = 'company_id'
  ) THEN
    RAISE NOTICE 'heavy_equipment.company_id already exists — skipping single-company guard.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_company_count FROM companies WHERE is_active = true;

  IF v_company_count = 0 THEN
    RAISE EXCEPTION
      'BLOCKED: No active companies found. Cannot backfill heavy_equipment.company_id.';
  END IF;

  IF v_company_count > 1 THEN
    RAISE EXCEPTION
      'BLOCKED: % active companies found. '
      'Cannot automatically assign heavy_equipment.company_id with multiple tenants. '
      'Manual company_id assignment required before running this migration.',
      v_company_count;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- SAFETY GUARD 3: No orphan heavy_equipment_id in heavy_equipment_insurances
-- Structurally impossible (FK CASCADE), but verified for clarity.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_orphan_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_orphan_count
  FROM heavy_equipment_insurances hei
  LEFT JOIN heavy_equipment he ON he.id = hei.heavy_equipment_id
  WHERE he.id IS NULL;

  IF v_orphan_count > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % heavy_equipment_insurances row(s) have heavy_equipment_id with no matching parent. '
      'Inspect heavy_equipment_insurances.heavy_equipment_id for referential integrity.',
      v_orphan_count;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: heavy_equipment — add company_id
-- ════════════════════════════════════════════════════════════════════════════

-- 1a. Add column nullable first (backfill before enforcing NOT NULL)
ALTER TABLE heavy_equipment
  ADD COLUMN IF NOT EXISTS company_id UUID
    REFERENCES companies(id) ON DELETE RESTRICT;

-- 1b. Backfill: set company_id to the single active company
--     Guard 2 verified exactly one active company exists (if column was absent).
UPDATE heavy_equipment
SET company_id = (SELECT id FROM companies WHERE is_active = true LIMIT 1)
WHERE company_id IS NULL;

-- 1c. Assert zero NULL after backfill
DO $$
DECLARE v_null_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM heavy_equipment WHERE company_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % heavy_equipment row(s) have NULL company_id after backfill.',
      v_null_count;
  END IF;
END $$;

-- 1d. Index for efficient company-scoped queries
CREATE INDEX IF NOT EXISTS heavy_equipment_company_id_idx
  ON heavy_equipment (company_id);

-- 1e. Enforce NOT NULL (backfill verified at 1c)
ALTER TABLE heavy_equipment ALTER COLUMN company_id SET NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: heavy_equipment_insurances — add company_id
-- ════════════════════════════════════════════════════════════════════════════

-- 2a. Add column nullable first
ALTER TABLE heavy_equipment_insurances
  ADD COLUMN IF NOT EXISTS company_id UUID
    REFERENCES companies(id) ON DELETE RESTRICT;

-- 2b. Backfill: derive company_id from parent heavy_equipment
--     heavy_equipment.company_id is NOT NULL (asserted in Step 1c)
UPDATE heavy_equipment_insurances hei
SET company_id = he.company_id
FROM heavy_equipment he
WHERE hei.heavy_equipment_id = he.id
  AND hei.company_id IS NULL;

-- 2c. Assert zero NULL after backfill
DO $$
DECLARE v_null_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM heavy_equipment_insurances WHERE company_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % heavy_equipment_insurances row(s) have NULL company_id after backfill.',
      v_null_count;
  END IF;
END $$;

-- 2d. Assert zero parent-company mismatch
DO $$
DECLARE v_mismatch_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_mismatch_count
  FROM heavy_equipment_insurances hei
  JOIN heavy_equipment he ON he.id = hei.heavy_equipment_id
  WHERE hei.company_id IS DISTINCT FROM he.company_id;

  IF v_mismatch_count > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % heavy_equipment_insurances row(s) have company_id different from parent heavy_equipment.',
      v_mismatch_count;
  END IF;
END $$;

-- 2e. Index for efficient company-scoped queries
CREATE INDEX IF NOT EXISTS heavy_equipment_insurances_company_id_idx
  ON heavy_equipment_insurances (company_id);

-- 2f. Enforce NOT NULL
ALTER TABLE heavy_equipment_insurances ALTER COLUMN company_id SET NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: Drop blanket RLS policy on heavy_equipment
-- Original policy: "Auth users can manage heavy_equipment" — no tenant scope
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Auth users can manage heavy_equipment" ON heavy_equipment;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: Subcontractor same-company trigger
-- Invariant: heavy_equipment.subcontractor_id → subcontractors.company_id = heavy_equipment.company_id
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.enforce_heavy_equipment_subcontractor_same_company()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub_company_id UUID;
BEGIN
  IF NEW.subcontractor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT company_id INTO v_sub_company_id
  FROM public.subcontractors
  WHERE id = NEW.subcontractor_id;

  IF v_sub_company_id IS NULL THEN
    RAISE EXCEPTION
      'INTEGRITY VIOLATION: subcontractor_id % not found in subcontractors.',
      NEW.subcontractor_id;
  END IF;

  IF NEW.company_id IS DISTINCT FROM v_sub_company_id THEN
    RAISE EXCEPTION
      'INTEGRITY VIOLATION: heavy_equipment.company_id (%) must equal subcontractor.company_id (%). '
      'Cross-company subcontractor assignment is not allowed.',
      NEW.company_id, v_sub_company_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS heavy_equipment_subcontractor_same_company ON heavy_equipment;
CREATE TRIGGER heavy_equipment_subcontractor_same_company
  BEFORE INSERT OR UPDATE ON heavy_equipment
  FOR EACH ROW EXECUTE FUNCTION public.enforce_heavy_equipment_subcontractor_same_company();

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: Parent-child consistency trigger
-- Invariant: heavy_equipment_insurances.company_id = heavy_equipment.company_id
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.enforce_heavy_equipment_child_company_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_company_id UUID;
BEGIN
  SELECT company_id INTO v_parent_company_id
  FROM public.heavy_equipment
  WHERE id = NEW.heavy_equipment_id;

  IF v_parent_company_id IS NULL THEN
    RAISE EXCEPTION
      'INTEGRITY VIOLATION: heavy_equipment_id % not found or has NULL company_id in heavy_equipment.',
      NEW.heavy_equipment_id;
  END IF;

  IF NEW.company_id IS DISTINCT FROM v_parent_company_id THEN
    RAISE EXCEPTION
      'INTEGRITY VIOLATION: heavy_equipment_insurances.company_id (%) must equal parent heavy_equipment.company_id (%). '
      'Ensure insurance rows inherit company_id from the parent equipment.',
      NEW.company_id, v_parent_company_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS heavy_equipment_insurances_company_id_check ON heavy_equipment_insurances;
CREATE TRIGGER heavy_equipment_insurances_company_id_check
  BEFORE INSERT OR UPDATE ON heavy_equipment_insurances
  FOR EACH ROW EXECUTE FUNCTION public.enforce_heavy_equipment_child_company_id();

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 6: RLS — heavy_equipment
-- ════════════════════════════════════════════════════════════════════════════

-- 6a. Enable RLS (idempotent)
ALTER TABLE heavy_equipment ENABLE ROW LEVEL SECURITY;

-- 6b. Drop policies before creating (idempotency for re-runs)
DROP POLICY IF EXISTS "heavy_equipment_select_company"  ON heavy_equipment;
DROP POLICY IF EXISTS "heavy_equipment_insert_company"  ON heavy_equipment;
DROP POLICY IF EXISTS "heavy_equipment_update_company"  ON heavy_equipment;
DROP POLICY IF EXISTS "heavy_equipment_delete_company"  ON heavy_equipment;
DROP POLICY IF EXISTS "heavy_equipment_service_all"     ON heavy_equipment;

-- 6c. Company-scoped policies
CREATE POLICY "heavy_equipment_select_company"
  ON heavy_equipment FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "heavy_equipment_insert_company"
  ON heavy_equipment FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "heavy_equipment_update_company"
  ON heavy_equipment FOR UPDATE TO authenticated
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

CREATE POLICY "heavy_equipment_delete_company"
  ON heavy_equipment FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

-- 6d. service_role full access
CREATE POLICY "heavy_equipment_service_all"
  ON heavy_equipment FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 7: RLS — heavy_equipment_insurances
-- ════════════════════════════════════════════════════════════════════════════

-- 7a. Enable RLS
ALTER TABLE heavy_equipment_insurances ENABLE ROW LEVEL SECURITY;

-- 7b. Drop policies before creating (idempotency)
DROP POLICY IF EXISTS "heavy_equipment_insurances_select_company"  ON heavy_equipment_insurances;
DROP POLICY IF EXISTS "heavy_equipment_insurances_insert_company"  ON heavy_equipment_insurances;
DROP POLICY IF EXISTS "heavy_equipment_insurances_update_company"  ON heavy_equipment_insurances;
DROP POLICY IF EXISTS "heavy_equipment_insurances_delete_company"  ON heavy_equipment_insurances;
DROP POLICY IF EXISTS "heavy_equipment_insurances_service_all"     ON heavy_equipment_insurances;

-- 7c. Company-scoped policies
CREATE POLICY "heavy_equipment_insurances_select_company"
  ON heavy_equipment_insurances FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "heavy_equipment_insurances_insert_company"
  ON heavy_equipment_insurances FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "heavy_equipment_insurances_update_company"
  ON heavy_equipment_insurances FOR UPDATE TO authenticated
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

CREATE POLICY "heavy_equipment_insurances_delete_company"
  ON heavy_equipment_insurances FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

-- 7d. service_role full access
CREATE POLICY "heavy_equipment_insurances_service_all"
  ON heavy_equipment_insurances FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 8: Pre-commit assertions
-- RAISE EXCEPTION triggers automatic rollback on any failure.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_he_total       INT;
  v_he_with_cid    INT;
  v_hei_total      INT;
  v_hei_with_cid   INT;
  v_he_nullable    BOOLEAN;
  v_hei_nullable   BOOLEAN;
  v_hei_mismatch   INT;
  v_sub_cross      INT;
BEGIN
  -- Row counts
  SELECT COUNT(*) INTO v_he_total    FROM heavy_equipment;
  SELECT COUNT(*) INTO v_he_with_cid FROM heavy_equipment WHERE company_id IS NOT NULL;
  SELECT COUNT(*) INTO v_hei_total   FROM heavy_equipment_insurances;
  SELECT COUNT(*) INTO v_hei_with_cid FROM heavy_equipment_insurances WHERE company_id IS NOT NULL;

  -- Nullable status
  SELECT (is_nullable = 'YES') INTO v_he_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'heavy_equipment'
    AND column_name = 'company_id';

  SELECT (is_nullable = 'YES') INTO v_hei_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'heavy_equipment_insurances'
    AND column_name = 'company_id';

  -- Parent-company mismatch in insurances
  SELECT COUNT(*) INTO v_hei_mismatch
  FROM heavy_equipment_insurances hei
  JOIN heavy_equipment he ON he.id = hei.heavy_equipment_id
  WHERE hei.company_id IS DISTINCT FROM he.company_id;

  -- Cross-company subcontractor links
  SELECT COUNT(*) INTO v_sub_cross
  FROM heavy_equipment he
  JOIN subcontractors s ON s.id = he.subcontractor_id
  WHERE he.company_id IS DISTINCT FROM s.company_id;

  -- Assert: backfill complete
  IF v_he_with_cid <> v_he_total THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % of % heavy_equipment rows have NULL company_id.',
      (v_he_total - v_he_with_cid), v_he_total;
  END IF;

  IF v_hei_with_cid <> v_hei_total THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % of % heavy_equipment_insurances rows have NULL company_id.',
      (v_hei_total - v_hei_with_cid), v_hei_total;
  END IF;

  -- Assert: NOT NULL enforced
  IF v_he_nullable IS TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: heavy_equipment.company_id is still nullable.';
  END IF;

  IF v_hei_nullable IS TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: heavy_equipment_insurances.company_id is still nullable.';
  END IF;

  -- Assert: zero parent-company mismatches
  IF v_hei_mismatch > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % heavy_equipment_insurances rows have company_id mismatch with parent equipment.',
      v_hei_mismatch;
  END IF;

  -- Assert: zero cross-company subcontractor links
  IF v_sub_cross > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % heavy_equipment rows have subcontractor_id pointing to a different company.',
      v_sub_cross;
  END IF;

  -- Assert: indexes exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'heavy_equipment'
      AND indexname = 'heavy_equipment_company_id_idx'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: heavy_equipment_company_id_idx missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'heavy_equipment_insurances'
      AND indexname = 'heavy_equipment_insurances_company_id_idx'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: heavy_equipment_insurances_company_id_idx missing.';
  END IF;

  -- Assert: triggers exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'heavy_equipment'
      AND t.tgname = 'heavy_equipment_subcontractor_same_company' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: heavy_equipment_subcontractor_same_company trigger missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'heavy_equipment_insurances'
      AND t.tgname = 'heavy_equipment_insurances_company_id_check' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: heavy_equipment_insurances_company_id_check trigger missing.';
  END IF;

  -- Assert: RLS enabled
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.heavy_equipment'::regclass) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: RLS is not enabled on heavy_equipment.';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.heavy_equipment_insurances'::regclass) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: RLS is not enabled on heavy_equipment_insurances.';
  END IF;

  -- Assert: key policies exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'heavy_equipment'
      AND policyname = 'heavy_equipment_select_company'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: heavy_equipment_select_company policy missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'heavy_equipment_insurances'
      AND policyname = 'heavy_equipment_insurances_select_company'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: heavy_equipment_insurances_select_company policy missing.';
  END IF;

  -- Assert: blanket policy is gone
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'heavy_equipment'
      AND policyname = 'Auth users can manage heavy_equipment'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: blanket policy "Auth users can manage heavy_equipment" still exists on heavy_equipment.';
  END IF;

END $$;

-- STEP 8 confirmation row — only reached if all assertions passed.
SELECT
  'ALL ASSERTIONS PASSED'                                                  AS assertion_status,
  (SELECT COUNT(*)::int FROM heavy_equipment WHERE company_id IS NOT NULL) AS he_cid_populated,
  (SELECT COUNT(*)::int FROM heavy_equipment)                              AS he_total,
  (SELECT COUNT(*)::int FROM heavy_equipment_insurances WHERE company_id IS NOT NULL) AS hei_cid_populated,
  (SELECT COUNT(*)::int FROM heavy_equipment_insurances)                   AS hei_total,
  (SELECT COUNT(*)::int FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'heavy_equipment')          AS he_policy_count,
  (SELECT COUNT(*)::int FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'heavy_equipment_insurances') AS hei_policy_count,
  (SELECT relrowsecurity FROM pg_class
   WHERE oid = 'public.heavy_equipment'::regclass)                         AS he_rls_enabled,
  (SELECT relrowsecurity FROM pg_class
   WHERE oid = 'public.heavy_equipment_insurances'::regclass)              AS hei_rls_enabled;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION (run after COMMIT)
-- ════════════════════════════════════════════════════════════════════════════
-- Run: supabase/mt_phase2_batch4_heavy_equipment_preview.sql
-- Expected: migration_state = 'MIGRATION COMPLETE'

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (use only if needed — see docs/multi-tenant/PHASE2_BATCH4_ROLLBACK_HE.md)
-- ════════════════════════════════════════════════════════════════════════════
/*
BEGIN;

DROP TRIGGER IF EXISTS heavy_equipment_subcontractor_same_company ON heavy_equipment;
DROP FUNCTION IF EXISTS public.enforce_heavy_equipment_subcontractor_same_company();

DROP TRIGGER IF EXISTS heavy_equipment_insurances_company_id_check ON heavy_equipment_insurances;
DROP FUNCTION IF EXISTS public.enforce_heavy_equipment_child_company_id();

DROP POLICY IF EXISTS "heavy_equipment_select_company"  ON heavy_equipment;
DROP POLICY IF EXISTS "heavy_equipment_insert_company"  ON heavy_equipment;
DROP POLICY IF EXISTS "heavy_equipment_update_company"  ON heavy_equipment;
DROP POLICY IF EXISTS "heavy_equipment_delete_company"  ON heavy_equipment;
DROP POLICY IF EXISTS "heavy_equipment_service_all"     ON heavy_equipment;
ALTER TABLE heavy_equipment DISABLE ROW LEVEL SECURITY;
ALTER TABLE heavy_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can manage heavy_equipment"
  ON heavy_equipment FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "heavy_equipment_insurances_select_company"  ON heavy_equipment_insurances;
DROP POLICY IF EXISTS "heavy_equipment_insurances_insert_company"  ON heavy_equipment_insurances;
DROP POLICY IF EXISTS "heavy_equipment_insurances_update_company"  ON heavy_equipment_insurances;
DROP POLICY IF EXISTS "heavy_equipment_insurances_delete_company"  ON heavy_equipment_insurances;
DROP POLICY IF EXISTS "heavy_equipment_insurances_service_all"     ON heavy_equipment_insurances;
ALTER TABLE heavy_equipment_insurances DISABLE ROW LEVEL SECURITY;

DROP INDEX IF EXISTS public.heavy_equipment_company_id_idx;
DROP INDEX IF EXISTS public.heavy_equipment_insurances_company_id_idx;

ALTER TABLE heavy_equipment_insurances DROP COLUMN IF EXISTS company_id;
ALTER TABLE heavy_equipment DROP COLUMN IF EXISTS company_id;

COMMIT;
*/
