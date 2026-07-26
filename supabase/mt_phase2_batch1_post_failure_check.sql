-- ================================================================
-- mt_phase2_batch1_post_failure_check.sql
--
-- Read-only state diagnostic for Phase 2 Batch 1.
-- Run after any failure to determine the exact database state.
-- SAFE at ALL states: pre-migration, partial, or fully applied.
--
-- Contains NO INSERT / UPDATE / DELETE / DROP / ALTER.
-- The DO block is PL/pgSQL only for conditional column access
-- (EXECUTE avoids parse-time failure if company_id is missing).
--
-- Interpretation guide:
--   CLEAN PRE-MIGRATION  → transaction rolled back fully; safe to re-run migration
--   MIGRATION COMPLETE   → all columns, policies, indexes in place; no action needed
--   PARTIAL STATE        → some DDL committed before error; contact DBA before re-running
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- SECTION 1: Column existence + nullable status
-- (always safe, sourced from information_schema)
-- ──────────────────────────────────────────────────────────────────

SELECT
  t.table_name,
  t.column_name,
  CASE WHEN t.column_name IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END AS column_status,
  t.data_type,
  t.is_nullable,
  t.column_default
FROM (
  SELECT
    col.table_name,
    col.column_name,
    col.data_type,
    col.is_nullable,
    col.column_default
  FROM information_schema.columns col
  WHERE col.table_schema = 'public'
    AND (
         (col.table_name = 'workers'   AND col.column_name = 'company_id')
      OR (col.table_name = 'documents' AND col.column_name = 'company_id')
      OR (col.table_name = 'companies' AND col.column_name = 'settings')
    )
) t
ORDER BY t.table_name, t.column_name;

-- ──────────────────────────────────────────────────────────────────
-- SECTION 2: Row totals — no company_id reference (always safe)
-- ──────────────────────────────────────────────────────────────────

SELECT
  'workers'         AS table_name, COUNT(*) AS row_count FROM workers
UNION ALL SELECT
  'documents',       COUNT(*) FROM documents
UNION ALL SELECT
  'companies',       COUNT(*) FROM companies
UNION ALL SELECT
  'company_members', COUNT(*) FROM company_members
ORDER BY table_name;

-- ──────────────────────────────────────────────────────────────────
-- SECTION 3: RLS enablement on workers + documents
-- (always safe, sourced from pg_class)
-- ──────────────────────────────────────────────────────────────────

SELECT
  c.relname              AS table_name,
  c.relrowsecurity       AS rls_enabled,
  c.relforcerowsecurity  AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('workers', 'documents')
ORDER BY c.relname;

-- ──────────────────────────────────────────────────────────────────
-- SECTION 4: All RLS policies on workers + documents
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
  AND tablename IN ('workers', 'documents')
ORDER BY tablename, policyname;

-- ──────────────────────────────────────────────────────────────────
-- SECTION 5: Expected new policy existence (5 per table = 10 total)
-- ──────────────────────────────────────────────────────────────────

SELECT
  expected.tablename,
  expected.policyname,
  CASE WHEN p.policyname IS NOT NULL THEN 'EXISTS ✓' ELSE 'MISSING ✗' END AS status
