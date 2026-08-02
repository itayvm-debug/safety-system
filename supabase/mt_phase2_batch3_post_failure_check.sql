-- ============================================================================
-- Post-Failure Diagnostic: Phase 2 Batch 3 — Vehicle Children
-- mt_phase2_batch3_post_failure_check.sql
--
-- READ-ONLY -- אין DDL, אין DML.
-- מטרה: לאבחן איזה שלב נכשל אחרי הרצת מיגרציה חלקית.
--
-- ⚠ PARSE-TIME FIX (2026-07-30):
--   Same root cause as preview.sql: CASE guards in plain SQL do NOT prevent
--   ERROR 42703. All vehicle_licenses.company_id / vehicle_insurances.company_id
--   references moved into PL/pgSQL EXECUTE strings (parsed at RUNTIME).
--
-- Output: one consolidated row in _b3_failure_data (visible in Results tab).
--   Scroll right to see all columns including step-by-step grid.
-- ============================================================================

DROP TABLE IF EXISTS _b3_failure_data;

CREATE TEMP TABLE _b3_failure_data (
  -- Column state
  lic_col_state         text,
  ins_col_state         text,
  -- Row counts
  lic_total             bigint,
  ins_total             bigint,
  -- NULL company_id (backfill gap)
  lic_null_cid          text,
  ins_null_cid          text,
  -- Backfillable: child.cid IS NULL but parent vehicle has cid (can be fixed by re-running migration)
  lic_backfillable      text,
  ins_backfillable      text,
  -- Mismatch: child.cid IS NOT NULL but != parent vehicle.cid (data integrity issue)
  lic_mismatches        text,
  ins_mismatches        text,
  -- Orphan: child.vehicle_id not in vehicles (FK should prevent this)
  lic_orphans           bigint,
  ins_orphans           bigint,
  -- Index state
  lic_cid_index         text,
  ins_cid_index         text,
  -- Trigger state
  trigger_fn_exists     boolean,
  lic_trigger_exists    boolean,
  ins_trigger_exists    boolean,
  -- RLS state
  lic_rls_enabled       boolean,
  ins_rls_enabled       boolean,
  lic_policy_count      integer,
  ins_policy_count      integer,
  -- Step-by-step grid (DONE / PARTIAL / TODO)
  step_01_lic_col       text,
  step_02_lic_not_null  text,
  step_03_lic_index     text,
  step_04_ins_col       text,
  step_05_ins_not_null  text,
  step_06_ins_index     text,
  step_07_trigger_fn    text,
  step_08_lic_trigger   text,
  step_09_ins_trigger   text,
  step_10_lic_rls       text,
  step_11_ins_rls       text,
  -- Overall
  overall_status        text,
  next_action           text
);

DO $$
DECLARE
  v_lic_col_exists    BOOLEAN := false;
  v_ins_col_exists    BOOLEAN := false;
  v_lic_not_null      BOOLEAN := false;
  v_ins_not_null      BOOLEAN := false;
  v_lic_total         BIGINT  := 0;
  v_ins_total         BIGINT  := 0;
  v_lic_null_cid      BIGINT  := 0;
  v_ins_null_cid      BIGINT  := 0;
  v_lic_backfillable  BIGINT  := 0;
  v_ins_backfillable  BIGINT  := 0;
  v_lic_mismatch      BIGINT  := 0;
  v_ins_mismatch      BIGINT  := 0;
  v_lic_orphans       BIGINT  := 0;
  v_ins_orphans       BIGINT  := 0;
  v_lic_idx_ok        BOOLEAN := false;
  v_ins_idx_ok        BOOLEAN := false;
  v_trigger_fn_exists BOOLEAN := false;
  v_lic_trig_exists   BOOLEAN := false;
  v_ins_trig_exists   BOOLEAN := false;
  v_lic_rls_enabled   BOOLEAN := false;
  v_ins_rls_enabled   BOOLEAN := false;
  v_lic_policy_count  INTEGER := 0;
  v_ins_policy_count  INTEGER := 0;
  v_lic_col_state     TEXT;
  v_ins_col_state     TEXT;
  v_lic_null_text     TEXT;
  v_ins_null_text     TEXT;
  v_lic_back_text     TEXT;
  v_ins_back_text     TEXT;
  v_lic_mism_text     TEXT;
  v_ins_mism_text     TEXT;
  v_lic_idx_text      TEXT;
  v_ins_idx_text      TEXT;
  v_overall_status    TEXT;
  v_next_action       TEXT;
