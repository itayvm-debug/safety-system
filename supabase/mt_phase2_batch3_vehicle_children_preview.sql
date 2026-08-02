-- ============================================================================
-- Preview: Phase 2 Batch 3 — Vehicle Children Tenant Isolation
-- mt_phase2_batch3_vehicle_children_preview.sql
--
-- READ-ONLY — אין DDL, אין DML.
-- מטרה: לאמת מצב לפני ואחרי הרצת המיגרציה.
--
-- ⚠ PARSE-TIME FIX (2026-07-30):
--   PostgreSQL resolves ALL column references at PARSE TIME, including columns
--   inside CASE THEN branches. A CASE guard (WHEN EXISTS ... THEN query_with_col)
--   does NOT prevent ERROR 42703 when the column is absent at parse time.
--   FIX: every vehicle_licenses.company_id / vehicle_insurances.company_id
--   reference is inside a PL/pgSQL EXECUTE string — parsed at RUNTIME, after
--   the column-existence check confirms the column is present.
--
-- Output: one row in _b3_preview_data (visible in Results tab).
--
-- Expected migration_state values:
--   CLEAN PRE-MIGRATION — both columns absent, 0 triggers, 0 policies
--   MIGRATION COMPLETE  — both columns NOT NULL, RLS on, >=2 triggers,
--                         >=5 policies per table, 0 NULL rows, 0 mismatches
--   PARTIAL STATE       — column(s) exist but migration incomplete
--   BLOCKED             — orphan vehicle_id rows found (data integrity issue)
-- ============================================================================

DROP TABLE IF EXISTS _b3_preview_data;

CREATE TEMP TABLE _b3_preview_data (
  migration_state              text,
  licenses_total               bigint,
  licenses_company_id_status   text,
  licenses_null_company_id     text,
  insurances_total             bigint,
  insurances_company_id_status text,
  insurances_null_company_id   text,
  license_orphans              bigint,
  insurance_orphans            bigint,
  license_mismatches           text,
  insurance_mismatches         text,
  trigger_count                integer,
  license_policy_count         integer,
  insurance_policy_count       integer,
  action_required              text
);

DO $$
DECLARE
  v_lic_col_exists    BOOLEAN := false;
  v_ins_col_exists    BOOLEAN := false;
  v_lic_not_null      BOOLEAN := false;
  v_ins_not_null      BOOLEAN := false;
  v_lic_rls_enabled   BOOLEAN := false;
  v_ins_rls_enabled   BOOLEAN := false;
  v_lic_total         BIGINT  := 0;
  v_ins_total         BIGINT  := 0;
  v_lic_null_cid      BIGINT  := 0;
  v_ins_null_cid      BIGINT  := 0;
  v_lic_orphans       BIGINT  := 0;
  v_ins_orphans       BIGINT  := 0;
  v_lic_mismatch      BIGINT  := 0;
  v_ins_mismatch      BIGINT  := 0;
  v_trigger_count     INTEGER := 0;
  v_lic_policy_count  INTEGER := 0;
  v_ins_policy_count  INTEGER := 0;
  v_migration_state   TEXT;
  v_action_required   TEXT;
  v_lic_cid_status    TEXT;
  v_ins_cid_status    TEXT;
  v_lic_null_text     TEXT;
  v_ins_null_text     TEXT;
  v_lic_mismatch_text TEXT;
  v_ins_mismatch_text TEXT;
