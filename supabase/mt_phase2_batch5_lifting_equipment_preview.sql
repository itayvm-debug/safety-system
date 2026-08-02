-- ============================================================================
-- mt_phase2_batch5_lifting_equipment_preview.sql
-- Phase 2 Batch 5 — lifting_equipment tenant-isolation preview
--
-- Run this BEFORE the migration to verify current state.
-- Safe to run at any time — read-only, no schema changes.
-- ============================================================================

DROP TABLE IF EXISTS _b5_preview_data;
CREATE TEMP TABLE _b5_preview_data (
  migration_state          TEXT,
  le_has_company_id        BOOLEAN,
  le_company_id_notnull    BOOLEAN,
  le_rls_enabled           BOOLEAN,
  le_policy_count          INT,
  le_tenant_policies       INT,
  le_service_policy        BOOLEAN,
  le_blanket_dropped       BOOLEAN,
  le_company_id_idx        BOOLEAN,
  le_sub_trigger           BOOLEAN,
  le_null_count            BIGINT,
  active_company_count     BIGINT,
  total_le_rows            BIGINT,
  sub_company_id_not_null  BOOLEAN
);

DO $$
DECLARE
  v_has_company_id        BOOLEAN;
  v_notnull               BOOLEAN;
  v_rls_enabled           BOOLEAN;
  v_policy_count          INT;
  v_tenant_policies       INT;
  v_service_policy        BOOLEAN;
  v_blanket_dropped       BOOLEAN;
  v_company_id_idx        BOOLEAN;
  v_sub_trigger           BOOLEAN;
  v_null_count            BIGINT;
  v_active_companies      BIGINT;
  v_total_rows            BIGINT;
  v_sub_company_id_notnull BOOLEAN;
  v_state                 TEXT;
BEGIN
  -- ── Column existence ───────────────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lifting_equipment'
      AND column_name = 'company_id'
  ) INTO v_has_company_id;

  -- ── NOT NULL constraint ────────────────────────────────────────────────────
  IF v_has_company_id THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lifting_equipment'
        AND column_name = 'company_id' AND is_nullable = 'NO'
    ) INTO v_notnull;
    EXECUTE 'SELECT COUNT(*) FROM lifting_equipment WHERE company_id IS NULL'
      INTO v_null_count;
  ELSE
    v_notnull    := false;
    v_null_count := -1;
  END IF;

  -- ── RLS ───────────────────────────────────────────────────────────────────
  SELECT c.relrowsecurity INTO v_rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'lifting_equipment' AND n.nspname = 'public';

  -- ── Policy counts ─────────────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'lifting_equipment';

  SELECT COUNT(*) INTO v_tenant_policies
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'lifting_equipment'
    AND policyname IN (
      'lifting_equipment_select_own_company',
      'lifting_equipment_insert_own_company',
      'lifting_equipment_update_own_company',
      'lifting_equipment_delete_own_company'
    );

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lifting_equipment'
      AND policyname = 'lifting_equipment_service_all'
  ) INTO v_service_policy;

  -- ── Blanket policy ────────────────────────────────────────────────────────
  SELECT NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lifting_equipment'
      AND policyname = 'Auth users can manage lifting_equipment'
  ) INTO v_blanket_dropped;

  -- ── Index ─────────────────────────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'lifting_equipment'
      AND indexname = 'lifting_equipment_company_id_idx'
  ) INTO v_company_id_idx;

  -- ── Subcontractor trigger ─────────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'lifting_equipment'
      AND trigger_name = 'lifting_equipment_subcontractor_same_company'
  ) INTO v_sub_trigger;

  -- ── Prerequisite: subcontractors.company_id NOT NULL ─────────────────────
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subcontractors'
      AND column_name = 'company_id' AND is_nullable = 'NO'
  ) INTO v_sub_company_id_notnull;

  -- ── Active companies ──────────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_active_companies FROM companies WHERE is_active = true;

  -- ── Total rows ────────────────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_total_rows FROM lifting_equipment;

  -- ── Determine migration state ─────────────────────────────────────────────
  IF v_has_company_id AND v_notnull AND v_rls_enabled
     AND v_tenant_policies = 4 AND v_service_policy
     AND v_blanket_dropped AND v_null_count = 0
     AND v_company_id_idx AND v_sub_trigger
  THEN
    v_state := 'MIGRATION COMPLETE';
  ELSIF NOT v_has_company_id AND v_active_companies > 1 THEN
    v_state := 'BLOCKED — multiple active companies, cannot auto-backfill';
  ELSIF NOT v_has_company_id THEN
    v_state := 'CLEAN PRE-MIGRATION';
  ELSE
    v_state := 'PARTIAL STATE';
  END IF;

  INSERT INTO _b5_preview_data VALUES (
    v_state,
    v_has_company_id, v_notnull, v_rls_enabled,
    v_policy_count, v_tenant_policies, v_service_policy, v_blanket_dropped,
    v_company_id_idx, v_sub_trigger,
    v_null_count, v_active_companies, v_total_rows,
    v_sub_company_id_notnull
  );
END $$;

SELECT * FROM _b5_preview_data;
