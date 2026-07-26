-- ============================================================================
-- Migration: Phase 2 Batch 2 — Subcontractors + Vehicles Tenant Isolation
-- mt_phase2_batch2_subcontractors_vehicles.sql
--
-- אין לבצע SQL על Supabase Production ללא אישור מפורש.
-- Do NOT run SQL. Do NOT commit. Do NOT push. Do NOT deploy.
--
-- Idempotent: every DDL uses IF NOT EXISTS / IF EXISTS / conditional logic.
-- Run preview SQL first, verify migration_state = 'CLEAN PRE-MIGRATION'.
-- Run preview SQL again after this script, verify 'MIGRATION COMPLETE'.
-- ============================================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- SAFETY GUARD: abort if intra-company vehicle_number duplicates exist.
-- These would prevent the composite UNIQUE index from being created.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  dup_count integer;
BEGIN
  -- Only check if company_id already exists (partial migration case)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicles' AND column_name = 'company_id'
  ) THEN
    SELECT COUNT(*) INTO dup_count
    FROM (
      SELECT company_id, vehicle_number
      FROM vehicles
      WHERE company_id IS NOT NULL
      GROUP BY company_id, vehicle_number
      HAVING COUNT(*) > 1
    ) dups;

    IF dup_count > 0 THEN
      RAISE EXCEPTION
        'BLOCKED: % intra-company duplicate vehicle_number(s) found. '
        'Resolve duplicates before running this migration.',
        dup_count;
    END IF;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: Add company_id to subcontractors
-- ════════════════════════════════════════════════════════════════════════════

-- 1a. Add column (nullable first for backfill)
ALTER TABLE subcontractors
  ADD COLUMN IF NOT EXISTS company_id UUID
    REFERENCES companies(id) ON DELETE RESTRICT;

-- 1b. Backfill: assign all existing rows to the default company
--     (the oldest active company — single-tenant assumption pre-migration)
UPDATE subcontractors
SET company_id = (
  SELECT id FROM companies WHERE is_active = true ORDER BY created_at LIMIT 1
)
WHERE company_id IS NULL;

-- 1c. Assert zero NULL before enforcing NOT NULL
DO $$
DECLARE v_null_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM subcontractors WHERE company_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % subcontractor row(s) have NULL company_id after backfill. '
      'Verify that at least one active company exists in the companies table.',
      v_null_count;
  END IF;
END $$;

-- 1d. Index for efficient company-scoped queries (created before NOT NULL)
CREATE INDEX IF NOT EXISTS subcontractors_company_id_idx
  ON subcontractors (company_id);

-- 1e. Enforce NOT NULL (backfill verified at 1c)
ALTER TABLE subcontractors ALTER COLUMN company_id SET NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: Add company_id to vehicles
-- ════════════════════════════════════════════════════════════════════════════

-- 2a. Add column (nullable first for backfill)
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS company_id UUID
    REFERENCES companies(id) ON DELETE RESTRICT;

-- 2b. Backfill all existing rows to the default company
UPDATE vehicles
SET company_id = (
  SELECT id FROM companies WHERE is_active = true ORDER BY created_at LIMIT 1
)
WHERE company_id IS NULL;

-- 2c. Assert zero NULL before enforcing NOT NULL
DO $$
DECLARE v_null_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM vehicles WHERE company_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % vehicle row(s) have NULL company_id after backfill. '
      'Verify that at least one active company exists in the companies table.',
      v_null_count;
  END IF;
END $$;

-- 2d. Index for efficient company-scoped queries (created before NOT NULL)
CREATE INDEX IF NOT EXISTS vehicles_company_id_idx
  ON vehicles (company_id);