BEGIN

  -- Column existence (information_schema catalog -- safe pre-migration)
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

  -- NOT NULL status (catalog -- safe)
  IF v_lic_col_exists THEN
    SELECT (is_nullable = 'NO') INTO v_lic_not_null
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicle_licenses'
      AND column_name = 'company_id';
  END IF;

  IF v_ins_col_exists THEN
    SELECT (is_nullable = 'NO') INTO v_ins_not_null
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicle_insurances'
      AND column_name = 'company_id';
  END IF;

  -- Row totals (no company_id reference -- safe pre-migration)
  SELECT COUNT(*) INTO v_lic_total FROM vehicle_licenses;
  SELECT COUNT(*) INTO v_ins_total FROM vehicle_insurances;

  -- Orphan checks (vehicle_id FK only -- no company_id reference)
  SELECT COUNT(*) INTO v_lic_orphans
  FROM vehicle_licenses vl
  LEFT JOIN vehicles v ON v.id = vl.vehicle_id
  WHERE v.id IS NULL;

  SELECT COUNT(*) INTO v_ins_orphans
  FROM vehicle_insurances vi
  LEFT JOIN vehicles v ON v.id = vi.vehicle_id
  WHERE v.id IS NULL;

  -- company_id-dependent checks -- EXECUTE ONLY
  --
  -- Plain SQL CASE WHEN EXISTS(column check) THEN (query with col) fails at
  -- parse time (ERROR 42703) because PostgreSQL resolves all column references
  -- when parsing the statement, before any condition is evaluated.
  -- EXECUTE sends the SQL string to the parser only when the EXECUTE line runs,
  -- after the IF guard above has confirmed the column exists.
  IF v_lic_col_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM vehicle_licenses WHERE company_id IS NULL'
      INTO v_lic_null_cid;
    EXECUTE
      'SELECT COUNT(*) FROM vehicle_licenses vl '
      'JOIN vehicles v ON v.id = vl.vehicle_id '
      'WHERE vl.company_id IS DISTINCT FROM v.company_id'
      INTO v_lic_mismatch;
    v_lic_cid_status    := CASE WHEN v_lic_not_null
                                THEN 'PRESENT NOT NULL'
                                ELSE 'PRESENT NULLABLE' END;
    v_lic_null_text     := v_lic_null_cid::TEXT;
    v_lic_mismatch_text := v_lic_mismatch::TEXT;
  ELSE
    v_lic_cid_status    := 'ABSENT';
    v_lic_null_text     := 'N/A (column missing)';
    v_lic_mismatch_text := 'N/A (column missing)';
  END IF;

  IF v_ins_col_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM vehicle_insurances WHERE company_id IS NULL'
      INTO v_ins_null_cid;
    EXECUTE
      'SELECT COUNT(*) FROM vehicle_insurances vi '
      'JOIN vehicles v ON v.id = vi.vehicle_id '
      'WHERE vi.company_id IS DISTINCT FROM v.company_id'
      INTO v_ins_mismatch;
    v_ins_cid_status    := CASE WHEN v_ins_not_null
                                THEN 'PRESENT NOT NULL'
                                ELSE 'PRESENT NULLABLE' END;
    v_ins_null_text     := v_ins_null_cid::TEXT;
    v_ins_mismatch_text := v_ins_mismatch::TEXT;
  ELSE
    v_ins_cid_status    := 'ABSENT';
    v_ins_null_text     := 'N/A (column missing)';
    v_ins_mismatch_text := 'N/A (column missing)';
  END IF;

  -- Trigger count (pg_trigger catalog -- safe)
  SELECT COUNT(*) INTO v_trigger_count
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('vehicle_licenses', 'vehicle_insurances')
    AND t.tgname LIKE '%company_id_check%'
    AND NOT t.tgisinternal;

  -- Policy counts (pg_policies catalog -- safe)
  SELECT COUNT(*) INTO v_lic_policy_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'vehicle_licenses';

  SELECT COUNT(*) INTO v_ins_policy_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'vehicle_insurances';

  -- RLS status (pg_class catalog -- safe)
  SELECT relrowsecurity INTO v_lic_rls_enabled FROM pg_class
  WHERE oid = 'public.vehicle_licenses'::regclass;

  SELECT relrowsecurity INTO v_ins_rls_enabled FROM pg_class
  WHERE oid = 'public.vehicle_insurances'::regclass;

  -- Determine migration_state
  IF v_lic_orphans > 0 OR v_ins_orphans > 0 THEN
    v_migration_state := 'BLOCKED';
    v_action_required :=
      'Orphan vehicle_id rows detected — inspect vehicle_licenses/insurances for referential integrity';

  ELSIF NOT v_lic_col_exists AND NOT v_ins_col_exists THEN
    v_migration_state := 'CLEAN PRE-MIGRATION';
    v_action_required := 'Run mt_phase2_batch3_vehicle_children.sql';

  ELSIF v_lic_col_exists AND v_ins_col_exists
    AND v_lic_not_null AND v_ins_not_null
    AND COALESCE(v_lic_rls_enabled, false)
    AND COALESCE(v_ins_rls_enabled, false)
    AND v_trigger_count >= 2
    AND v_lic_policy_count >= 5
    AND v_ins_policy_count >= 5
    AND v_lic_null_cid = 0
    AND v_ins_null_cid = 0
    AND v_lic_mismatch = 0
    AND v_ins_mismatch = 0
  THEN
    v_migration_state := 'MIGRATION COMPLETE';
    v_action_required := 'None -- all checks passed';

  ELSE
    v_migration_state := 'PARTIAL STATE';
    v_action_required :=
      'Run mt_phase2_batch3_post_failure_check.sql to diagnose which step is incomplete';
  END IF;

  -- Insert single summary row
  INSERT INTO _b3_preview_data VALUES (
    v_migration_state,
    v_lic_total,
    v_lic_cid_status,
    v_lic_null_text,
    v_ins_total,
    v_ins_cid_status,
    v_ins_null_text,
    v_lic_orphans,
    v_ins_orphans,
    v_lic_mismatch_text,
    v_ins_mismatch_text,
    v_trigger_count,
    v_lic_policy_count,
    v_ins_policy_count,
    v_action_required
  );

END $$;

-- Single consolidated result row.
-- Expected pre-migration output:
--   migration_state              | CLEAN PRE-MIGRATION
--   licenses_total               | <n>
--   licenses_company_id_status   | ABSENT
--   licenses_null_company_id     | N/A (column missing)
--   insurances_total             | <n>
--   insurances_company_id_status | ABSENT
--   insurances_null_company_id   | N/A (column missing)
--   license_orphans              | 0
--   insurance_orphans            | 0
--   license_mismatches           | N/A (column missing)
--   insurance_mismatches         | N/A (column missing)
--   trigger_count                | 0
--   license_policy_count         | 0
--   insurance_policy_count       | 0
--   action_required              | Run mt_phase2_batch3_vehicle_children.sql
SELECT * FROM _b3_preview_data;
