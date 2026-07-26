-- ================================================================
-- mt_phase2_batch2_post_failure_check.sql
--
-- Read-only state diagnostic for Phase 2 Batch 2.
-- Run after any failure to determine the exact database state.
-- SAFE at ALL states: pre-migration, partial, or fully applied.
--
-- Contains NO INSERT / UPDATE / DELETE / DROP / ALTER.
-- The DO block uses PL/pgSQL EXECUTE for conditional column access
-- (avoids parse-time failure if company_id is missing on
-- subcontractors or vehicles).
--
-- Interpretation guide:
--   CLEAN PRE-MIGRATION  → transaction rolled back fully; safe to re-run
--   MIGRATION COMPLETE   → all columns, indexes, policies in place
--   BLOCKED              → duplicate vehicle_numbers prevent composite UNIQUE;
--                          resolve before re-running the migration
--   PARTIAL STATE        → some DDL committed before error;
--                          contact DBA before re-running
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- SECTION 1: Column existence + nullable status
-- (always safe, sourced from information_schema)
-- ──────────────────────────────────────────────────────────────────

SELECT
  col.table_name,
  col.column_name,
  'EXISTS'          AS column_status,
  col.data_type,
  col.is_nullable,
  col.column_default
FROM information_schema.columns col
WHERE col.table_schema = 'public'
  AND (
       (col.table_name = 'subcontractors' AND col.column_name = 'company_id')
    OR (col.table_name = 'vehicles'       AND col.column_name = 'company_id')
  )
ORDER BY col.table_name, col.column_name;

-- (0 rows = CLEAN PRE-MIGRATION; 2 rows = columns added; partial = 1 row)

-- ──────────────────────────────────────────────────────────────────
-- SECTION 2: Row totals — no company_id reference (always safe)
-- ──────────────────────────────────────────────────────────────────

SELECT 'subcontractors'  AS table_name, COUNT(*) AS row_count FROM subcontractors
UNION ALL SELECT 'vehicles',         COUNT(*) FROM vehicles
UNION ALL SELECT 'vehicle_licenses', COUNT(*) FROM vehicle_licenses
UNION ALL SELECT 'vehicle_insurances',COUNT(*) FROM vehicle_insurances
UNION ALL SELECT 'companies',        COUNT(*) FROM companies
UNION ALL SELECT 'company_members',  COUNT(*) FROM company_members
ORDER BY table_name;

-- ──────────────────────────────────────────────────────────────────
-- SECTION 3: RLS enablement on subcontractors + vehicles
-- (always safe, sourced from pg_class)
-- ──────────────────────────────────────────────────────────────────

SELECT
  c.relname             AS table_name,
  c.relrowsecurity      AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('subcontractors', 'vehicles')
ORDER BY c.relname;

-- ──────────────────────────────────────────────────────────────────
-- SECTION 4: All RLS policies on subcontractors + vehicles
-- (always safe, sourced from pg_policies)
-- ──────────────────────────────────────────────────────────────────

SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('subcontractors', 'vehicles')
ORDER BY tablename, policyname;

-- ──────────────────────────────────────────────────────────────────
-- SECTION 5: Expected new policies (5 per table = 10 total)
-- ──────────────────────────────────────────────────────────────────

SELECT
  expected.tablename,
  expected.policyname,
  CASE WHEN p.policyname IS NOT NULL THEN 'EXISTS ✓' ELSE 'MISSING ✗' END AS status
FROM (VALUES
  ('subcontractors', 'subcontractors_select_company'),
  ('subcontractors', 'subcontractors_insert_company'),
  ('subcontractors', 'subcontractors_update_company'),
  ('subcontractors', 'subcontractors_delete_company'),
  ('subcontractors', 'subcontractors_service_all'),
  ('vehicles',       'vehicles_select_company'),
  ('vehicles',       'vehicles_insert_company'),
  ('vehicles',       'vehicles_update_company'),
  ('vehicles',       'vehicles_delete_company'),
  ('vehicles',       'vehicles_service_all')
) AS expected(tablename, policyname)
LEFT JOIN pg_policies p
  ON  p.schemaname = 'public'
  AND p.tablename  = expected.tablename
  AND p.policyname = expected.policyname
ORDER BY expected.tablename, expected.policyname;

-- ──────────────────────────────────────────────────────────────────
-- SECTION 6: Old blanket policies (should be GONE after migration)
-- ──────────────────────────────────────────────────────────────────