-- 2e. Enforce NOT NULL (backfill verified at 2c)
ALTER TABLE vehicles ALTER COLUMN company_id SET NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3A: Vehicles — replace global vehicle_number unique with per-company
-- ════════════════════════════════════════════════════════════════════════════
-- vehicles_vehicle_number_unique was created in migration_phase1.sql as:
--   ALTER TABLE vehicles ADD CONSTRAINT vehicles_vehicle_number_unique UNIQUE (vehicle_number);
-- That is a NAMED UNIQUE CONSTRAINT, not a standalone index.
-- Its backing index has the same name but is constraint-owned:
--   DROP INDEX fails with 2BP01; only ALTER TABLE ... DROP CONSTRAINT is valid.
-- This block detects the actual object type and issues the correct DDL.
-- Handles all four states idempotently:
--   (1) UNIQUE CONSTRAINT exists     → ALTER TABLE DROP CONSTRAINT
--   (2) Standalone UNIQUE INDEX only → DROP INDEX
--   (3) Neither exists               → continue safely (already removed)
--   (4) Unexpected leftover found    → RAISE EXCEPTION with description

DO $$
DECLARE
  v_constraint_exists  BOOLEAN;
  v_standalone_exists  BOOLEAN;
  v_leftover_count     INT;
BEGIN
  -- State 1: Named UNIQUE CONSTRAINT (expected — from migration_phase1.sql)
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class     t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'vehicles'
      AND c.conname = 'vehicles_vehicle_number_unique'
      AND c.contype = 'u'
  ) INTO v_constraint_exists;

  -- State 2: Standalone unique index (not backed by a constraint)
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes pi
    JOIN pg_class    ic ON ic.relname = pi.indexname
                       AND ic.relkind = 'i'
    JOIN pg_namespace n  ON n.oid     = ic.relnamespace
                       AND n.nspname  = 'public'
    WHERE pi.schemaname = 'public'
      AND pi.tablename  = 'vehicles'
      AND pi.indexname  = 'vehicles_vehicle_number_unique'
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint c2
        WHERE c2.conindid = ic.oid
      )
  ) INTO v_standalone_exists;

  IF v_constraint_exists THEN
    -- Named constraint: DROP CONSTRAINT also removes the constraint-owned backing index
    ALTER TABLE public.vehicles DROP CONSTRAINT vehicles_vehicle_number_unique;
  ELSIF v_standalone_exists THEN
    -- Standalone index: DROP INDEX is valid
    DROP INDEX public.vehicles_vehicle_number_unique;
  END IF;
  -- State 3: Neither — already removed on a prior run; continue safely

  -- State 4: Safety check — verify no other global (single-column) uniqueness remains
  SELECT COUNT(*) INTO v_leftover_count
  FROM (
    -- Leftover unique constraints on a single column that includes vehicle_number
    SELECT c.conname AS obj_name
    FROM pg_constraint c
    JOIN pg_class     t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname            = 'public'
      AND t.relname            = 'vehicles'
      AND c.contype            = 'u'
      AND c.conname           != 'vehicles_company_vehicle_number_unique'
      AND array_length(c.conkey, 1) = 1
      AND EXISTS (
        SELECT 1 FROM pg_attribute pa
        WHERE pa.attrelid = t.oid
          AND pa.attnum   = c.conkey[1]
          AND pa.attname  = 'vehicle_number'
      )
    UNION ALL
    -- Leftover standalone unique indexes whose definition mentions vehicle_number but not company_id
    SELECT pi.indexname
    FROM pg_indexes pi
    JOIN pg_class    ic ON ic.relname = pi.indexname
                       AND ic.relkind = 'i'
    JOIN pg_namespace n  ON n.oid     = ic.relnamespace
                       AND n.nspname  = 'public'
    WHERE pi.schemaname  = 'public'
      AND pi.tablename   = 'vehicles'
      AND pi.indexname  != 'vehicles_company_vehicle_number_unique'
      AND pi.indexdef    LIKE 'CREATE UNIQUE INDEX%'
      AND pi.indexdef    LIKE '%vehicle_number%'
      AND pi.indexdef    NOT LIKE '%company_id%'
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint c3
        WHERE c3.conindid = ic.oid
      )
  ) leftover;

  IF v_leftover_count > 0 THEN
    RAISE EXCEPTION
      'UNEXPECTED: % global uniqueness object(s) on vehicles.vehicle_number still present '
      'after removal step. Inspect pg_constraint and pg_indexes before continuing.',
      v_leftover_count;
  END IF;
