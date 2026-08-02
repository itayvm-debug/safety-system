-- ================================================================
-- Phase 2 Batch 6 — Preview SQL
-- בדיקת מצב לפני Migration: lifting_machine_appointments + entity_notes
--                            + RLS fixes: safety_briefings, height_restrictions,
--                              professional_licenses, manager_licenses
-- הרץ ב-Supabase SQL Editor — קריאה בלבד, ללא שינויים
-- ================================================================

DROP TABLE IF EXISTS _b6_preview_data;

CREATE TEMP TABLE _b6_preview_data (
  section                       TEXT,
  key                           TEXT,
  value                         TEXT
);

DO $$
DECLARE
  -- lifting_machine_appointments (LMA)
  v_lma_total                   bigint;
  v_lma_company_col_exists      boolean;
  v_lma_company_notnull         boolean;
  v_lma_null_company            bigint;
  v_lma_trigger_exists          boolean;
  v_lma_fn_exists               boolean;
  v_lma_index_exists            boolean;
  v_lma_blanket_policy          boolean;
  v_lma_select_policy           boolean;
  v_lma_insert_policy           boolean;
  v_lma_update_policy           boolean;
  v_lma_delete_policy           boolean;
  v_lma_service_policy          boolean;
  v_lma_worker_mismatch         bigint;
  v_lma_equip_mismatch          bigint;

  -- entity_notes (EN)
  v_en_total                    bigint;
  v_en_company_col_exists       boolean;
  v_en_company_notnull          boolean;
  v_en_null_company             bigint;
  v_en_trigger_exists           boolean;
  v_en_fn_exists                boolean;
  v_en_index_exists             boolean;
  v_en_blanket_policy           boolean;
  v_en_select_policy            boolean;
  v_en_insert_policy            boolean;
  v_en_update_policy            boolean;
  v_en_delete_policy            boolean;
  v_en_service_policy           boolean;
  v_en_worker_mismatch          bigint;
  v_en_vehicle_mismatch         bigint;
  v_en_heavy_mismatch           bigint;
  v_en_lifting_mismatch         bigint;
  v_en_sub_mismatch             bigint;

  -- RLS-only tables
  v_sb_rls_enabled              boolean;
  v_sb_blanket_policy           boolean;
  v_sb_worker_policy            boolean;
  v_sb_service_policy           boolean;
  v_hr_rls_enabled              boolean;
  v_hr_blanket_policy           boolean;
  v_hr_worker_policy            boolean;
  v_hr_service_policy           boolean;
  v_pl_rls_enabled              boolean;
  v_pl_worker_policy            boolean;
  v_pl_service_policy           boolean;
  v_ml_rls_enabled              boolean;
  v_ml_blanket_policy           boolean;
  v_ml_worker_policy            boolean;
  v_ml_service_policy           boolean;

  -- companies
  v_active_companies            bigint;
  v_overall                     TEXT;