SELECT
  tablename,
  policyname,
  'STILL EXISTS — migration did not complete or rolled back' AS warning
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    (tablename = 'subcontractors' AND policyname IN (
      'Authenticated users can read subcontractors',
      'Authenticated users can insert subcontractors',
      'Authenticated users can update subcontractors',
      'Authenticated users can delete subcontractors'
    ))
    OR
    (tablename = 'vehicles' AND policyname = 'vehicles_authenticated')
  );

-- (0 rows = correct post-migration state; rows = pre- or partial state)

-- ──────────────────────────────────────────────────────────────────
-- SECTION 7: Indexes on subcontractors + vehicles
-- ──────────────────────────────────────────────────────────────────

SELECT
  expected.indexname,
  expected.tablename,
  expected.should_exist,
  CASE
    WHEN expected.should_exist  AND i.indexname IS NOT NULL THEN 'EXISTS ✓'
    WHEN expected.should_exist  AND i.indexname IS NULL     THEN 'MISSING ✗'
    WHEN NOT expected.should_exist AND i.indexname IS NOT NULL THEN 'STILL EXISTS ✗'
    ELSE 'GONE ✓'
  END AS status,
  i.indexdef
FROM (VALUES
  ('subcontractors_company_id_idx',            'subcontractors', true),
  ('vehicles_company_id_idx',                  'vehicles',       true),
  ('vehicles_company_vehicle_number_unique',   'vehicles',       true),
  ('vehicles_vehicle_number_unique',           'vehicles',       false)
) AS expected(indexname, tablename, should_exist)
LEFT JOIN pg_indexes i
  ON  i.schemaname = 'public'
  AND i.tablename  = expected.tablename
  AND i.indexname  = expected.indexname
ORDER BY expected.tablename, expected.indexname;

-- ──────────────────────────────────────────────────────────────────
-- SECTION 7B: Uniqueness object type for vehicles.vehicle_number
-- Distinguishes UNIQUE CONSTRAINT from STANDALONE UNIQUE INDEX.
-- A UNIQUE CONSTRAINT requires DROP CONSTRAINT (not DROP INDEX).
-- A standalone index requires DROP INDEX.
-- This distinction caused the Phase 2 Batch 2 production failure.
-- ──────────────────────────────────────────────────────────────────

SELECT
  obj.object_name,
  obj.object_type,
  CASE obj.object_type
    WHEN 'old: UNIQUE CONSTRAINT' THEN
      CASE WHEN EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class     t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' AND t.relname = 'vehicles'
          AND c.conname = 'vehicles_vehicle_number_unique' AND c.contype = 'u'
      ) THEN 'EXISTS — must DROP CONSTRAINT ✗'
        ELSE 'GONE ✓' END
    WHEN 'old: STANDALONE UNIQUE INDEX' THEN
      CASE WHEN EXISTS (
        SELECT 1 FROM pg_indexes pi
        JOIN pg_class    ic ON ic.relname = pi.indexname AND ic.relkind = 'i'
        JOIN pg_namespace n  ON n.oid     = ic.relnamespace AND n.nspname = 'public'
        WHERE pi.schemaname = 'public' AND pi.tablename = 'vehicles'
          AND pi.indexname  = 'vehicles_vehicle_number_unique'
          AND NOT EXISTS (SELECT 1 FROM pg_constraint c2 WHERE c2.conindid = ic.oid)
      ) THEN 'EXISTS — must DROP INDEX ✗'
        ELSE 'GONE ✓' END
    WHEN 'new: COMPOSITE UNIQUE INDEX' THEN
      CASE WHEN EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'vehicles'
          AND indexname = 'vehicles_company_vehicle_number_unique'
      ) THEN 'EXISTS ✓'
        ELSE 'MISSING ✗' END
  END AS status
FROM (VALUES
  ('vehicles_vehicle_number_unique',          'old: UNIQUE CONSTRAINT'),
  ('vehicles_vehicle_number_unique',          'old: STANDALONE UNIQUE INDEX'),
  ('vehicles_company_vehicle_number_unique',  'new: COMPOSITE UNIQUE INDEX')
) AS obj(object_name, object_type)
ORDER BY obj.object_type;

-- ──────────────────────────────────────────────────────────────────
-- SECTION 8: Foreign key constraints on company_id columns
-- ──────────────────────────────────────────────────────────────────

SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name  AS references_table,
  ccu.column_name AS references_column,
  rc.delete_rule  AS on_delete
FROM information_schema.table_constraints  tc
JOIN information_schema.key_column_usage   kcu
  ON  kcu.constraint_name = tc.constraint_name
  AND kcu.table_schema    = tc.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON  ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc
  ON  rc.constraint_name   = tc.constraint_name
  AND rc.constraint_schema = tc.table_schema
