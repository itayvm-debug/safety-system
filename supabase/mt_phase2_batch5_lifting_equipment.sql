-- ============================================================================
-- mt_phase2_batch5_lifting_equipment.sql
-- Phase 2 Batch 5 — lifting_equipment tenant isolation
-- ============================================================================
-- Table: lifting_equipment
-- Changes:
--   1. Add company_id NOT NULL (backfill from single active company)
--   2. Drop blanket RLS policy; add 5 company-scoped policies
--   3. Add subcontractor same-company trigger
-- Prerequisites:
--   - Phase 2 Batch 2 complete (subcontractors.company_id NOT NULL)
--   - Exactly ONE active company in companies table (for backfill)
-- ============================================================================
--
-- ROLLBACK (if needed before COMMIT):
--   DROP TRIGGER IF EXISTS lifting_equipment_subcontractor_same_company ON lifting_equipment;
--   DROP FUNCTION IF EXISTS enforce_lifting_equipment_subcontractor_same_company();
--   DROP POLICY IF EXISTS lifting_equipment_select_own_company ON lifting_equipment;
--   DROP POLICY IF EXISTS lifting_equipment_insert_own_company ON lifting_equipment;
--   DROP POLICY IF EXISTS lifting_equipment_update_own_company ON lifting_equipment;
--   DROP POLICY IF EXISTS lifting_equipment_delete_own_company ON lifting_equipment;
--   DROP POLICY IF EXISTS lifting_equipment_service_all ON lifting_equipment;
--   CREATE POLICY "Auth users can manage lifting_equipment"
--     ON lifting_equipment FOR ALL TO authenticated USING (true) WITH CHECK (true);
--   DROP INDEX IF EXISTS lifting_equipment_company_id_idx;
--   ALTER TABLE lifting_equipment DROP COLUMN IF EXISTS company_id;
-- ============================================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- SAFETY GUARD 1: Batch 2 prerequisite — subcontractors.company_id NOT NULL
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
      'BLOCKED: some subcontractors have NULL company_id. '
      'Run Phase 2 Batch 2 migration to completion first.';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- SAFETY GUARD 2: exactly one active company (for safe backfill)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_company_count INT;
BEGIN
  -- Idempotency: skip guard if column already exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lifting_equipment'
      AND column_name = 'company_id'
  ) THEN
    RAISE NOTICE 'company_id already exists on lifting_equipment — skipping company count guard (idempotent re-run).';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_company_count FROM companies WHERE is_active = true;

  IF v_company_count <> 1 THEN
    RAISE EXCEPTION
      'BLOCKED: expected exactly 1 active company for backfill, found %. '
      'Cannot safely auto-assign company_id in a multi-tenant environment.',
      v_company_count;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: lifting_equipment — add company_id, backfill, index, NOT NULL
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE lifting_equipment
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE RESTRICT;

UPDATE lifting_equipment
SET company_id = (SELECT id FROM companies WHERE is_active = true LIMIT 1)
WHERE company_id IS NULL;

DO $$
DECLARE v_null_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM lifting_equipment WHERE company_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION
      'BLOCKED: % lifting_equipment rows still have NULL company_id after backfill.',
      v_null_count;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS lifting_equipment_company_id_idx ON lifting_equipment(company_id);

ALTER TABLE lifting_equipment ALTER COLUMN company_id SET NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: Drop blanket RLS policy
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Auth users can manage lifting_equipment" ON lifting_equipment;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: Subcontractor same-company trigger
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION enforce_lifting_equipment_subcontractor_same_company()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.subcontractor_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM subcontractors
      WHERE id = NEW.subcontractor_id AND company_id = NEW.company_id
    ) THEN
      RAISE EXCEPTION
        'subcontractor (id=%) does not belong to the same company (%) as lifting_equipment',
        NEW.subcontractor_id, NEW.company_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lifting_equipment_subcontractor_same_company ON lifting_equipment;
CREATE TRIGGER lifting_equipment_subcontractor_same_company
  BEFORE INSERT OR UPDATE ON lifting_equipment
  FOR EACH ROW EXECUTE FUNCTION enforce_lifting_equipment_subcontractor_same_company();

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: RLS enable + 5 policies for lifting_equipment
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE lifting_equipment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lifting_equipment_select_own_company ON lifting_equipment;
CREATE POLICY lifting_equipment_select_own_company ON lifting_equipment
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

DROP POLICY IF EXISTS lifting_equipment_insert_own_company ON lifting_equipment;
CREATE POLICY lifting_equipment_insert_own_company ON lifting_equipment
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

DROP POLICY IF EXISTS lifting_equipment_update_own_company ON lifting_equipment;
CREATE POLICY lifting_equipment_update_own_company ON lifting_equipment
  FOR UPDATE TO authenticated
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

DROP POLICY IF EXISTS lifting_equipment_delete_own_company ON lifting_equipment;
CREATE POLICY lifting_equipment_delete_own_company ON lifting_equipment
  FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

DROP POLICY IF EXISTS lifting_equipment_service_all ON lifting_equipment;
CREATE POLICY lifting_equipment_service_all ON lifting_equipment
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: Pre-commit assertions — rollback on any failure
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_null_count    BIGINT;
  v_policy_count  INT;
  v_trigger_count INT;
BEGIN
  -- Assert: no NULL company_id rows
  SELECT COUNT(*) INTO v_null_count FROM lifting_equipment WHERE company_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % lifting_equipment rows have NULL company_id', v_null_count;
  END IF;

  -- Assert: all 5 policies present
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'lifting_equipment'
    AND policyname IN (
      'lifting_equipment_select_own_company',
      'lifting_equipment_insert_own_company',
      'lifting_equipment_update_own_company',
      'lifting_equipment_delete_own_company',
      'lifting_equipment_service_all'
    );
  IF v_policy_count <> 5 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: expected 5 RLS policies on lifting_equipment, found %', v_policy_count;
  END IF;

  -- Assert: blanket policy dropped
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lifting_equipment'
      AND policyname = 'Auth users can manage lifting_equipment'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: blanket policy "Auth users can manage lifting_equipment" still exists';
  END IF;

  -- Assert: subcontractor trigger exists
  SELECT COUNT(*) INTO v_trigger_count
  FROM information_schema.triggers
  WHERE event_object_schema = 'public'
    AND event_object_table = 'lifting_equipment'
    AND trigger_name = 'lifting_equipment_subcontractor_same_company';
  IF v_trigger_count = 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: trigger lifting_equipment_subcontractor_same_company not found';
  END IF;

  RAISE NOTICE 'Phase 2 Batch 5 — all assertions passed. Ready to commit.';
END $$;

SELECT 'Phase 2 Batch 5 — lifting_equipment migration COMPLETE' AS status;

COMMIT;
