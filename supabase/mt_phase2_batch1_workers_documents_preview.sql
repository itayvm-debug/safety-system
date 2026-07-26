-- ================================================================
-- mt_phase2_batch1_workers_documents_preview.sql
-- Read-only diagnostic — SELECT only, no DDL, no DML.
-- Safe to run at any time. Run this BEFORE the migration.
-- ================================================================

-- ── 1. Current state of workers and documents columns ─────────────

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('workers', 'documents', 'companies')
ORDER BY table_name, ordinal_position;

-- ── 2. Existing RLS policies on workers and documents ─────────────

SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('workers', 'documents')
ORDER BY tablename, policyname;

-- ── 3. Row counts ─────────────────────────────────────────────────

SELECT
  'workers'   AS table_name, count(*) AS total_rows,
  count(*) FILTER (WHERE is_active = true)   AS active,
  count(*) FILTER (WHERE is_archived = true) AS archived
FROM workers
UNION ALL
SELECT
  'documents', count(*), null, null
FROM documents
UNION ALL
SELECT
  'companies', count(*), null, null
FROM companies;

-- ── 4. Does workers.company_id already exist? ─────────────────────

DO $$
DECLARE
  v_workers_has_cid  BOOLEAN;
  v_docs_has_cid     BOOLEAN;
  v_companies_has_settings BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workers'
      AND column_name = 'company_id'
  ) INTO v_workers_has_cid;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'documents'
      AND column_name = 'company_id'
  ) INTO v_docs_has_cid;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies'
      AND column_name = 'settings'
  ) INTO v_companies_has_settings;

  RAISE NOTICE '====== Phase 2 Batch 1 Pre-Migration State ======';
  RAISE NOTICE 'workers.company_id exists    : %', v_workers_has_cid;
  RAISE NOTICE 'documents.company_id exists  : %', v_docs_has_cid;
  RAISE NOTICE 'companies.settings exists    : %', v_companies_has_settings;
  RAISE NOTICE '';

  IF v_workers_has_cid THEN
    RAISE NOTICE 'workers.company_id already exists — migration will be IDEMPOTENT';
  ELSE
    RAISE NOTICE 'workers.company_id MISSING — migration will ADD the column';
  END IF;

  IF v_docs_has_cid THEN
    RAISE NOTICE 'documents.company_id already exists — migration will be IDEMPOTENT';
  ELSE
    RAISE NOTICE 'documents.company_id MISSING — migration will ADD the column';
  END IF;

  RAISE NOTICE '=================================================';
END $$;

-- ── 5. Orphan check: documents without a matching worker ──────────

SELECT count(*) AS orphan_documents
FROM documents d
WHERE NOT EXISTS (
  SELECT 1 FROM workers w WHERE w.id = d.worker_id
);

-- ── 6. Default company exists? ────────────────────────────────────

SELECT id, name, slug, is_active
FROM companies
WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;

-- ── 7. All profiles have company_members row? ─────────────────────

SELECT count(*) AS unmapped_profiles
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM company_members cm WHERE cm.user_id = p.id AND cm.is_active = true
);

-- ── 8. Summary of expected migration impact ───────────────────────

SELECT
  (SELECT count(*) FROM workers)   AS workers_to_backfill,
  (SELECT count(*) FROM documents) AS documents_to_backfill;