BEGIN

  -- Column existence
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicle_licenses'
      AND column_name = 'company_id'
  ) INTO v_lic_col_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicle_insurances'
      AND column_name = 'company_id'
  ) INTO v_ins_col_exists;

  -- NOT NULL status + column state text
  IF v_lic_col_exists THEN
    SELECT (is_nullable = 'NO') INTO v_lic_not_null
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicle_licenses'
      AND column_name = 'company_id';
    v_lic_col_state := CASE WHEN v_lic_not_null THEN 'NOT NULL' ELSE 'NULLABLE' END;
  ELSE
    v_lic_col_state := 'ABSENT';
  END IF;

  IF v_ins_col_exists THEN
    SELECT (is_nullable = 'NO') INTO v_ins_not_null
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicle_insurances'
      AND column_name = 'company_id';
    v_ins_col_state := CASE WHEN v_ins_not_null THEN 'NOT NULL' ELSE 'NULLABLE' END;
  ELSE
    v_ins_col_state := 'ABSENT';
  END IF;

  -- Row totals
  SELECT COUNT(*) INTO v_lic_total FROM vehicle_licenses;
  SELECT COUNT(*) INTO v_ins_total FROM vehicle_insurances;

  -- Orphan checks
  SELECT COUNT(*) INTO v_lic_orphans
  FROM vehicle_licenses vl
  LEFT JOIN vehicles v ON v.id = vl.vehicle_id
  WHERE v.id IS NULL;

  SELECT COUNT(*) INTO v_ins_orphans
  FROM vehicle_insurances vi
  LEFT JOIN vehicles v ON v.id = vi.vehicle_id
  WHERE v.id IS NULL;

  -- company_id-dependent checks -- EXECUTE ONLY
  -- Plain SQL CASE guards do NOT protect against parse-time 42703 errors.
  IF v_lic_col_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM vehicle_licenses WHERE company_id IS NULL'
      INTO v_lic_null_cid;
    EXECUTE
      'SELECT COUNT(*) FROM vehicle_licenses vl '
      'JOIN vehicles v ON v.id = vl.vehicle_id '
      'WHERE vl.company_id IS NULL AND v.company_id IS NOT NULL'
      INTO v_lic_backfillable;
    EXECUTE
      'SELECT COUNT(*) FROM vehicle_licenses vl '
      'JOIN vehicles v ON v.id = vl.vehicle_id '
      'WHERE vl.company_id IS DISTINCT FROM v.company_id '
      'AND vl.company_id IS NOT NULL'
      INTO v_lic_mismatch;
    v_lic_null_text := v_lic_null_cid::text;
    v_lic_back_text := v_lic_backfillable::text;
    v_lic_mism_text := v_lic_mismatch::text;
  ELSE
    v_lic_null_text := 'N/A';
    v_lic_back_text := 'N/A';
    v_lic_mism_text := 'N/A';
  END IF;

  IF v_ins_col_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM vehicle_insurances WHERE company_id IS NULL'
      INTO v_ins_null_cid;
    EXECUTE
      'SELECT COUNT(*) FROM vehicle_insurances vi '
      'JOIN vehicles v ON v.id = vi.vehicle_id '
      'WHERE vi.company_id IS NULL AND v.company_id IS NOT NULL'
      INTO v_ins_backfillable;
    EXECUTE
      'SELECT COUNT(*) FROM vehicle_insurances vi '
      'JOIN vehicles v ON v.id = vi.vehicle_id '
      'WHERE vi.company_id IS DISTINCT FROM v.company_id '
      'AND vi.company_id IS NOT NULL'
      INTO v_ins_mismatch;
    v_ins_null_text := v_ins_null_cid::text;
    v_ins_back_text := v_ins_backfillable::text;
    v_ins_mism_text := v_ins_mismatch::text;
  ELSE
    v_ins_null_text := 'N/A';
    v_ins_back_text := 'N/A';
    v_ins_mism_text := 'N/A';
  END IF;

  -- Index state
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'vehicle_licenses'
      AND indexname = 'vehicle_licenses_company_id_idx'
  ) INTO v_lic_idx_ok;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'vehicle_insurances'
      AND indexname = 'vehicle_insurances_company_id_idx'
  ) INTO v_ins_idx_ok;

  v_lic_idx_text := CASE WHEN v_lic_idx_ok THEN 'EXISTS' ELSE 'MISSING' END;
  v_ins_idx_text := CASE WHEN v_ins_idx_ok THEN 'EXISTS' ELSE 'MISSING' END;

  -- Trigger function
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'enforce_vehicle_child_company_id'
  ) INTO v_trigger_fn_exists;

  -- Per-table triggers
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'vehicle_licenses'
      AND t.tgname = 'vehicle_licenses_company_id_check'
      AND NOT t.tgisinternal
  ) INTO v_lic_trig_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'vehicle_insurances'
      AND t.tgname = 'vehicle_insurances_company_id_check'
      AND NOT t.tgisinternal
  ) INTO v_ins_trig_exists;

  -- RLS + policies
  SELECT relrowsecurity INTO v_lic_rls_enabled FROM pg_class
  WHERE oid = 'public.vehicle_licenses'::regclass;

  SELECT relrowsecurity INTO v_ins_rls_enabled FROM pg_class
  WHERE oid = 'public.vehicle_insurances'::regclass;

  SELECT COUNT(*) INTO v_lic_policy_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'vehicle_licenses';

  SELECT COUNT(*) INTO v_ins_policy_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'vehicle_insurances';

  -- Overall status
  IF v_lic_col_exists AND v_ins_col_exists
    AND v_lic_not_null AND v_ins_not_null
    AND COALESCE(v_lic_rls_enabled, false)
    AND COALESCE(v_ins_rls_enabled, false)
    AND v_lic_trig_exists AND v_ins_trig_exists
    AND v_lic_null_cid = 0 AND v_ins_null_cid = 0
    AND v_lic_mismatch = 0 AND v_ins_mismatch = 0
  THEN
    v_overall_status := 'COMPLETE';
    v_next_action    := 'Run preview SQL to confirm MIGRATION COMPLETE';
  ELSIF NOT v_lic_col_exists AND NOT v_ins_col_exists THEN
    v_overall_status := 'NOT STARTED';
    v_next_action    := 'Run the migration SQL from scratch';
  ELSE
    v_overall_status := 'PARTIAL';
    v_next_action    :=
      'Find first TODO step in step_01..step_11. '
      'Migration is idempotent -- re-run mt_phase2_batch3_vehicle_children.sql';
  END IF;

  -- Insert diagnostic row
  INSERT INTO _b3_failure_data VALUES (
    v_lic_col_state,
    v_ins_col_state,
    v_lic_total,
    v_ins_total,
    v_lic_null_text,
    v_ins_null_text,
    v_lic_back_text,
    v_ins_back_text,
    v_lic_mism_text,
    v_ins_mism_text,
    v_lic_orphans,
    v_ins_orphans,
    v_lic_idx_text,
    v_ins_idx_text,
    v_trigger_fn_exists,
    v_lic_trig_exists,
    v_ins_trig_exists,
    v_lic_rls_enabled,
    v_ins_rls_enabled,
    v_lic_policy_count,
    v_ins_policy_count,
    -- step grid
    CASE WHEN v_lic_col_exists THEN 'DONE' ELSE 'TODO' END,
    CASE WHEN v_lic_not_null   THEN 'DONE'
         WHEN v_lic_col_exists THEN 'PARTIAL (nullable)'
         ELSE 'TODO' END,
    CASE WHEN v_lic_idx_ok     THEN 'DONE' ELSE 'TODO' END,
    CASE WHEN v_ins_col_exists THEN 'DONE' ELSE 'TODO' END,
    CASE WHEN v_ins_not_null   THEN 'DONE'
         WHEN v_ins_col_exists THEN 'PARTIAL (nullable)'
         ELSE 'TODO' END,
    CASE WHEN v_ins_idx_ok     THEN 'DONE' ELSE 'TODO' END,
    CASE WHEN v_trigger_fn_exists THEN 'DONE' ELSE 'TODO' END,
    CASE WHEN v_lic_trig_exists   THEN 'DONE' ELSE 'TODO' END,
    CASE WHEN v_ins_trig_exists   THEN 'DONE' ELSE 'TODO' END,
    CASE WHEN COALESCE(v_lic_rls_enabled, false) AND v_lic_policy_count >= 5
           THEN 'DONE'
         WHEN COALESCE(v_lic_rls_enabled, false)
           THEN 'PARTIAL (' || v_lic_policy_count || '/5 policies)'
         ELSE 'TODO' END,
    CASE WHEN COALESCE(v_ins_rls_enabled, false) AND v_ins_policy_count >= 5
           THEN 'DONE'
         WHEN COALESCE(v_ins_rls_enabled, false)
           THEN 'PARTIAL (' || v_ins_policy_count || '/5 policies)'
         ELSE 'TODO' END,
    v_overall_status,
    v_next_action
  );

END $$;

-- Single consolidated result row (scroll right for step-by-step grid).
SELECT * FROM _b3_failure_data;
