-- ============================================================================
-- Post-Failure Diagnostic: Phase 2 Batch 4 — Heavy Equipment
-- mt_phase2_batch4_post_failure_check.sql
--
-- READ-ONLY — אין DDL, אין DML.
-- מטרה: לאבחן איזה שלב נכשל אחרי הרצת מיגרציה חלקית.
--
-- ⚠ PARSE-TIME SAFETY:
--   כל שאילתות המפנות ל-company_id נמצאות ב-PL/pgSQL EXECUTE strings.
--
-- Output: שורה אחת מאוחדת ב-_b4_failure_data (גלויה ב-Results tab).
--   גלול ימינה לראות את ה-step grid (step_01..step_11).
-- ============================================================================

DROP TABLE IF EXISTS _b4_failure_data;

CREATE TEMP TABLE _b4_failure_data (
  -- Column state
  he_col_state          text,
  hei_col_state         text,
  -- Row counts
  he_total              bigint,
  hei_total             bigint,
  -- NULL company_id
  he_null_cid           text,
  hei_null_cid          text,
  -- Backfillable (NULL but parent can fill)
  hei_backfillable      text,
  -- Mismatch
  hei_mismatches        text,
  -- Cross-company subcontractor
  he_sub_cross          text,
  -- Orphan heavy_equipment_id
  hei_orphans           bigint,
  -- Index state
  he_cid_index          text,
  hei_cid_index         text,
  -- Trigger state
  sub_trigger_fn_exists boolean,
  sub_trigger_exists    boolean,
  child_trigger_fn_exists boolean,
  child_trigger_exists  boolean,
  -- RLS state
  he_rls_enabled        boolean,
  hei_rls_enabled       boolean,
  he_policy_count       integer,
  hei_policy_count      integer,
  blanket_policy_dropped boolean,
  -- Step-by-step grid (DONE / PARTIAL / TODO)
  step_01_he_col        text,
  step_02_he_not_null   text,
  step_03_he_index      text,
  step_04_hei_col       text,
  step_05_hei_not_null  text,
  step_06_hei_index     text,
  step_07_sub_trigger   text,
  step_08_child_trigger text,
  step_09_blanket_drop  text,
  step_10_he_rls        text,
  step_11_hei_rls       text,
  -- Overall
  overall_status        text,
  next_action           text
);

DO $$
DECLARE
  v_he_col_exists     BOOLEAN := false;
  v_hei_col_exists    BOOLEAN := false;
  v_he_not_null       BOOLEAN := false;
  v_hei_not_null      BOOLEAN := false;
  v_he_total          BIGINT  := 0;
  v_hei_total         BIGINT  := 0;
  v_he_null_cid       BIGINT  := 0;
  v_hei_null_cid      BIGINT  := 0;
  v_hei_backfillable  BIGINT  := 0;
  v_hei_mismatch      BIGINT  := 0;
  v_he_sub_cross      BIGINT  := 0;
  v_hei_orphans       BIGINT  := 0;
  v_he_idx_ok         BOOLEAN := false;
  v_hei_idx_ok        BOOLEAN := false;
  v_sub_fn_exists     BOOLEAN := false;
  v_sub_trig_exists   BOOLEAN := false;
  v_child_fn_exists   BOOLEAN := false;
  v_child_trig_exists BOOLEAN := false;
  v_he_rls_enabled    BOOLEAN := false;
  v_hei_rls_enabled   BOOLEAN := false;
  v_he_policy_count   INTEGER := 0;
  v_hei_policy_count  INTEGER := 0;
  v_blanket_dropped   BOOLEAN := false;
  v_he_col_state      TEXT;
  v_hei_col_state     TEXT;
  v_he_null_text      TEXT;
  v_hei_null_text     TEXT;
  v_hei_back_text     TEXT;
  v_hei_mism_text     TEXT;
  v_he_sub_text       TEXT;
  v_he_idx_text       TEXT;
  v_hei_idx_text      TEXT;
  v_overall_status    TEXT;
  v_next_action       TEXT;
