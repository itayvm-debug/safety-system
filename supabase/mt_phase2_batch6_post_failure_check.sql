-- ================================================================
-- Phase 2 Batch 6 — Post-Failure Check
-- בדיקת מצב Migration לאחר כישלון אפשרי
-- הרץ ב-Supabase SQL Editor — קריאה בלבד
-- ================================================================

DROP TABLE IF EXISTS _b6_failure_data;

CREATE TEMP TABLE _b6_failure_data (
  step          TEXT,
  description   TEXT,
  status        TEXT,
  detail        TEXT
);

DO $$
DECLARE
  -- LMA checks
  v_lma_col_exists      boolean;
  v_lma_notnull         boolean;
  v_lma_null_rows       bigint;
  v_lma_index           boolean;
  v_lma_blanket_dropped boolean;
  v_lma_select_pol      boolean;
  v_lma_insert_pol      boolean;
  v_lma_update_pol      boolean;
  v_lma_delete_pol      boolean;
  v_lma_service_pol     boolean;
  v_lma_trigger         boolean;
  v_lma_fn              boolean;
  v_lma_worker_mismatch bigint;
  v_lma_equip_mismatch  bigint;

  -- EN checks
  v_en_col_exists       boolean;
  v_en_notnull          boolean;
  v_en_null_rows        bigint;
  v_en_index            boolean;
  v_en_blanket_dropped  boolean;
  v_en_select_pol       boolean;
  v_en_insert_pol       boolean;
  v_en_update_pol       boolean;
  v_en_delete_pol       boolean;
  v_en_service_pol      boolean;
  v_en_trigger          boolean;
  v_en_fn               boolean;
  v_en_worker_mismatch  bigint;
  v_en_vehicle_mismatch bigint;
  v_en_heavy_mismatch   bigint;
  v_en_lifting_mismatch bigint;
  v_en_sub_mismatch     bigint;

  -- RLS-only checks
  v_sb_blanket_dropped  boolean;
  v_sb_worker_pol       boolean;
  v_sb_service_pol      boolean;
  v_hr_blanket_dropped  boolean;
  v_hr_worker_pol       boolean;
  v_hr_service_pol      boolean;
  v_pl_rls_enabled      boolean;
  v_pl_worker_pol       boolean;
  v_pl_service_pol      boolean;
  v_ml_blanket_dropped  boolean;
  v_ml_worker_pol       boolean;
  v_ml_service_pol      boolean;

  v_overall             TEXT;
