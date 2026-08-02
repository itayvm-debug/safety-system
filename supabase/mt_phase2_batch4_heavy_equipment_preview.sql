-- ============================================================================
-- Preview: Phase 2 Batch 4 — Heavy Equipment Tenant Isolation
-- mt_phase2_batch4_heavy_equipment_preview.sql
--
-- READ-ONLY — אין DDL, אין DML.
-- מטרה: לאמת מצב לפני ואחרי הרצת המיגרציה.
--
-- ⚠ PARSE-TIME SAFETY:
--   כל שאילתות המפנות ל-company_id (שעשוי להיות חסר) נמצאות
--   בתוך PL/pgSQL EXECUTE strings — נפרסות ב-RUNTIME בלבד.
--
-- Output: שורה אחת ב-_b4_preview_data (גלויה ב-Results tab).
--
-- Expected migration_state values:
--   CLEAN PRE-MIGRATION — שתי העמודות חסרות
--   MIGRATION COMPLETE  — שתיהן NOT NULL, RLS פעיל, triggers קיימים, 0 NULL, 0 mismatches
--   PARTIAL STATE       — עמודה קיימת אך מיגרציה לא הושלמה
--   BLOCKED             — orphan heavy_equipment_id rows (integrity issue)
-- ============================================================================

DROP TABLE IF EXISTS _b4_preview_data;

CREATE TEMP TABLE _b4_preview_data (
  migration_state                text,
  he_total                       bigint,
  he_company_id_status           text,
  he_null_company_id             text,
  hei_total                      bigint,
  hei_company_id_status          text,
  hei_null_company_id            text,
  he_orphan_subcontractors       text,
  hei_orphans                    bigint,
  he_mismatches                  text,
  hei_mismatches                 text,
  subcontractor_trigger_exists   boolean,
  child_trigger_exists           boolean,
  he_rls_enabled                 boolean,
  hei_rls_enabled                boolean,
  he_policy_count                integer,
  hei_policy_count               integer,
  action_required                text
);

DO $$
DECLARE
  v_he_col_exists   BOOLEAN := false;
  v_hei_col_exists  BOOLEAN := false;
  v_he_not_null     BOOLEAN := false;
  v_hei_not_null    BOOLEAN := false;
  v_he_rls_enabled  BOOLEAN := false;
  v_hei_rls_enabled BOOLEAN := false;
  v_he_total        BIGINT  := 0;
  v_hei_total       BIGINT  := 0;
  v_he_null_cid     BIGINT  := 0;
  v_hei_null_cid    BIGINT  := 0;
  v_hei_orphans     BIGINT  := 0;
  v_he_mismatch     BIGINT  := 0;
  v_hei_mismatch    BIGINT  := 0;
  v_he_sub_cross    BIGINT  := 0;
  v_sub_trig_exists BOOLEAN := false;
  v_child_trig_exists BOOLEAN := false;
  v_he_policy_count  INTEGER := 0;
  v_hei_policy_count INTEGER := 0;
  v_migration_state  TEXT;
  v_action_required  TEXT;
  v_he_cid_status    TEXT;
  v_hei_cid_status   TEXT;
  v_he_null_text     TEXT;
  v_hei_null_text    TEXT;
  v_he_mismatch_text TEXT;
  v_hei_mismatch_text TEXT;
  v_he_sub_text      TEXT;
