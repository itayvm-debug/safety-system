-- ============================================================================
-- Preview: Phase 2 Batch 2 — Subcontractors + Vehicles Tenant Isolation
-- mt_phase2_batch2_subcontractors_vehicles_preview.sql
--
-- READ-ONLY — SELECT statements + read-only DO block only.
-- אין לבצע SQL על Supabase Production ללא אישור מפורש.
-- Run this BEFORE the migration to understand current state.
-- Run it AGAIN AFTER migration to verify completion.
--
-- Results tab — two result sets, both visible with no Messages tab needed:
--
--   RESULT SET 1  (Section 1)  — system-catalog state
--     Single wide row: table existence, column existence, nullability,
--     index state, FK existence, company counts, policy state, indexes.
--     All queries use information_schema / pg_catalog only — safe at any state.
--
--   RESULT SET 2  (Section 2)  — data-layer state + migration_state
--     Single wide row: migration_state (4-value including BLOCKED),
--     plus null-count, cross-company link, and duplicate checks.
--     Uses PL/pgSQL EXECUTE via a temp table to avoid parse-time failure
--     when company_id does not yet exist on subcontractors or vehicles.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 1: System-catalog state (safe at all times)
-- ────────────────────────────────────────────────────────────────────────────

SELECT
  -- ─── Table existence ────────────────────────────────────────────────────
  (SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subcontractors'
  ))::boolean                                          AS subcontractors_table_exists,

  (SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vehicles'
  ))::boolean                                          AS vehicles_table_exists,

  (SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'companies'
  ))::boolean                                          AS companies_table_exists,

  -- ─── Row counts ─────────────────────────────────────────────────────────
  (SELECT COUNT(*) FROM subcontractors)::bigint        AS subcontractors_total_rows,
  (SELECT COUNT(*) FROM vehicles)::bigint              AS vehicles_total_rows,
  (SELECT COUNT(*) FROM vehicle_licenses)::bigint      AS vehicle_licenses_total_rows,
  (SELECT COUNT(*) FROM vehicle_insurances)::bigint    AS vehicle_insurances_total_rows,

  -- ─── company_id column existence ─────────────────────────────────────────
  (SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'subcontractors'
      AND column_name  = 'company_id'
  ))::boolean                                          AS subcontractors_has_company_id,

  (SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'vehicles'
      AND column_name  = 'company_id'
  ))::boolean                                          AS vehicles_has_company_id,

  -- ─── company_id NOT NULL ─────────────────────────────────────────────────
  (SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'subcontractors' AND column_name = 'company_id'
    ) THEN 'column_missing'
    WHEN (SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'subcontractors' AND column_name = 'company_id')
         = 'NO' THEN 'not_null'
    ELSE 'nullable'
  END)                                                 AS subcontractors_company_id_null_constraint,

  (SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'vehicles' AND column_name = 'company_id'
    ) THEN 'column_missing'
    WHEN (SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'vehicles' AND column_name = 'company_id')
         = 'NO' THEN 'not_null'
    ELSE 'nullable'
  END)                                                 AS vehicles_company_id_null_constraint,

  -- ─── Global uniqueness object type (vehicles.vehicle_number) ─────────────
  -- Reports: UNIQUE CONSTRAINT / STANDALONE UNIQUE INDEX / BOTH / NONE
  -- UNIQUE CONSTRAINT was created by migration_phase1.sql via ADD CONSTRAINT.
  --   → DROP INDEX fails (2BP01). Requires ALTER TABLE DROP CONSTRAINT.
  -- STANDALONE UNIQUE INDEX was created via CREATE UNIQUE INDEX.
  --   → DROP INDEX is valid. DROP CONSTRAINT would fail.
  -- NONE → already removed (post-migration) or never existed.
  (SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class     t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = 'vehicles'
        AND c.conname = 'vehicles_vehicle_number_unique' AND c.contype = 'u'
    ) AND EXISTS (
      SELECT 1 FROM pg_indexes pi
      JOIN pg_class    ic ON ic.relname = pi.indexname AND ic.relkind = 'i'
      JOIN pg_namespace n  ON n.oid     = ic.relnamespace AND n.nspname = 'public'
      WHERE pi.schemaname = 'public' AND pi.tablename = 'vehicles'
        AND pi.indexname  = 'vehicles_vehicle_number_unique'
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c2 WHERE c2.conindid = ic.oid)
    ) THEN 'BOTH (constraint + standalone index)'
    WHEN EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class     t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = 'vehicles'
        AND c.conname = 'vehicles_vehicle_number_unique' AND c.contype = 'u'
    ) THEN 'UNIQUE CONSTRAINT'
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes pi
      JOIN pg_class    ic ON ic.relname = pi.indexname AND ic.relkind = 'i'
      JOIN pg_namespace n  ON n.oid     = ic.relnamespace AND n.nspname = 'public'
      WHERE pi.schemaname = 'public' AND pi.tablename = 'vehicles'
        AND pi.indexname  = 'vehicles_vehicle_number_unique'
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c2 WHERE c2.conindid = ic.oid)
    ) THEN 'STANDALONE UNIQUE INDEX'
    ELSE 'NONE'
  END)                                                 AS vehicles_global_unique_type,

  -- ─── Subcontractors uniqueness type ──────────────────────────────────────
  -- migration_subcontractors.sql added no unique constraint on any business
  -- identifier. Expected value: NONE. Any other value is unexpected.
  (SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class     t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = 'subcontractors'
        AND c.contype = 'u'
    ) THEN 'UNEXPECTED UNIQUE CONSTRAINT'
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes pi
      JOIN pg_class    ic ON ic.relname = pi.indexname AND ic.relkind = 'i'
      JOIN pg_namespace n  ON n.oid     = ic.relnamespace AND n.nspname = 'public'
      WHERE pi.schemaname = 'public' AND pi.tablename = 'subcontractors'
        AND pi.indexdef   LIKE 'CREATE UNIQUE INDEX%'
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c2 WHERE c2.conindid = ic.oid)
    ) THEN 'UNEXPECTED STANDALONE UNIQUE INDEX'
    ELSE 'NONE (expected)'
  END)                                                 AS subcontractors_global_unique_type,

  -- ─── Composite unique index (target state) ───────────────────────────────
  (SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'vehicles'
      AND indexname  = 'vehicles_company_vehicle_number_unique'
  ))::boolean                                          AS vehicles_composite_unique_exists,

  -- ─── FK: subcontractors → companies ──────────────────────────────────────
  (SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema   = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
      AND tc.table_schema   = rc.constraint_schema
    JOIN information_schema.table_constraints tc2
      ON rc.unique_constraint_name   = tc2.constraint_name
      AND rc.unique_constraint_schema = tc2.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name      = 'subcontractors'
      AND kcu.column_name    = 'company_id'
      AND tc2.table_name     = 'companies'
  ))::boolean                                          AS subcontractors_fk_to_companies,

  (SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema   = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
      AND tc.table_schema   = rc.constraint_schema
    JOIN information_schema.table_constraints tc2
      ON rc.unique_constraint_name   = tc2.constraint_name
      AND rc.unique_constraint_schema = tc2.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name      = 'vehicles'
      AND kcu.column_name    = 'company_id'
      AND tc2.table_name     = 'companies'
  ))::boolean                                          AS vehicles_fk_to_companies,

  -- ─── Active companies ─────────────────────────────────────────────────────
  (SELECT COUNT(*) FROM companies WHERE is_active = true)::int
                                                       AS active_company_count,

  (SELECT id FROM companies WHERE is_active = true ORDER BY created_at LIMIT 1)::text
                                                       AS default_company_id,

  -- ─── RLS policies ────────────────────────────────────────────────────────
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'subcontractors')::int
                                                       AS subcontractors_policy_count,

  (SELECT array_to_string(array_agg(policyname ORDER BY policyname), ' | ')
   FROM pg_policies WHERE tablename = 'subcontractors')::text
                                                       AS subcontractors_policy_names,

  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'vehicles')::int
                                                       AS vehicles_policy_count,

  (SELECT array_to_string(array_agg(policyname ORDER BY policyname), ' | ')
   FROM pg_policies WHERE tablename = 'vehicles')::text
                                                       AS vehicles_policy_names,

  -- ─── Profiles without active company membership ──────────────────────────
  (SELECT COUNT(*) FROM profiles p
   WHERE p.is_active = true
     AND NOT EXISTS (
       SELECT 1 FROM company_members cm
       WHERE cm.user_id  = p.id
         AND cm.is_active = true
     ))::bigint                                        AS profiles_without_active_membership,

  -- ─── Indexes ─────────────────────────────────────────────────────────────
  (SELECT array_to_string(
     array_agg(indexname || ': ' || indexdef ORDER BY indexname), ' || '
   )
   FROM pg_indexes
   WHERE tablename = 'subcontractors')::text           AS subcontractors_indexes,

  (SELECT array_to_string(
     array_agg(indexname || ': ' || indexdef ORDER BY indexname), ' || '
   )
   FROM pg_indexes
   WHERE tablename = 'vehicles')::text                 AS vehicles_indexes;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 2: Data-layer state + migration_state  (Results tab, no NOTICE needed)