FROM (VALUES
  ('workers',   'workers_select_company'),
  ('workers',   'workers_insert_company'),
  ('workers',   'workers_update_company'),
  ('workers',   'workers_delete_company'),
  ('workers',   'workers_service_all'),
  ('documents', 'documents_select_company'),
  ('documents', 'documents_insert_company'),
  ('documents', 'documents_update_company'),
  ('documents', 'documents_delete_company'),
  ('documents', 'documents_service_all')
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
  AND tablename IN ('workers', 'documents')
  AND policyname IN (
    'authenticated users can manage workers',
    'authenticated users can manage documents'
  );

-- (0 rows = correct post-migration state; rows = pre- or partial state)

-- ──────────────────────────────────────────────────────────────────
-- SECTION 7: Indexes
-- ──────────────────────────────────────────────────────────────────

SELECT
  expected.indexname,
  expected.tablename,
  CASE WHEN i.indexname IS NOT NULL THEN 'EXISTS ✓' ELSE 'MISSING ✗' END AS status,
  i.indexdef
FROM (VALUES
  ('idx_workers_company_id',   'workers'),
  ('idx_documents_company_id', 'documents')
) AS expected(indexname, tablename)
LEFT JOIN pg_indexes i
  ON  i.schemaname = 'public'
  AND i.tablename  = expected.tablename
  AND i.indexname  = expected.indexname
ORDER BY expected.tablename;

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
  ON  rc.constraint_name  = tc.constraint_name
  AND rc.constraint_schema = tc.table_schema
WHERE tc.table_schema    = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name      IN ('workers', 'documents')
  AND kcu.column_name    = 'company_id'
ORDER BY tc.table_name;

-- ──────────────────────────────────────────────────────────────────
-- SECTION 9: NULL company_id counts + orphan check
-- Uses PL/pgSQL EXECUTE to safely handle the column-missing case.
-- (read-only: only SELECT and RAISE NOTICE — no data modification)
-- ──────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_workers_cid_exists   BOOLEAN;
  v_documents_cid_exists BOOLEAN;
  v_workers_total        BIGINT;
  v_workers_null_cid     BIGINT;
  v_documents_total      BIGINT;
  v_documents_null_cid   BIGINT;
  v_orphan_docs          BIGINT;
  v_company_mismatch     BIGINT;
BEGIN
  -- Column existence
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='workers' AND column_name='company_id'
  ) INTO v_workers_cid_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='documents' AND column_name='company_id'
  ) INTO v_documents_cid_exists;

  -- Total counts (always safe)
  SELECT COUNT(*) INTO v_workers_total   FROM workers;
  SELECT COUNT(*) INTO v_documents_total FROM documents;

  -- NULL counts via dynamic SQL (avoids parse-time failure if column missing)
  IF v_workers_cid_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM workers WHERE company_id IS NULL'
      INTO v_workers_null_cid;
  END IF;

  IF v_documents_cid_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM documents WHERE company_id IS NULL'
      INTO v_documents_null_cid;
  END IF;

  -- Orphan documents (documents whose worker_id has no matching worker)
  IF v_documents_cid_exists THEN
    EXECUTE '
      SELECT COUNT(*)
      FROM documents d
      WHERE NOT EXISTS (SELECT 1 FROM workers w WHERE w.id = d.worker_id)
    ' INTO v_orphan_docs;
  END IF;

  -- company_id mismatch: document.company_id != worker.company_id
  IF v_workers_cid_exists AND v_documents_cid_exists THEN
    EXECUTE '
      SELECT COUNT(*)
      FROM documents d
      JOIN workers w ON w.id = d.worker_id
      WHERE d.company_id IS DISTINCT FROM w.company_id
    ' INTO v_company_mismatch;
  END IF;

  -- Report
  RAISE NOTICE '══════════════════════════════════════════════════════';
  RAISE NOTICE 'Phase 2 Batch 1 — Post-Failure State Diagnostic';
  RAISE NOTICE '══════════════════════════════════════════════════════';
  RAISE NOTICE 'workers.company_id  column: %', CASE WHEN v_workers_cid_exists   THEN 'EXISTS' ELSE 'MISSING' END;
  RAISE NOTICE 'documents.company_id column: %', CASE WHEN v_documents_cid_exists THEN 'EXISTS' ELSE 'MISSING' END;
  RAISE NOTICE '';
  RAISE NOTICE 'workers  total: %  |  NULL company_id: %',
    v_workers_total,
    COALESCE(v_workers_null_cid::text,  'N/A (column missing)');
  RAISE NOTICE 'documents total: % |  NULL company_id: %',
    v_documents_total,
    COALESCE(v_documents_null_cid::text, 'N/A (column missing)');
  RAISE NOTICE 'orphan documents (no matching worker): %',
    COALESCE(v_orphan_docs::text,     'N/A (column missing)');
  RAISE NOTICE 'company_id mismatch (doc != worker):  %',
    COALESCE(v_company_mismatch::text, 'N/A (column missing)');
  RAISE NOTICE '';

  -- Interpretation
  RAISE NOTICE '--- INTERPRETATION ---';
  IF NOT v_workers_cid_exists AND NOT v_documents_cid_exists THEN
    RAISE NOTICE 'STATE: CLEAN PRE-MIGRATION — no company_id columns found.';
    RAISE NOTICE '       Transaction rolled back fully. Safe to re-run the migration.';
  ELSIF v_workers_cid_exists AND v_documents_cid_exists
    AND COALESCE(v_workers_null_cid, 1) = 0
    AND COALESCE(v_documents_null_cid, 1) = 0
    AND COALESCE(v_orphan_docs, 1) = 0
    AND COALESCE(v_company_mismatch, 1) = 0
  THEN
    RAISE NOTICE 'STATE: DATA LOOKS COMPLETE — all company_id values are populated.';
    RAISE NOTICE '       Verify policies and indexes in Sections 4–7 to confirm full migration.';
  ELSIF v_workers_cid_exists OR v_documents_cid_exists THEN
    RAISE NOTICE 'STATE: PARTIAL — some DDL was committed before the error.';
    RAISE NOTICE '       CAUTION: do NOT re-run the migration without DBA review.';
    RAISE NOTICE '       Review Sections 1-8 output for exact state.';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- SECTION 10: Default company guard
-- Migration requires this row to exist and be active.
-- ──────────────────────────────────────────────────────────────────

SELECT
  id,
  name,
  is_active,
  CASE
    WHEN id = '00000000-0000-0000-0000-000000000001' AND is_active = true
    THEN 'READY ✓'
    ELSE 'PROBLEM ✗ — check before running migration'
  END AS migration_prerequisite
FROM companies
WHERE id = '00000000-0000-0000-0000-000000000001';

-- ──────────────────────────────────────────────────────────────────
-- SECTION 11: Unmapped profiles (users with no company_member row)
-- Purely informational — does not block migration.
-- ──────────────────────────────────────────────────────────────────

SELECT COUNT(*) AS profiles_without_company_membership
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM company_members cm
  WHERE cm.user_id = p.id
    AND cm.is_active = true
);