END $$;

-- 3b. Create composite unique: same plate number allowed across different companies.
--     UNIQUE INDEX (not UNIQUE CONSTRAINT) for IF NOT EXISTS idempotency.
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_company_vehicle_number_unique
  ON vehicles (company_id, vehicle_number);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3B: Subcontractors — uniqueness audit
-- ════════════════════════════════════════════════════════════════════════════
-- migration_subcontractors.sql created NO unique constraint on subcontractors.name
-- and no other historical migration has added one.
-- No composite unique is created here:
--   (a) no global unique exists to replace
--   (b) the application does not enforce unique subcontractor names per company
-- This block verifies that expectation and aborts on any unexpected uniqueness.

DO $$
DECLARE v_unexpected_count INT;
BEGIN
  SELECT COUNT(*) INTO v_unexpected_count
  FROM (
    -- Unexpected UNIQUE constraints (contype = 'u'; excludes primary key contype = 'p')
    SELECT c.conname AS obj_name
    FROM pg_constraint c
    JOIN pg_class     t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'subcontractors'
      AND c.contype = 'u'
    UNION ALL
    -- Unexpected standalone unique indexes (excludes pk-backing index via NOT EXISTS)
    SELECT pi.indexname
    FROM pg_indexes pi
    JOIN pg_class    ic ON ic.relname = pi.indexname
                       AND ic.relkind = 'i'
    JOIN pg_namespace n  ON n.oid     = ic.relnamespace
                       AND n.nspname  = 'public'
    WHERE pi.schemaname = 'public'
      AND pi.tablename  = 'subcontractors'
      AND pi.indexdef   LIKE 'CREATE UNIQUE INDEX%'
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint c2
        WHERE c2.conindid = ic.oid
      )
  ) unexpected_unique;

  IF v_unexpected_count > 0 THEN
    RAISE EXCEPTION
      'UNEXPECTED: % unique constraint(s)/index(es) found on subcontractors beyond the primary key. '
      'No global uniqueness on subcontractors was created in any historical migration. '
      'Inspect pg_constraint and pg_indexes before continuing.',
      v_unexpected_count;
  END IF;
  -- Confirmed: no unexpected unique objects. No composite unique is created for subcontractors.
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: RLS — subcontractors
-- Replace blanket "authenticated = see all" with company-scoped policies.
-- service_role bypasses RLS (all API routes use service_role).
-- These policies are defense-in-depth for direct JWT access.
-- ════════════════════════════════════════════════════════════════════════════

-- 4a. Drop old blanket policies
DROP POLICY IF EXISTS "Authenticated users can read subcontractors"   ON subcontractors;
DROP POLICY IF EXISTS "Authenticated users can insert subcontractors" ON subcontractors;
DROP POLICY IF EXISTS "Authenticated users can update subcontractors" ON subcontractors;
DROP POLICY IF EXISTS "Authenticated users can delete subcontractors" ON subcontractors;

-- 4b. Drop new policies before creating (idempotency — handles partial re-run)
DROP POLICY IF EXISTS "subcontractors_select_company"  ON subcontractors;
DROP POLICY IF EXISTS "subcontractors_insert_company"  ON subcontractors;
DROP POLICY IF EXISTS "subcontractors_update_company"  ON subcontractors;
DROP POLICY IF EXISTS "subcontractors_delete_company"  ON subcontractors;
DROP POLICY IF EXISTS "subcontractors_service_all"     ON subcontractors;

-- 4c. New company-scoped policies (service_role bypass: implicit for service role)
CREATE POLICY "subcontractors_select_company"
  ON subcontractors FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "subcontractors_insert_company"
  ON subcontractors FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "subcontractors_update_company"
  ON subcontractors FOR UPDATE TO authenticated
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