BEGIN

  -- Column existence (catalog — safe pre-migration)
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

  -- NOT NULL status (catalog — safe)
  IF v_he_col_exists THEN
    SELECT (is_nullable = 'NO') INTO v_he_not_null
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'heavy_equipment'
      AND column_name = 'company_id';
  END IF;

  IF v_hei_col_exists THEN
    SELECT (is_nullable = 'NO') INTO v_hei_not_null
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'heavy_equipment_insurances'
      AND column_name = 'company_id';
  END IF;

  -- Row totals (no company_id reference — safe pre-migration)
  SELECT COUNT(*) INTO v_he_total  FROM heavy_equipment;
  SELECT COUNT(*) INTO v_hei_total FROM heavy_equipment_insurances;

  -- Orphan check: heavy_equipment_insurances.heavy_equipment_id not in heavy_equipment
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
    v_he_cid_status := CASE WHEN v_he_not_null THEN 'PRESENT NOT NULL' ELSE 'PRESENT NULLABLE' END;
    v_he_null_text  := v_he_null_cid::TEXT;
    v_he_sub_text   := v_he_sub_cross::TEXT;
  ELSE
    v_he_cid_status := 'ABSENT';
    v_he_null_text  := 'N/A (column missing)';
    v_he_sub_text   := 'N/A (column missing)';
  END IF;

  IF v_hei_col_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM heavy_equipment_insurances WHERE company_id IS NULL'
      INTO v_hei_null_cid;
    EXECUTE
      'SELECT COUNT(*) FROM heavy_equipment_insurances hei '
      'JOIN heavy_equipment he ON he.id = hei.heavy_equipment_id '
      'WHERE hei.company_id IS DISTINCT FROM he.company_id'
      INTO v_hei_mismatch;
    v_hei_cid_status  := CASE WHEN v_hei_not_null THEN 'PRESENT NOT NULL' ELSE 'PRESENT NULLABLE' END;
    v_hei_null_text   := v_hei_null_cid::TEXT;
    v_hei_mismatch_text := v_hei_mismatch::TEXT;
  ELSE
    v_hei_cid_status    := 'ABSENT';
    v_hei_null_text     := 'N/A (column missing)';
    v_hei_mismatch_text := 'N/A (column missing)';
  END IF;

  -- he_mismatches only relevant after both columns exist
  IF v_he_col_exists AND v_hei_col_exists THEN
    v_he_mismatch_text := v_he_sub_text;
  ELSE
    v_he_mismatch_text := 'N/A';
  END IF;

  -- Trigger existence (pg_* catalog — safe)
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

  -- Policy counts (pg_policies catalog — safe)
  SELECT COUNT(*) INTO v_he_policy_count  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'heavy_equipment';

  SELECT COUNT(*) INTO v_hei_policy_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'heavy_equipment_insurances';

  -- RLS status (pg_class catalog — safe)
  SELECT relrowsecurity INTO v_he_rls_enabled FROM pg_class
  WHERE oid = 'public.heavy_equipment'::regclass;

  SELECT relrowsecurity INTO v_hei_rls_enabled FROM pg_class
  WHERE oid = 'public.heavy_equipment_insurances'::regclass;

  -- Determine migration_state
  IF v_hei_orphans > 0 THEN
    v_migration_state := 'BLOCKED';
    v_action_required :=
      'Orphan heavy_equipment_id rows in heavy_equipment_insurances — inspect FK integrity';

  ELSIF NOT v_he_col_exists AND NOT v_hei_col_exists THEN
    v_migration_state := 'CLEAN PRE-MIGRATION';
    v_action_required := 'Run mt_phase2_batch4_heavy_equipment.sql';

  ELSIF v_he_col_exists AND v_hei_col_exists
    AND v_he_not_null AND v_hei_not_null
    AND COALESCE(v_he_rls_enabled, false)
    AND COALESCE(v_hei_rls_enabled, false)
    AND v_sub_trig_exists
    AND v_child_trig_exists
    AND v_he_policy_count >= 5
    AND v_hei_policy_count >= 5
    AND v_he_null_cid = 0
    AND v_hei_null_cid = 0
    AND v_hei_mismatch = 0
  THEN
    v_migration_state := 'MIGRATION COMPLETE';
    v_action_required := 'None — all checks passed';

  ELSE
    v_migration_state := 'PARTIAL STATE';
    v_action_required :=
      'Run mt_phase2_batch4_post_failure_check.sql to diagnose which step is incomplete';
  END IF;

  INSERT INTO _b4_preview_data VALUES (
    v_migration_state,
    v_he_total,
    v_he_cid_status,
    v_he_null_text,
    v_hei_total,
    v_hei_cid_status,
    v_hei_null_text,
    v_he_sub_text,
    v_hei_orphans,
    v_he_mismatch_text,
    v_hei_mismatch_text,
    v_sub_trig_exists,
    v_child_trig_exists,
    v_he_rls_enabled,
    v_hei_rls_enabled,
    v_he_policy_count,
    v_hei_policy_count,
    v_action_required
  );

END $$;

-- Single consolidated result row.
-- Expected pre-migration output:
--   migration_state          | CLEAN PRE-MIGRATION
--   he_total                 | <n>
--   he_company_id_status     | ABSENT
--   he_null_company_id       | N/A (column missing)
--   hei_total                | <n>
--   hei_company_id_status    | ABSENT
--   hei_null_company_id      | N/A (column missing)
--   hei_orphans              | 0
--   subcontractor_trigger    | false
--   child_trigger_exists     | false
--   he_policy_count          | 1  (the old blanket policy)
--   hei_policy_count         | 0
--   action_required          | Run mt_phase2_batch4_heavy_equipment.sql
SELECT * FROM _b4_preview_data;