BEGIN

  -- Column existence
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'heavy_equipment'
      AND column_name = 'company_id'
  ) INTO v_he_col_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'heavy_equipment_insurances'
      AND column_name = 'company_id'
  ) INTO v_hei_col_exists;

  -- NOT NULL status + column state text
  IF v_he_col_exists THEN
    SELECT (is_nullable = 'NO') INTO v_he_not_null
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'heavy_equipment'
      AND column_name = 'company_id';
    v_he_col_state := CASE WHEN v_he_not_null THEN 'NOT NULL' ELSE 'NULLABLE' END;
  ELSE
    v_he_col_state := 'ABSENT';
  END IF;

  IF v_hei_col_exists THEN
    SELECT (is_nullable = 'NO') INTO v_hei_not_null
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'heavy_equipment_insurances'
      AND column_name = 'company_id';
    v_hei_col_state := CASE WHEN v_hei_not_null THEN 'NOT NULL' ELSE 'NULLABLE' END;
  ELSE
    v_hei_col_state := 'ABSENT';
  END IF;

  -- Row totals
  SELECT COUNT(*) INTO v_he_total  FROM heavy_equipment;
  SELECT COUNT(*) INTO v_hei_total FROM heavy_equipment_insurances;

  -- Orphan check
  SELECT COUNT(*) INTO v_hei_orphans
  FROM heavy_equipment_insurances hei
  LEFT JOIN heavy_equipment he ON he.id = hei.heavy_equipment_id
  WHERE he.id IS NULL;

  -- company_id-dependent checks — EXECUTE ONLY
  IF v_he_col_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM heavy_equipment WHERE company_id IS NULL'
      INTO v_he_null_cid;
    EXECUTE
      'SELECT COUNT(*) FROM heavy_equipment he '
      'JOIN subcontractors s ON s.id = he.subcontractor_id '
      'WHERE he.company_id IS DISTINCT FROM s.company_id '
      'AND he.subcontractor_id IS NOT NULL'
      INTO v_he_sub_cross;
    v_he_null_text := v_he_null_cid::text;
    v_he_sub_text  := v_he_sub_cross::text;
  ELSE
    v_he_null_text := 'N/A';
    v_he_sub_text  := 'N/A';
  END IF;

  IF v_hei_col_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM heavy_equipment_insurances WHERE company_id IS NULL'
      INTO v_hei_null_cid;
    EXECUTE
      'SELECT COUNT(*) FROM heavy_equipment_insurances hei '
      'JOIN heavy_equipment he ON he.id = hei.heavy_equipment_id '
      'WHERE hei.company_id IS NULL AND he.company_id IS NOT NULL'
      INTO v_hei_backfillable;
    EXECUTE
      'SELECT COUNT(*) FROM heavy_equipment_insurances hei '
      'JOIN heavy_equipment he ON he.id = hei.heavy_equipment_id '
      'WHERE hei.company_id IS DISTINCT FROM he.company_id '
      'AND hei.company_id IS NOT NULL'
      INTO v_hei_mismatch;
    v_hei_null_text := v_hei_null_cid::text;
    v_hei_back_text := v_hei_backfillable::text;
    v_hei_mism_text := v_hei_mismatch::text;
  ELSE
    v_hei_null_text := 'N/A';
    v_hei_back_text := 'N/A';
    v_hei_mism_text := 'N/A';
  END IF;

  -- Index state
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'heavy_equipment'
      AND indexname = 'heavy_equipment_company_id_idx'
  ) INTO v_he_idx_ok;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'heavy_equipment_insurances'
      AND indexname = 'heavy_equipment_insurances_company_id_idx'
  ) INTO v_hei_idx_ok;

  v_he_idx_text  := CASE WHEN v_he_idx_ok  THEN 'EXISTS' ELSE 'MISSING' END;
  v_hei_idx_text := CASE WHEN v_hei_idx_ok THEN 'EXISTS' ELSE 'MISSING' END;

  -- Trigger functions
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'enforce_heavy_equipment_subcontractor_same_company'
  ) INTO v_sub_fn_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'enforce_heavy_equipment_child_company_id'
  ) INTO v_child_fn_exists;

  -- Per-table triggers
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'heavy_equipment'
      AND t.tgname = 'heavy_equipment_subcontractor_same_company'
      AND NOT t.tgisinternal
  ) INTO v_sub_trig_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'heavy_equipment_insurances'
      AND t.tgname = 'heavy_equipment_insurances_company_id_check'
      AND NOT t.tgisinternal
  ) INTO v_child_trig_exists;

  -- RLS + policies
  SELECT relrowsecurity INTO v_he_rls_enabled FROM pg_class
  WHERE oid = 'public.heavy_equipment'::regclass;

  SELECT relrowsecurity INTO v_hei_rls_enabled FROM pg_class
  WHERE oid = 'public.heavy_equipment_insurances'::regclass;

  SELECT COUNT(*) INTO v_he_policy_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'heavy_equipment';

  SELECT COUNT(*) INTO v_hei_policy_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'heavy_equipment_insurances';

  SELECT NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'heavy_equipment'
      AND policyname = 'Auth users can manage heavy_equipment'
  ) INTO v_blanket_dropped;

  -- Overall status
  IF v_he_col_exists AND v_hei_col_exists
    AND v_he_not_null AND v_hei_not_null
    AND COALESCE(v_he_rls_enabled, false)
    AND COALESCE(v_hei_rls_enabled, false)
    AND v_sub_trig_exists AND v_child_trig_exists
    AND v_blanket_dropped
    AND v_he_null_cid = 0 AND v_hei_null_cid = 0
    AND v_hei_mismatch = 0
  THEN
    v_overall_status := 'COMPLETE';
    v_next_action    := 'Run preview SQL to confirm MIGRATION COMPLETE';
  ELSIF NOT v_he_col_exists AND NOT v_hei_col_exists THEN
    v_overall_status := 'NOT STARTED';
    v_next_action    := 'Run the migration SQL from scratch';
  ELSE
    v_overall_status := 'PARTIAL';
    v_next_action    :=
      'Find first TODO step in step_01..step_11. '
      'Migration is idempotent — re-run mt_phase2_batch4_heavy_equipment.sql';
  END IF;

  INSERT INTO _b4_failure_data VALUES (
    v_he_col_state,
    v_hei_col_state,
    v_he_total,
    v_hei_total,
    v_he_null_text,
    v_hei_null_text,
    v_hei_back_text,
    v_hei_mism_text,
    v_he_sub_text,
    v_hei_orphans,
    v_he_idx_text,
    v_hei_idx_text,
    v_sub_fn_exists,
    v_sub_trig_exists,
    v_child_fn_exists,
    v_child_trig_exists,
    v_he_rls_enabled,
    v_hei_rls_enabled,
    v_he_policy_count,
    v_hei_policy_count,
    v_blanket_dropped,
    -- step grid
    CASE WHEN v_he_col_exists  THEN 'DONE' ELSE 'TODO' END,
    CASE WHEN v_he_not_null    THEN 'DONE'
         WHEN v_he_col_exists  THEN 'PARTIAL (nullable)'
         ELSE 'TODO' END,
    CASE WHEN v_he_idx_ok      THEN 'DONE' ELSE 'TODO' END,
    CASE WHEN v_hei_col_exists THEN 'DONE' ELSE 'TODO' END,
    CASE WHEN v_hei_not_null   THEN 'DONE'
         WHEN v_hei_col_exists THEN 'PARTIAL (nullable)'
         ELSE 'TODO' END,
    CASE WHEN v_hei_idx_ok     THEN 'DONE' ELSE 'TODO' END,
    CASE WHEN v_sub_trig_exists   THEN 'DONE' ELSE 'TODO' END,
    CASE WHEN v_child_trig_exists THEN 'DONE' ELSE 'TODO' END,
    CASE WHEN v_blanket_dropped   THEN 'DONE' ELSE 'TODO' END,
    CASE WHEN COALESCE(v_he_rls_enabled, false) AND v_he_policy_count >= 5 AND v_blanket_dropped
           THEN 'DONE'
         WHEN COALESCE(v_he_rls_enabled, false)
           THEN 'PARTIAL (' || v_he_policy_count || ' policies, blanket_dropped=' || v_blanket_dropped || ')'
         ELSE 'TODO' END,
    CASE WHEN COALESCE(v_hei_rls_enabled, false) AND v_hei_policy_count >= 5
           THEN 'DONE'
         WHEN COALESCE(v_hei_rls_enabled, false)
           THEN 'PARTIAL (' || v_hei_policy_count || '/5 policies)'
         ELSE 'TODO' END,
    v_overall_status,
    v_next_action
  );

END $$;

-- Single consolidated result row (scroll right for step-by-step grid).
SELECT * FROM _b4_failure_data;