CREATE POLICY "subcontractors_delete_company"
  ON subcontractors FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

-- 4d. service_role full access (explicit, redundant but clear)
CREATE POLICY "subcontractors_service_all"
  ON subcontractors FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: RLS — vehicles
-- ════════════════════════════════════════════════════════════════════════════

-- 5a. Drop old blanket policies
DROP POLICY IF EXISTS "vehicles_authenticated" ON vehicles;

-- 5b. Drop new policies before creating (idempotency — handles partial re-run)
DROP POLICY IF EXISTS "vehicles_select_company"  ON vehicles;
DROP POLICY IF EXISTS "vehicles_insert_company"  ON vehicles;
DROP POLICY IF EXISTS "vehicles_update_company"  ON vehicles;
DROP POLICY IF EXISTS "vehicles_delete_company"  ON vehicles;
DROP POLICY IF EXISTS "vehicles_service_all"     ON vehicles;

-- 5c. New company-scoped policies
CREATE POLICY "vehicles_select_company"
  ON vehicles FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "vehicles_insert_company"
  ON vehicles FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "vehicles_update_company"
  ON vehicles FOR UPDATE TO authenticated
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

CREATE POLICY "vehicles_delete_company"
  ON vehicles FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

-- 5d. service_role full access
CREATE POLICY "vehicles_service_all"
  ON vehicles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 6: Pre-commit assertions
-- Verify all migration steps completed correctly.
-- RAISE EXCEPTION triggers automatic rollback on any failure.
-- By this point columns exist (added in STEPs 1–2), so static SQL is safe.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_sub_total    INT;
  v_sub_with_cid INT;
  v_veh_total    INT;
  v_veh_with_cid INT;
  v_sub_nullable BOOLEAN;
  v_veh_nullable BOOLEAN;
BEGIN
  -- Backfill completeness
  SELECT count(*) INTO v_sub_total    FROM subcontractors;
  SELECT count(*) INTO v_sub_with_cid FROM subcontractors WHERE company_id IS NOT NULL;

  SELECT count(*) INTO v_veh_total    FROM vehicles;
  SELECT count(*) INTO v_veh_with_cid FROM vehicles WHERE company_id IS NOT NULL;

  -- Nullable status
  SELECT (is_nullable = 'YES') INTO v_sub_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'subcontractors' AND column_name = 'company_id';

  SELECT (is_nullable = 'YES') INTO v_veh_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'vehicles' AND column_name = 'company_id';

  -- Assert: backfill complete
  IF v_sub_with_cid <> v_sub_total THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % of % subcontractors have NULL company_id after backfill.',
      (v_sub_total - v_sub_with_cid), v_sub_total;
  END IF;

  IF v_veh_with_cid <> v_veh_total THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % of % vehicles have NULL company_id after backfill.',
      (v_veh_total - v_veh_with_cid), v_veh_total;
  END IF;

  -- Assert: NOT NULL enforced
  IF v_sub_nullable IS TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: subcontractors.company_id is still nullable.';
  END IF;

  IF v_veh_nullable IS TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: vehicles.company_id is still nullable.';
  END IF;

  -- Assert: composite unique exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'vehicles'
      AND indexname = 'vehicles_company_vehicle_number_unique'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: vehicles_company_vehicle_number_unique index missing.';
  END IF;

  -- Assert: old global UNIQUE CONSTRAINT is gone
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class     t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'vehicles'
      AND c.conname = 'vehicles_vehicle_number_unique'
      AND c.contype = 'u'
  ) THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: UNIQUE CONSTRAINT vehicles_vehicle_number_unique was not dropped. '
      'Use ALTER TABLE public.vehicles DROP CONSTRAINT vehicles_vehicle_number_unique.';
  END IF;

  -- Assert: old global unique index is gone (constraint removal also drops the backing index)
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'vehicles'
      AND indexname = 'vehicles_vehicle_number_unique'
  ) THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: vehicles_vehicle_number_unique index still present after constraint removal.';
  END IF;

  -- Assert: new policies exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subcontractors'
      AND policyname = 'subcontractors_select_company'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: subcontractors_select_company policy missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vehicles'
      AND policyname = 'vehicles_select_company'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: vehicles_select_company policy missing.';
  END IF;

  -- Assert: old blanket policies are gone
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subcontractors'
      AND policyname = 'Authenticated users can read subcontractors'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: old subcontractors blanket read policy was not dropped.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vehicles'
      AND policyname = 'vehicles_authenticated'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: old vehicles_authenticated policy was not dropped.';
  END IF;