--
-- Plain SQL cannot reference vehicles.company_id or subcontractors.company_id
-- when those columns may not yet exist — all branches of a CASE expression are
-- resolved at parse time, not at runtime.  PL/pgSQL EXECUTE defers compilation
-- to execution time, so each query is only parsed when the branch runs and the
-- column is guaranteed to be present.
--
-- Technique: DO block writes one row into a TEMP TABLE; final SELECT reads it.
-- migration_state has 4 possible values:
--   CLEAN PRE-MIGRATION  — neither company_id column exists yet; safe to run
--   MIGRATION COMPLETE   — all DDL + indexes + policies in place
--   BLOCKED              — company_id added but intra-company vehicle_number
--                          duplicates prevent the composite UNIQUE index
--   PARTIAL STATE        — something in between; inspect Section 1 carefully
-- ────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS _b2_preview_data;
CREATE TEMP TABLE _b2_preview_data (
  migration_state                         TEXT,
  sub_null_company_id_count               TEXT,
  veh_null_company_id_count               TEXT,
  cross_company_responsible_worker_count  TEXT,
  cross_company_assigned_manager_count    TEXT,
  intra_company_vehicle_number_duplicates TEXT,
  cross_company_shared_vehicle_numbers    TEXT
);

DO $$
DECLARE
  v_sub_has_cid  BOOLEAN;
  v_veh_has_cid  BOOLEAN;
  v_sub_null     BIGINT;
  v_veh_null     BIGINT;
  v_cross_resp   BIGINT;
  v_cross_mgr    BIGINT;
  v_dups         BIGINT;
  v_cross_veh    BIGINT;
  v_state        TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subcontractors' AND column_name = 'company_id'
  ) INTO v_sub_has_cid;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicles' AND column_name = 'company_id'
  ) INTO v_veh_has_cid;

  -- NULL company_id counts
  IF v_sub_has_cid THEN
    EXECUTE 'SELECT COUNT(*) FROM subcontractors WHERE company_id IS NULL' INTO v_sub_null;
  END IF;

  IF v_veh_has_cid THEN
    EXECUTE 'SELECT COUNT(*) FROM vehicles WHERE company_id IS NULL' INTO v_veh_null;
  END IF;

  -- Cross-company responsible_worker_id
  IF v_sub_has_cid THEN
    EXECUTE '
      SELECT COUNT(*) FROM subcontractors s
      JOIN workers w ON w.id = s.responsible_worker_id
      WHERE s.company_id IS NOT NULL
        AND w.company_id IS NOT NULL
        AND s.company_id != w.company_id
    ' INTO v_cross_resp;
  END IF;

  -- Cross-company assigned_manager_id
  IF v_veh_has_cid THEN
    EXECUTE '
      SELECT COUNT(*) FROM vehicles v
      JOIN workers w ON w.id = v.assigned_manager_id
      WHERE v.company_id IS NOT NULL
        AND w.company_id IS NOT NULL
        AND v.company_id != w.company_id
    ' INTO v_cross_mgr;
  END IF;

  -- Intra-company duplicate vehicle_numbers (would block composite UNIQUE)
  IF v_veh_has_cid THEN
    EXECUTE '
      SELECT COUNT(*) FROM (
        SELECT company_id, vehicle_number FROM vehicles
        WHERE company_id IS NOT NULL
        GROUP BY company_id, vehicle_number
        HAVING COUNT(*) > 1
      ) dups
    ' INTO v_dups;
  END IF;

  -- Cross-company shared vehicle_numbers (informational — allowed post-migration)
  IF v_veh_has_cid THEN
    EXECUTE '
      SELECT COUNT(*) FROM (
        SELECT vehicle_number FROM vehicles
        GROUP BY vehicle_number HAVING COUNT(DISTINCT company_id) > 1
      ) x
    ' INTO v_cross_veh;
  END IF;

  -- ─── Determine migration_state (4 values) ─────────────────────────────────
  IF NOT v_sub_has_cid AND NOT v_veh_has_cid THEN
    v_state := 'CLEAN PRE-MIGRATION';

  ELSIF v_sub_has_cid AND v_veh_has_cid
    AND COALESCE(v_sub_null, 0) = 0
    AND COALESCE(v_veh_null, 0) = 0
    AND COALESCE(v_cross_resp, 0) = 0
    AND COALESCE(v_cross_mgr, 0) = 0
    AND (SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'subcontractors'
           AND column_name = 'company_id') = 'NO'
    AND (SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'vehicles'
           AND column_name = 'company_id') = 'NO'
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
    v_state := 'MIGRATION COMPLETE';

  ELSIF v_veh_has_cid AND COALESCE(v_dups, 0) > 0 THEN
    v_state := 'BLOCKED';

  ELSE
    v_state := 'PARTIAL STATE';
  END IF;

  INSERT INTO _b2_preview_data VALUES (
    v_state,
    COALESCE(v_sub_null::text,   'N/A (column missing)'),
    COALESCE(v_veh_null::text,   'N/A (column missing)'),
    COALESCE(v_cross_resp::text, 'N/A (column missing)'),
    COALESCE(v_cross_mgr::text,  'N/A (column missing)'),
    COALESCE(v_dups::text,       'N/A (column missing)'),
    COALESCE(v_cross_veh::text,  'N/A (column missing)')
  );
END $$;

SELECT * FROM _b2_preview_data;