BEGIN

  -- ── LMA: row count ──────────────────────────────────────────
  SELECT count(*) INTO v_lma_total FROM lifting_machine_appointments;

  -- ── LMA: company_id column ──────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lifting_machine_appointments' AND column_name = 'company_id'
  ) INTO v_lma_company_col_exists;

  IF v_lma_company_col_exists THEN
    EXECUTE 'SELECT count(*) FROM lifting_machine_appointments WHERE company_id IS NULL'
      INTO v_lma_null_company;
    EXECUTE 'SELECT (is_nullable = ''NO'') FROM information_schema.columns
             WHERE table_name = ''lifting_machine_appointments'' AND column_name = ''company_id'''
      INTO v_lma_company_notnull;

    EXECUTE 'SELECT count(*) FROM lifting_machine_appointments lma
             JOIN workers w ON w.id = lma.worker_id
             WHERE lma.company_id <> w.company_id'
      INTO v_lma_worker_mismatch;

    EXECUTE 'SELECT count(*) FROM lifting_machine_appointments lma
             JOIN heavy_equipment he ON he.id = lma.equipment_id
             WHERE lma.equipment_id IS NOT NULL AND lma.company_id <> he.company_id'
      INTO v_lma_equip_mismatch;
  ELSE
    v_lma_null_company    := NULL;
    v_lma_company_notnull := false;
    v_lma_worker_mismatch := NULL;
    v_lma_equip_mismatch  := NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'lifting_machine_appointments' AND t.tgname = 'lma_company_consistency'
  ) INTO v_lma_trigger_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'enforce_lma_company'
  ) INTO v_lma_fn_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'lifting_machine_appointments' AND indexname = 'idx_lma_company_id'
  ) INTO v_lma_index_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lifting_machine_appointments'
      AND policyname = 'Auth users can manage lifting_machine_appointments'
  ) INTO v_lma_blanket_policy;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lifting_machine_appointments' AND policyname = 'lma_select_own_company'
  ) INTO v_lma_select_policy;
  SELECT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lifting_machine_appointments' AND policyname = 'lma_insert_own_company'
  ) INTO v_lma_insert_policy;
  SELECT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lifting_machine_appointments' AND policyname = 'lma_update_own_company'
  ) INTO v_lma_update_policy;
  SELECT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lifting_machine_appointments' AND policyname = 'lma_delete_own_company'
  ) INTO v_lma_delete_policy;
  SELECT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lifting_machine_appointments' AND policyname = 'lma_service_all'
  ) INTO v_lma_service_policy;

  -- ── EN: row count ────────────────────────────────────────────
  SELECT count(*) INTO v_en_total FROM entity_notes;

  -- ── EN: company_id column ────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_notes' AND column_name = 'company_id'
  ) INTO v_en_company_col_exists;

  IF v_en_company_col_exists THEN
    EXECUTE 'SELECT count(*) FROM entity_notes WHERE company_id IS NULL'
      INTO v_en_null_company;
    EXECUTE 'SELECT (is_nullable = ''NO'') FROM information_schema.columns
             WHERE table_name = ''entity_notes'' AND column_name = ''company_id'''
      INTO v_en_company_notnull;

    EXECUTE 'SELECT count(*) FROM entity_notes en JOIN workers w ON w.id = en.entity_id
             WHERE en.entity_type = ''worker'' AND en.company_id <> w.company_id'
      INTO v_en_worker_mismatch;
    EXECUTE 'SELECT count(*) FROM entity_notes en JOIN vehicles v ON v.id = en.entity_id
             WHERE en.entity_type = ''vehicle'' AND en.company_id <> v.company_id'
      INTO v_en_vehicle_mismatch;
    EXECUTE 'SELECT count(*) FROM entity_notes en JOIN heavy_equipment he ON he.id = en.entity_id
             WHERE en.entity_type = ''heavy_equipment'' AND en.company_id <> he.company_id'
      INTO v_en_heavy_mismatch;
    EXECUTE 'SELECT count(*) FROM entity_notes en JOIN lifting_equipment le ON le.id = en.entity_id
             WHERE en.entity_type = ''lifting_equipment'' AND en.company_id <> le.company_id'
      INTO v_en_lifting_mismatch;
    EXECUTE 'SELECT count(*) FROM entity_notes en JOIN subcontractors s ON s.id = en.entity_id
             WHERE en.entity_type = ''subcontractor'' AND en.company_id <> s.company_id'
      INTO v_en_sub_mismatch;
  ELSE
    v_en_null_company     := NULL;
    v_en_company_notnull  := false;
    v_en_worker_mismatch  := NULL;
    v_en_vehicle_mismatch := NULL;
    v_en_heavy_mismatch   := NULL;
    v_en_lifting_mismatch := NULL;
    v_en_sub_mismatch     := NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'entity_notes' AND t.tgname = 'entity_notes_company_consistency'
  ) INTO v_en_trigger_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'enforce_entity_notes_company'
  ) INTO v_en_fn_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'entity_notes' AND indexname = 'idx_entity_notes_company_id'
  ) INTO v_en_index_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'entity_notes' AND policyname = 'authenticated manage notes'
  ) INTO v_en_blanket_policy;
  SELECT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'entity_notes' AND policyname = 'entity_notes_select_own_company'
  ) INTO v_en_select_policy;
  SELECT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'entity_notes' AND policyname = 'entity_notes_insert_own_company'
  ) INTO v_en_insert_policy;
  SELECT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'entity_notes' AND policyname = 'entity_notes_update_own_company'
  ) INTO v_en_update_policy;
  SELECT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'entity_notes' AND policyname = 'entity_notes_delete_own_company'
  ) INTO v_en_delete_policy;
  SELECT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'entity_notes' AND policyname = 'entity_notes_service_all'
  ) INTO v_en_service_policy;

  -- ── RLS-only tables ──────────────────────────────────────────
  SELECT relrowsecurity INTO v_sb_rls_enabled FROM pg_class WHERE relname = 'safety_briefings';
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'safety_briefings' AND policyname = 'authenticated users can read') INTO v_sb_blanket_policy;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'safety_briefings' AND policyname = 'safety_briefings_worker_select') INTO v_sb_worker_policy;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'safety_briefings' AND policyname = 'safety_briefings_service_all') INTO v_sb_service_policy;

  SELECT relrowsecurity INTO v_hr_rls_enabled FROM pg_class WHERE relname = 'height_restrictions';
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'height_restrictions' AND policyname = 'Auth users can manage height_restrictions') INTO v_hr_blanket_policy;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'height_restrictions' AND policyname = 'height_restrictions_worker_select') INTO v_hr_worker_policy;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'height_restrictions' AND policyname = 'height_restrictions_service_all') INTO v_hr_service_policy;

  SELECT relrowsecurity INTO v_pl_rls_enabled FROM pg_class WHERE relname = 'professional_licenses';
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'professional_licenses' AND policyname = 'professional_licenses_worker_select') INTO v_pl_worker_policy;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'professional_licenses' AND policyname = 'professional_licenses_service_all') INTO v_pl_service_policy;

  SELECT relrowsecurity INTO v_ml_rls_enabled FROM pg_class WHERE relname = 'manager_licenses';
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'manager_licenses' AND policyname = 'manager_licenses_authenticated') INTO v_ml_blanket_policy;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'manager_licenses' AND policyname = 'manager_licenses_worker_select') INTO v_ml_worker_policy;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'manager_licenses' AND policyname = 'manager_licenses_service_all') INTO v_ml_service_policy;

  SELECT count(*) INTO v_active_companies FROM companies WHERE is_active = true;

  -- ── Determine overall status ─────────────────────────────────
  IF v_lma_company_col_exists AND v_lma_company_notnull
     AND NOT v_lma_blanket_policy
     AND v_lma_select_policy AND v_lma_insert_policy AND v_lma_update_policy
     AND v_lma_delete_policy AND v_lma_service_policy
     AND v_lma_trigger_exists AND v_lma_fn_exists
     AND v_en_company_col_exists AND v_en_company_notnull
     AND NOT v_en_blanket_policy
     AND v_en_select_policy AND v_en_service_policy
     AND v_en_trigger_exists AND v_en_fn_exists
     AND NOT v_sb_blanket_policy AND v_sb_worker_policy AND v_sb_service_policy
     AND NOT v_hr_blanket_policy AND v_hr_worker_policy AND v_hr_service_policy
     AND v_pl_rls_enabled AND v_pl_worker_policy AND v_pl_service_policy
     AND NOT v_ml_blanket_policy AND v_ml_worker_policy AND v_ml_service_policy
  THEN
    v_overall := 'MIGRATION COMPLETE';
  ELSIF NOT v_lma_company_col_exists AND NOT v_en_company_col_exists
     AND v_sb_blanket_policy AND v_hr_blanket_policy
  THEN
    v_overall := 'CLEAN PRE-MIGRATION';
  ELSE
    v_overall := 'PARTIAL STATE';
  END IF;

  -- ── Insert results ───────────────────────────────────────────
  INSERT INTO _b6_preview_data VALUES
    ('OVERALL', 'status',                           v_overall),
    ('CONTEXT', 'active_companies',                 v_active_companies::text),
    ('LMA',     'total_rows',                       v_lma_total::text),
    ('LMA',     'company_col_exists',               v_lma_company_col_exists::text),
    ('LMA',     'company_not_null',                 v_lma_company_notnull::text),
    ('LMA',     'null_company_rows',                coalesce(v_lma_null_company::text, 'N/A')),
    ('LMA',     'worker_mismatch_count',            coalesce(v_lma_worker_mismatch::text, 'N/A')),
    ('LMA',     'equip_mismatch_count',             coalesce(v_lma_equip_mismatch::text, 'N/A')),
    ('LMA',     'trigger_exists',                   v_lma_trigger_exists::text),
    ('LMA',     'function_exists',                  v_lma_fn_exists::text),
    ('LMA',     'index_exists',                     v_lma_index_exists::text),
    ('LMA',     'blanket_policy_dropped',           (NOT v_lma_blanket_policy)::text),
    ('LMA',     'select_policy',                    v_lma_select_policy::text),
    ('LMA',     'insert_policy',                    v_lma_insert_policy::text),
    ('LMA',     'update_policy',                    v_lma_update_policy::text),
    ('LMA',     'delete_policy',                    v_lma_delete_policy::text),
    ('LMA',     'service_policy',                   v_lma_service_policy::text),
    ('EN',      'total_rows',                       v_en_total::text),
    ('EN',      'company_col_exists',               v_en_company_col_exists::text),
    ('EN',      'company_not_null',                 v_en_company_notnull::text),
    ('EN',      'null_company_rows',                coalesce(v_en_null_company::text, 'N/A')),
    ('EN',      'worker_mismatch_count',            coalesce(v_en_worker_mismatch::text, 'N/A')),
    ('EN',      'vehicle_mismatch_count',           coalesce(v_en_vehicle_mismatch::text, 'N/A')),
    ('EN',      'heavy_mismatch_count',             coalesce(v_en_heavy_mismatch::text, 'N/A')),
    ('EN',      'lifting_mismatch_count',           coalesce(v_en_lifting_mismatch::text, 'N/A')),
    ('EN',      'sub_mismatch_count',               coalesce(v_en_sub_mismatch::text, 'N/A')),
    ('EN',      'trigger_exists',                   v_en_trigger_exists::text),
    ('EN',      'function_exists',                  v_en_fn_exists::text),
    ('EN',      'index_exists',                     v_en_index_exists::text),
    ('EN',      'blanket_policy_dropped',           (NOT v_en_blanket_policy)::text),
    ('EN',      'select_policy',                    v_en_select_policy::text),
    ('EN',      'insert_policy',                    v_en_insert_policy::text),
    ('EN',      'update_policy',                    v_en_update_policy::text),
    ('EN',      'delete_policy',                    v_en_delete_policy::text),
    ('EN',      'service_policy',                   v_en_service_policy::text),
    ('SB',      'rls_enabled',                      coalesce(v_sb_rls_enabled::text, 'N/A')),
    ('SB',      'blanket_policy_dropped',           (NOT v_sb_blanket_policy)::text),
    ('SB',      'worker_select_policy',             v_sb_worker_policy::text),
    ('SB',      'service_policy',                   v_sb_service_policy::text),
    ('HR',      'rls_enabled',                      coalesce(v_hr_rls_enabled::text, 'N/A')),
    ('HR',      'blanket_policy_dropped',           (NOT v_hr_blanket_policy)::text),
    ('HR',      'worker_select_policy',             v_hr_worker_policy::text),
    ('HR',      'service_policy',                   v_hr_service_policy::text),
    ('PL',      'rls_enabled',                      coalesce(v_pl_rls_enabled::text, 'N/A')),
    ('PL',      'worker_select_policy',             v_pl_worker_policy::text),
    ('PL',      'service_policy',                   v_pl_service_policy::text),
    ('ML',      'rls_enabled',                      coalesce(v_ml_rls_enabled::text, 'N/A')),
    ('ML',      'blanket_policy_dropped',           (NOT v_ml_blanket_policy)::text),
    ('ML',      'worker_select_policy',             v_ml_worker_policy::text),
    ('ML',      'service_policy',                   v_ml_service_policy::text);
END $$;

SELECT * FROM _b6_preview_data ORDER BY section, key;