BEGIN

  -- ── LMA ─────────────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lifting_machine_appointments' AND column_name = 'company_id'
  ) INTO v_lma_col_exists;

  IF v_lma_col_exists THEN
    EXECUTE 'SELECT count(*) FROM lifting_machine_appointments WHERE company_id IS NULL' INTO v_lma_null_rows;
    EXECUTE 'SELECT (is_nullable = ''NO'') FROM information_schema.columns
             WHERE table_name = ''lifting_machine_appointments'' AND column_name = ''company_id''' INTO v_lma_notnull;
    EXECUTE 'SELECT count(*) FROM lifting_machine_appointments lma JOIN workers w ON w.id = lma.worker_id WHERE lma.company_id <> w.company_id' INTO v_lma_worker_mismatch;
    EXECUTE 'SELECT count(*) FROM lifting_machine_appointments lma JOIN heavy_equipment he ON he.id = lma.equipment_id WHERE lma.equipment_id IS NOT NULL AND lma.company_id <> he.company_id' INTO v_lma_equip_mismatch;
  ELSE
    v_lma_null_rows := NULL;
    v_lma_notnull := false;
    v_lma_worker_mismatch := NULL;
    v_lma_equip_mismatch := NULL;
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'lifting_machine_appointments' AND indexname = 'idx_lma_company_id') INTO v_lma_index;
  SELECT NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lifting_machine_appointments' AND policyname = 'Auth users can manage lifting_machine_appointments') INTO v_lma_blanket_dropped;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lifting_machine_appointments' AND policyname = 'lma_select_own_company') INTO v_lma_select_pol;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lifting_machine_appointments' AND policyname = 'lma_insert_own_company') INTO v_lma_insert_pol;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lifting_machine_appointments' AND policyname = 'lma_update_own_company') INTO v_lma_update_pol;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lifting_machine_appointments' AND policyname = 'lma_delete_own_company') INTO v_lma_delete_pol;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lifting_machine_appointments' AND policyname = 'lma_service_all') INTO v_lma_service_pol;
  SELECT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relname = 'lifting_machine_appointments' AND t.tgname = 'lma_company_consistency') INTO v_lma_trigger;
  SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_lma_company') INTO v_lma_fn;

  -- ── EN ─────────────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'entity_notes' AND column_name = 'company_id'
  ) INTO v_en_col_exists;

  IF v_en_col_exists THEN
    EXECUTE 'SELECT count(*) FROM entity_notes WHERE company_id IS NULL' INTO v_en_null_rows;
    EXECUTE 'SELECT (is_nullable = ''NO'') FROM information_schema.columns WHERE table_name = ''entity_notes'' AND column_name = ''company_id''' INTO v_en_notnull;
    EXECUTE 'SELECT count(*) FROM entity_notes en JOIN workers w ON w.id = en.entity_id WHERE en.entity_type = ''worker'' AND en.company_id <> w.company_id' INTO v_en_worker_mismatch;
    EXECUTE 'SELECT count(*) FROM entity_notes en JOIN vehicles v ON v.id = en.entity_id WHERE en.entity_type = ''vehicle'' AND en.company_id <> v.company_id' INTO v_en_vehicle_mismatch;
    EXECUTE 'SELECT count(*) FROM entity_notes en JOIN heavy_equipment he ON he.id = en.entity_id WHERE en.entity_type = ''heavy_equipment'' AND en.company_id <> he.company_id' INTO v_en_heavy_mismatch;
    EXECUTE 'SELECT count(*) FROM entity_notes en JOIN lifting_equipment le ON le.id = en.entity_id WHERE en.entity_type = ''lifting_equipment'' AND en.company_id <> le.company_id' INTO v_en_lifting_mismatch;
    EXECUTE 'SELECT count(*) FROM entity_notes en JOIN subcontractors s ON s.id = en.entity_id WHERE en.entity_type = ''subcontractor'' AND en.company_id <> s.company_id' INTO v_en_sub_mismatch;
  ELSE
    v_en_null_rows := NULL;
    v_en_notnull := false;
    v_en_worker_mismatch := NULL;
    v_en_vehicle_mismatch := NULL;
    v_en_heavy_mismatch := NULL;
    v_en_lifting_mismatch := NULL;
    v_en_sub_mismatch := NULL;
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'entity_notes' AND indexname = 'idx_entity_notes_company_id') INTO v_en_index;
  SELECT NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'entity_notes' AND policyname = 'authenticated manage notes') INTO v_en_blanket_dropped;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'entity_notes' AND policyname = 'entity_notes_select_own_company') INTO v_en_select_pol;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'entity_notes' AND policyname = 'entity_notes_insert_own_company') INTO v_en_insert_pol;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'entity_notes' AND policyname = 'entity_notes_update_own_company') INTO v_en_update_pol;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'entity_notes' AND policyname = 'entity_notes_delete_own_company') INTO v_en_delete_pol;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'entity_notes' AND policyname = 'entity_notes_service_all') INTO v_en_service_pol;
  SELECT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relname = 'entity_notes' AND t.tgname = 'entity_notes_company_consistency') INTO v_en_trigger;
  SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_entity_notes_company') INTO v_en_fn;

  -- ── RLS-only ─────────────────────────────────────────────────
  SELECT NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'safety_briefings' AND policyname = 'authenticated users can read') INTO v_sb_blanket_dropped;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'safety_briefings' AND policyname = 'safety_briefings_worker_select') INTO v_sb_worker_pol;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'safety_briefings' AND policyname = 'safety_briefings_service_all') INTO v_sb_service_pol;

  SELECT NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'height_restrictions' AND policyname = 'Auth users can manage height_restrictions') INTO v_hr_blanket_dropped;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'height_restrictions' AND policyname = 'height_restrictions_worker_select') INTO v_hr_worker_pol;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'height_restrictions' AND policyname = 'height_restrictions_service_all') INTO v_hr_service_pol;

  SELECT relrowsecurity INTO v_pl_rls_enabled FROM pg_class WHERE relname = 'professional_licenses';
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'professional_licenses' AND policyname = 'professional_licenses_worker_select') INTO v_pl_worker_pol;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'professional_licenses' AND policyname = 'professional_licenses_service_all') INTO v_pl_service_pol;

  SELECT NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'manager_licenses' AND policyname = 'manager_licenses_authenticated') INTO v_ml_blanket_dropped;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'manager_licenses' AND policyname = 'manager_licenses_worker_select') INTO v_ml_worker_pol;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'manager_licenses' AND policyname = 'manager_licenses_service_all') INTO v_ml_service_pol;

  -- ── Overall ─────────────────────────────────────────────────
  IF v_lma_col_exists AND v_lma_notnull
     AND (v_lma_null_rows = 0) AND (v_lma_worker_mismatch = 0)
     AND v_lma_blanket_dropped AND v_lma_select_pol AND v_lma_insert_pol
     AND v_lma_update_pol AND v_lma_delete_pol AND v_lma_service_pol
     AND v_lma_trigger AND v_lma_fn
     AND v_en_col_exists AND v_en_notnull
     AND (v_en_null_rows = 0) AND (v_en_worker_mismatch = 0)
     AND v_en_blanket_dropped AND v_en_select_pol AND v_en_insert_pol
     AND v_en_update_pol AND v_en_delete_pol AND v_en_service_pol
     AND v_en_trigger AND v_en_fn
     AND v_sb_blanket_dropped AND v_sb_worker_pol AND v_sb_service_pol
     AND v_hr_blanket_dropped AND v_hr_worker_pol AND v_hr_service_pol
     AND v_pl_rls_enabled AND v_pl_worker_pol AND v_pl_service_pol
     AND v_ml_blanket_dropped AND v_ml_worker_pol AND v_ml_service_pol
  THEN
    v_overall := 'COMPLETE';
  ELSIF NOT v_lma_col_exists AND NOT v_en_col_exists THEN
    v_overall := 'NOT STARTED';
  ELSE
    v_overall := 'PARTIAL';
  END IF;

  INSERT INTO _b6_failure_data VALUES
    ('overall',    'migration_status',              v_overall,          ''),
    ('step_01',    'lma_company_col_exists',        v_lma_col_exists::text, ''),
    ('step_02',    'lma_company_not_null',          v_lma_notnull::text, ''),
    ('step_03',    'lma_null_rows',                 coalesce(v_lma_null_rows::text, 'N/A'), 'חייב להיות 0'),
    ('step_04',    'lma_worker_mismatch',           coalesce(v_lma_worker_mismatch::text, 'N/A'), 'חייב להיות 0'),
    ('step_05',    'lma_equip_mismatch',            coalesce(v_lma_equip_mismatch::text, 'N/A'), 'חייב להיות 0'),
    ('step_06',    'lma_index',                     v_lma_index::text, ''),
    ('step_07',    'lma_blanket_policy_dropped',    v_lma_blanket_dropped::text, ''),
    ('step_08',    'lma_select_policy',             v_lma_select_pol::text, ''),
    ('step_09',    'lma_insert_policy',             v_lma_insert_pol::text, ''),
    ('step_10',    'lma_update_policy',             v_lma_update_pol::text, ''),
    ('step_11',    'lma_delete_policy',             v_lma_delete_pol::text, ''),
    ('step_12',    'lma_service_policy',            v_lma_service_pol::text, ''),
    ('step_13',    'lma_trigger',                   v_lma_trigger::text, ''),
    ('step_14',    'lma_function',                  v_lma_fn::text, ''),
    ('step_15',    'en_company_col_exists',         v_en_col_exists::text, ''),
    ('step_16',    'en_company_not_null',           v_en_notnull::text, ''),
    ('step_17',    'en_null_rows',                  coalesce(v_en_null_rows::text, 'N/A'), 'חייב להיות 0'),
    ('step_18',    'en_worker_mismatch',            coalesce(v_en_worker_mismatch::text, 'N/A'), 'חייב להיות 0'),
    ('step_19',    'en_vehicle_mismatch',           coalesce(v_en_vehicle_mismatch::text, 'N/A'), 'חייב להיות 0'),
    ('step_20',    'en_heavy_mismatch',             coalesce(v_en_heavy_mismatch::text, 'N/A'), 'חייב להיות 0'),
    ('step_21',    'en_lifting_mismatch',           coalesce(v_en_lifting_mismatch::text, 'N/A'), 'חייב להיות 0'),
    ('step_22',    'en_sub_mismatch',               coalesce(v_en_sub_mismatch::text, 'N/A'), 'חייב להיות 0'),
    ('step_23',    'en_blanket_policy_dropped',     v_en_blanket_dropped::text, ''),
    ('step_24',    'en_select_policy',              v_en_select_pol::text, ''),
    ('step_25',    'en_service_policy',             v_en_service_pol::text, ''),
    ('step_26',    'en_trigger',                    v_en_trigger::text, ''),
    ('step_27',    'en_function',                   v_en_fn::text, ''),
    ('step_28',    'sb_blanket_policy_dropped',     v_sb_blanket_dropped::text, ''),
    ('step_29',    'sb_worker_select_policy',       v_sb_worker_pol::text, ''),
    ('step_30',    'sb_service_policy',             v_sb_service_pol::text, ''),
    ('step_31',    'hr_blanket_policy_dropped',     v_hr_blanket_dropped::text, ''),
    ('step_32',    'hr_worker_select_policy',       v_hr_worker_pol::text, ''),
    ('step_33',    'hr_service_policy',             v_hr_service_pol::text, ''),
    ('step_34',    'pl_rls_enabled',                coalesce(v_pl_rls_enabled::text, 'false'), ''),
    ('step_35',    'pl_worker_select_policy',       v_pl_worker_pol::text, ''),
    ('step_36',    'pl_service_policy',             v_pl_service_pol::text, ''),
    ('step_37',    'ml_blanket_policy_dropped',     v_ml_blanket_dropped::text, ''),
    ('step_38',    'ml_worker_select_policy',       v_ml_worker_pol::text, ''),
    ('step_39',    'ml_service_policy',             v_ml_service_pol::text, '');
END $$;

SELECT * FROM _b6_failure_data ORDER BY step, description;