WHERE tc.table_schema    = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name      IN ('subcontractors', 'vehicles')
  AND kcu.column_name    = 'company_id'
ORDER BY tc.table_name;

-- ──────────────────────────────────────────────────────────────────
-- SECTION 9: Data-layer counts + migration_state
-- Uses PL/pgSQL EXECUTE to avoid parse-time failure when company_id
-- is missing.  Results written to a TEMP TABLE so they appear in the
-- Results tab with no Messages tab dependency.
-- Returns one summary row.
-- ──────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS _b2_post_check_data;
CREATE TEMP TABLE _b2_post_check_data (
  migration_state                         TEXT,
  sub_company_id_column                   TEXT,
  veh_company_id_column                   TEXT,
  sub_total_rows                          BIGINT,
  sub_null_company_id                     TEXT,
  veh_total_rows                          BIGINT,
  veh_null_company_id                     TEXT,
  cross_company_responsible_worker        TEXT,
  cross_company_assigned_manager          TEXT,
  intra_company_vehicle_number_duplicates TEXT,
  action_required                         TEXT,
  -- Uniqueness object state (vehicles.vehicle_number global unique)
  old_veh_unique_constraint               BOOLEAN,
  old_veh_unique_index                    BOOLEAN,
  new_veh_company_unique                  BOOLEAN,
  -- Uniqueness object state (subcontractors — expected: all false)
  old_sub_unique_constraint               BOOLEAN,
  old_sub_unique_index                    BOOLEAN,
  new_sub_company_unique                  BOOLEAN
);

DO $$
DECLARE
  v_sub_cid_exists      BOOLEAN;
  v_veh_cid_exists      BOOLEAN;
  v_sub_total           BIGINT;
  v_sub_null_cid        BIGINT;
  v_veh_total           BIGINT;
  v_veh_null_cid        BIGINT;
  v_cross_resp          BIGINT;
  v_cross_mgr           BIGINT;
  v_dups                BIGINT;
  v_state               TEXT;
  v_action              TEXT;
  -- Uniqueness object state
  v_old_veh_constraint  BOOLEAN;
  v_old_veh_index       BOOLEAN;
  v_new_veh_composite   BOOLEAN;
  v_old_sub_constraint  BOOLEAN;
  v_old_sub_index       BOOLEAN;
  v_new_sub_composite   BOOLEAN;