END $$;

-- STEP 6 confirmation row — only reached if all assertions passed.
-- References company_id directly; safe because columns were added in STEPs 1–2.
SELECT
  'ALL ASSERTIONS PASSED'                                                 AS assertion_status,
  (SELECT count(*) FROM subcontractors WHERE company_id IS NOT NULL)::int AS sub_cid_populated,
  (SELECT count(*) FROM subcontractors)::int                              AS sub_total,
  (SELECT count(*) FROM vehicles WHERE company_id IS NOT NULL)::int       AS veh_cid_populated,
  (SELECT count(*) FROM vehicles)::int                                    AS veh_total,
  (SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'vehicles'
      AND indexname = 'vehicles_company_vehicle_number_unique'
  ))::boolean                                                             AS composite_unique_exists,
  (SELECT
    NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class     t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'vehicles'
        AND c.conname = 'vehicles_vehicle_number_unique'
        AND c.contype = 'u'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'vehicles'
        AND indexname = 'vehicles_vehicle_number_unique'
    )
  )::boolean                                                              AS global_unique_dropped,
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'subcontractors')::int    AS sub_policy_count,
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'vehicles')::int          AS veh_policy_count;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION (run after COMMIT)
-- ════════════════════════════════════════════════════════════════════════════
-- Run: supabase/mt_phase2_batch2_subcontractors_vehicles_preview.sql
-- Expected: migration_state = 'MIGRATION COMPLETE'

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (use only if needed — see docs/multi-tenant/PHASE2_BATCH2_ROLLBACK_HE.md)
-- ════════════════════════════════════════════════════════════════════════════
/*
BEGIN;

DROP POLICY IF EXISTS "subcontractors_select_company"  ON subcontractors;
DROP POLICY IF EXISTS "subcontractors_insert_company"  ON subcontractors;
DROP POLICY IF EXISTS "subcontractors_update_company"  ON subcontractors;
DROP POLICY IF EXISTS "subcontractors_delete_company"  ON subcontractors;
DROP POLICY IF EXISTS "subcontractors_service_all"     ON subcontractors;
CREATE POLICY "Authenticated users can read subcontractors"   ON subcontractors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert subcontractors" ON subcontractors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update subcontractors" ON subcontractors FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete subcontractors" ON subcontractors FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "vehicles_select_company"  ON vehicles;
DROP POLICY IF EXISTS "vehicles_insert_company"  ON vehicles;
DROP POLICY IF EXISTS "vehicles_update_company"  ON vehicles;
DROP POLICY IF EXISTS "vehicles_delete_company"  ON vehicles;
DROP POLICY IF EXISTS "vehicles_service_all"     ON vehicles;
CREATE POLICY "vehicles_authenticated" ON vehicles FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP INDEX IF EXISTS vehicles_company_vehicle_number_unique;
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_vehicle_number_unique ON vehicles (vehicle_number);

ALTER TABLE subcontractors ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE vehicles       ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE subcontractors DROP CONSTRAINT IF EXISTS subcontractors_company_id_fkey;
ALTER TABLE vehicles       DROP CONSTRAINT IF EXISTS vehicles_company_id_fkey;
ALTER TABLE subcontractors DROP COLUMN IF EXISTS company_id;
ALTER TABLE vehicles       DROP COLUMN IF EXISTS company_id;

COMMIT;
*/
