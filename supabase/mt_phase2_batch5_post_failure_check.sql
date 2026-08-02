-- ============================================================================
-- mt_phase2_batch5_post_failure_check.sql
-- Phase 2 Batch 5 — post-failure diagnostic for lifting_equipment
--
-- Run ONLY if the migration failed or was rolled back.
-- Identifies exactly which steps completed and which need attention.
-- ============================================================================

DROP TABLE IF EXISTS _b5_failure_data;
CREATE TEMP TABLE _b5_failure_data (
  overall_status            TEXT,
  -- Column / schema state
  step_01_column_exists     BOOLEAN,
  step_02_column_notnull    BOOLEAN,
  step_03_null_rows         BIGINT,
  step_04_index_exists      BOOLEAN,
  -- Policy state
  step_05_blanket_dropped   BOOLEAN,
  step_06_select_policy     BOOLEAN,
  step_07_insert_policy     BOOLEAN,
  step_08_update_policy     BOOLEAN,
  step_09_delete_policy     BOOLEAN,
  step_10_service_policy    BOOLEAN,
  -- Trigger state
  step_11_sub_trigger       BOOLEAN,
  step_12_sub_fn_exists     BOOLEAN,
  -- Data integrity
  sub_mismatch_count        BIGINT,
  -- Prerequisite
  batch2_prerequisite_ok    BOOLEAN,
  -- Stats
  active_company_count      BIGINT,
  total_le_rows             BIGINT
);

DO $$
DECLARE
  v_col_exists        BOOLEAN;
  v_notnull           BOOLEAN;
  v_null_rows         BIGINT;
  v_idx_exists        BOOLEAN;
  v_blanket_dropped   BOOLEAN;
  v_sel_policy        BOOLEAN;
  v_ins_policy        BOOLEAN;
  v_upd_policy        BOOLEAN;
  v_del_policy        BOOLEAN;
  v_svc_policy        BOOLEAN;
  v_sub_trigger       BOOLEAN;
  v_sub_fn            BOOLEAN;
  v_sub_mismatch      BIGINT;
  v_batch2_ok         BOOLEAN;
  v_active_cos        BIGINT;
  v_total_rows        BIGINT;
  v_status            TEXT;
BEGIN
  -- Column existence
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lifting_equipment'
      AND column_name = 'company_id'
  ) INTO v_col_exists;

  -- NOT NULL
  IF v_col_exists THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lifting_equipment'
        AND column_name = 'company_id' AND is_nullable = 'NO'
    ) INTO v_notnull;
    EXECUTE 'SELECT COUNT(*) FROM lifting_equipment WHERE company_id IS NULL' INTO v_null_rows;
    EXECUTE 'SELECT COUNT(*) FROM lifting_equipment le JOIN subcontractors s ON s.id = le.subcontractor_id WHERE le.company_id <> s.company_id' INTO v_sub_mismatch;
  ELSE
    v_notnull      := false;
    v_null_rows    := -1;
    v_sub_mismatch := -1;
  END IF;

  -- Index
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'lifting_equipment'
      AND indexname = 'lifting_equipment_company_id_idx'
  ) INTO v_idx_exists;

  -- Blanket policy
  SELECT NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lifting_equipment'
      AND policyname = 'Auth users can manage lifting_equipment'
  ) INTO v_blanket_dropped;

  -- Tenant policies
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lifting_equipment' AND policyname='lifting_equipment_select_own_company') INTO v_sel_policy;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lifting_equipment' AND policyname='lifting_equipment_insert_own_company') INTO v_ins_policy;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lifting_equipment' AND policyname='lifting_equipment_update_own_company') INTO v_upd_policy;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lifting_equipment' AND policyname='lifting_equipment_delete_own_company') INTO v_del_policy;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lifting_equipment' AND policyname='lifting_equipment_service_all') INTO v_svc_policy;

  -- Triggers and functions
  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public' AND event_object_table = 'lifting_equipment'
      AND trigger_name = 'lifting_equipment_subcontractor_same_company'
  ) INTO v_sub_trigger;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public'
      AND routine_name = 'enforce_lifting_equipment_subcontractor_same_company'
  ) INTO v_sub_fn;

  -- Batch 2 prerequisite
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subcontractors'
      AND column_name = 'company_id' AND is_nullable = 'NO'
  ) INTO v_batch2_ok;

  -- Stats
  SELECT COUNT(*) INTO v_active_cos FROM companies WHERE is_active = true;
  SELECT COUNT(*) INTO v_total_rows FROM lifting_equipment;

  -- Overall status
  IF v_col_exists AND v_notnull AND (v_null_rows = 0)
     AND v_blanket_dropped AND v_sel_policy AND v_ins_policy
     AND v_upd_policy AND v_del_policy AND v_svc_policy
     AND v_sub_trigger AND v_sub_fn
  THEN
    v_status := 'COMPLETE';
  ELSIF NOT v_col_exists AND NOT v_sub_trigger AND NOT v_sel_policy THEN
    v_status := 'NOT STARTED';
  ELSE
    v_status := 'PARTIAL — see individual step columns for details';
  END IF;

  INSERT INTO _b5_failure_data VALUES (
    v_status,
    v_col_exists, v_notnull, v_null_rows, v_idx_exists,
    v_blanket_dropped, v_sel_policy, v_ins_policy, v_upd_policy, v_del_policy, v_svc_policy,
    v_sub_trigger, v_sub_fn,
    v_sub_mismatch,
    v_batch2_ok,
    v_active_cos, v_total_rows
  );
END $$;

SELECT * FROM _b5_failure_data;