BEGIN
  -- Column existence
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subcontractors' AND column_name = 'company_id'
  ) INTO v_sub_cid_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicles' AND column_name = 'company_id'
  ) INTO v_veh_cid_exists;

  -- Total counts (always safe — no company_id reference)
  SELECT COUNT(*) INTO v_sub_total FROM subcontractors;
  SELECT COUNT(*) INTO v_veh_total FROM vehicles;

  -- NULL counts via EXECUTE (avoids parse-time failure if column missing)
  IF v_sub_cid_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM subcontractors WHERE company_id IS NULL'
      INTO v_sub_null_cid;
  END IF;

  IF v_veh_cid_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM vehicles WHERE company_id IS NULL'
      INTO v_veh_null_cid;
  END IF;

  -- Cross-company responsible_worker_id
  IF v_sub_cid_exists THEN
    EXECUTE '
      SELECT COUNT(*) FROM subcontractors s
      JOIN workers w ON w.id = s.responsible_worker_id
      WHERE s.company_id IS NOT NULL
        AND w.company_id IS NOT NULL
        AND s.company_id != w.company_id
    ' INTO v_cross_resp;
  END IF;

  -- Cross-company assigned_manager_id
  IF v_veh_cid_exists THEN
    EXECUTE '
      SELECT COUNT(*) FROM vehicles v
      JOIN workers w ON w.id = v.assigned_manager_id
      WHERE v.company_id IS NOT NULL
        AND w.company_id IS NOT NULL
        AND v.company_id != w.company_id
    ' INTO v_cross_mgr;
  END IF;

  -- Intra-company duplicate vehicle_numbers (BLOCKED condition)
  IF v_veh_cid_exists THEN
    EXECUTE '
      SELECT COUNT(*) FROM (
        SELECT company_id, vehicle_number FROM vehicles
        WHERE company_id IS NOT NULL
        GROUP BY company_id, vehicle_number
        HAVING COUNT(*) > 1
      ) dups
    ' INTO v_dups;
  END IF;

  -- Uniqueness object checks (always safe — pg_constraint / pg_indexes only)

  -- Old vehicle UNIQUE CONSTRAINT (from migration_phase1.sql ADD CONSTRAINT)
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class     t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'vehicles'
      AND c.conname = 'vehicles_vehicle_number_unique'
      AND c.contype = 'u'
  ) INTO v_old_veh_constraint;

  -- Old vehicle standalone UNIQUE INDEX (not constraint-backed)
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
  ) INTO v_old_veh_index;

  -- New vehicle composite unique index (target state)
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'vehicles'
      AND indexname  = 'vehicles_company_vehicle_number_unique'
  ) INTO v_new_veh_composite;

  -- Any unexpected UNIQUE CONSTRAINT on subcontractors (should always be false)
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class     t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'subcontractors'
      AND c.contype = 'u'
  ) INTO v_old_sub_constraint;

  -- Any unexpected standalone UNIQUE INDEX on subcontractors (should always be false)
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes pi
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
  ) INTO v_old_sub_index;

  -- New subcontractor composite unique index (not created by this migration; should be false)
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'subcontractors'
      AND indexdef   LIKE 'CREATE UNIQUE INDEX%'
      AND indexdef   LIKE '%company_id%'
  ) INTO v_new_sub_composite;

  -- Determine migration_state (4 values)
  IF NOT v_sub_cid_exists AND NOT v_veh_cid_exists THEN
    v_state  := 'CLEAN PRE-MIGRATION';
    v_action := 'Transaction rolled back fully. Safe to re-run the migration.';

  ELSIF v_sub_cid_exists AND v_veh_cid_exists
    AND COALESCE(v_sub_null_cid, 1) = 0
    AND COALESCE(v_veh_null_cid, 1) = 0
    AND COALESCE(v_cross_resp, 0) = 0
    AND COALESCE(v_cross_mgr, 0) = 0
    AND EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'vehicles'
        AND indexname = 'vehicles_company_vehicle_number_unique'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'vehicles'
        AND indexname = 'vehicles_vehicle_number_unique'
    )
    AND EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'subcontractors'
        AND policyname = 'subcontractors_select_company'
    )
    AND EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'vehicles'
        AND policyname = 'vehicles_select_company'
    )
  THEN
    v_state  := 'MIGRATION COMPLETE';
    v_action := 'All columns, indexes, and policies in place. No action needed.';

  ELSIF v_veh_cid_exists AND COALESCE(v_dups, 0) > 0 THEN
    v_state  := 'BLOCKED';
    v_action := 'Duplicate vehicle_number(s) within a company prevent composite UNIQUE. '
             || 'Run: SELECT company_id, vehicle_number, COUNT(*) FROM vehicles '
             || 'GROUP BY company_id, vehicle_number HAVING COUNT(*) > 1;';

  ELSE
    v_state  := 'PARTIAL STATE';
    v_action := 'Some DDL committed before error. Do NOT re-run without DBA review. '
             || 'Inspect Sections 1-8 for exact state.';
  END IF;

  INSERT INTO _b2_post_check_data VALUES (
    v_state,
    CASE WHEN v_sub_cid_exists THEN 'EXISTS' ELSE 'MISSING' END,
    CASE WHEN v_veh_cid_exists THEN 'EXISTS' ELSE 'MISSING' END,
    v_sub_total,
    COALESCE(v_sub_null_cid::text, 'N/A (column missing)'),
    v_veh_total,
    COALESCE(v_veh_null_cid::text, 'N/A (column missing)'),
    COALESCE(v_cross_resp::text,   'N/A (column missing)'),
    COALESCE(v_cross_mgr::text,    'N/A (column missing)'),
    COALESCE(v_dups::text,         'N/A (column missing)'),
    v_action,
    v_old_veh_constraint,
    v_old_veh_index,
    v_new_veh_composite,
    v_old_sub_constraint,
    v_old_sub_index,
    v_new_sub_composite
  );
END $$;

SELECT * FROM _b2_post_check_data;

-- ──────────────────────────────────────────────────────────────────
-- SECTION 10: Active companies guard
-- Migration requires at least one active company for the backfill.
-- ──────────────────────────────────────────────────────────────────

SELECT
  id,
  name,
  is_active,
  CASE
    WHEN is_active = true THEN 'READY ✓'
    ELSE 'INACTIVE ✗ — check before running migration'
  END AS migration_prerequisite
FROM companies
WHERE is_active = true
ORDER BY created_at
LIMIT 1;

-- ──────────────────────────────────────────────────────────────────
-- SECTION 11: Profiles without active company membership
-- Purely informational — does not block migration.
-- ──────────────────────────────────────────────────────────────────

SELECT COUNT(*) AS profiles_without_company_membership
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM company_members cm
  WHERE cm.user_id  = p.id
    AND cm.is_active = true
);
