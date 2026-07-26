-- ================================================================
-- Multi-Tenant Phase 2, Batch 1: Workers + Documents Tenant Isolation
-- mt_phase2_batch1_workers_documents.sql
--
-- Changes in this migration:
--   1. companies: ADD COLUMN settings JSONB DEFAULT '{}'
--   2. workers:   ADD COLUMN company_id UUID REFERENCES companies(id)
--                  nullable → backfill → NOT NULL
--   3. documents: ADD COLUMN company_id UUID REFERENCES companies(id)
--                  nullable → backfill from parent worker → NOT NULL
--   4. workers:   DROP old "authenticated users can manage workers" policy
--                 CREATE 5 company-scoped policies (+ service_role)
--   5. documents: DROP old "authenticated users can manage documents" policy
--                 CREATE 5 company-scoped policies (+ service_role)
--   6. Indexes on workers.company_id and documents.company_id
--   7. Verification assertions
--
-- Safety:
--   • Wrapped in explicit BEGIN / COMMIT.
--   • Supabase SQL Editor wraps the whole paste in one implicit transaction
--     anyway, but the explicit markers document intent.
--   • All DDL uses IF NOT EXISTS / IF EXISTS for idempotency.
--   • Backfill uses ON CONFLICT DO NOTHING equivalent (WHERE ... IS NULL).
--   • Verification DO $$ block raises EXCEPTION on any failure → rollback.
--
-- ⚠️  Run mt_phase2_batch1_workers_documents_preview.sql first.
-- ⚠️  Do NOT run on Production until all local checks pass.
-- ================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────
-- STEP 1: Schema guard
-- ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- companies must exist (Phase 1 prerequisite)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'companies'
  ) THEN
    RAISE EXCEPTION
      'PREREQUISITE FAILED: companies table does not exist. '
      'Run mt_phase1_companies.sql first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'company_members'
  ) THEN
    RAISE EXCEPTION
      'PREREQUISITE FAILED: company_members table does not exist. '
      'Run mt_phase1_companies.sql first.';
  END IF;

  -- Default company must exist
  IF NOT EXISTS (
    SELECT 1 FROM companies
    WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
      AND is_active = true
  ) THEN
    RAISE EXCEPTION
      'PREREQUISITE FAILED: default company (00000000-0000-0000-0000-000000000001) '
      'is missing or inactive. Inspect companies table.';
  END IF;

  RAISE NOTICE 'Schema guard passed — Phase 1 tables and default company verified.';
END $$;

-- ──────────────────────────────────────────────────────────────────
-- STEP 2: companies — add settings JSONB column
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ──────────────────────────────────────────────────────────────────
-- STEP 3: workers — add company_id (nullable first)
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS company_id UUID
    REFERENCES companies(id) ON DELETE RESTRICT;

-- ──────────────────────────────────────────────────────────────────
-- STEP 4: workers — backfill company_id from default company
-- All existing workers belong to the one default company.
-- ──────────────────────────────────────────────────────────────────

UPDATE workers
SET    company_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE  company_id IS NULL;

-- ──────────────────────────────────────────────────────────────────
-- STEP 5: workers — make company_id NOT NULL after backfill
-- ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Only alter if column currently allows NULL (idempotent)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workers'
      AND column_name = 'company_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE workers ALTER COLUMN company_id SET NOT NULL;
    RAISE NOTICE 'workers.company_id set NOT NULL';
  ELSE
    RAISE NOTICE 'workers.company_id already NOT NULL — skipped';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- STEP 6: documents — add company_id (nullable first)
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS company_id UUID
    REFERENCES companies(id) ON DELETE RESTRICT;

-- ──────────────────────────────────────────────────────────────────
-- STEP 7: documents — backfill company_id from parent worker
-- ──────────────────────────────────────────────────────────────────

UPDATE documents d
SET    company_id = w.company_id
FROM   workers w
WHERE  d.worker_id = w.id
  AND  d.company_id IS NULL;

-- ──────────────────────────────────────────────────────────────────
-- STEP 8: documents — make company_id NOT NULL after backfill
-- ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'documents'
      AND column_name = 'company_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE documents ALTER COLUMN company_id SET NOT NULL;
    RAISE NOTICE 'documents.company_id set NOT NULL';
  ELSE
    RAISE NOTICE 'documents.company_id already NOT NULL — skipped';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- STEP 9: Indexes
-- ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_workers_company_id   ON workers(company_id);
CREATE INDEX IF NOT EXISTS idx_documents_company_id ON documents(company_id);

-- ──────────────────────────────────────────────────────────────────
-- STEP 10: workers RLS — drop old blanket policy, add company-scoped
--
-- RLS DESIGN:
--   Authenticated users can only access workers belonging to a company
--   they are an active member of. The subquery reads company_members
--   which has its own policy (user_id = auth.uid()) — no recursion.
--   All application routes use service_role (bypasses RLS already),
--   but these policies provide defence-in-depth.
-- ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "authenticated users can manage workers" ON workers;

DROP POLICY IF EXISTS "workers_select_company"  ON workers;
DROP POLICY IF EXISTS "workers_insert_company"  ON workers;
DROP POLICY IF EXISTS "workers_update_company"  ON workers;
DROP POLICY IF EXISTS "workers_delete_company"  ON workers;
DROP POLICY IF EXISTS "workers_service_all"     ON workers;

CREATE POLICY "workers_select_company"
  ON workers FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_members
       WHERE user_id   = auth.uid()
         AND is_active = true
    )
  );

CREATE POLICY "workers_insert_company"
  ON workers FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members
       WHERE user_id   = auth.uid()
         AND is_active = true
    )
  );

CREATE POLICY "workers_update_company"
  ON workers FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_members
       WHERE user_id   = auth.uid()
         AND is_active = true
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members
       WHERE user_id   = auth.uid()
         AND is_active = true
    )
  );

CREATE POLICY "workers_delete_company"
  ON workers FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_members
       WHERE user_id   = auth.uid()
         AND is_active = true
    )
  );

CREATE POLICY "workers_service_all"
  ON workers FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────
-- STEP 11: documents RLS — drop old blanket policy, add company-scoped
-- ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "authenticated users can manage documents" ON documents;

DROP POLICY IF EXISTS "documents_select_company"  ON documents;
DROP POLICY IF EXISTS "documents_insert_company"  ON documents;
DROP POLICY IF EXISTS "documents_update_company"  ON documents;
DROP POLICY IF EXISTS "documents_delete_company"  ON documents;
DROP POLICY IF EXISTS "documents_service_all"     ON documents;

CREATE POLICY "documents_select_company"
  ON documents FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_members
       WHERE user_id   = auth.uid()
         AND is_active = true
    )
  );

CREATE POLICY "documents_insert_company"
  ON documents FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members
       WHERE user_id   = auth.uid()
         AND is_active = true
    )
  );

CREATE POLICY "documents_update_company"
  ON documents FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_members
       WHERE user_id   = auth.uid()
         AND is_active = true
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members
       WHERE user_id   = auth.uid()
         AND is_active = true
    )
  );

CREATE POLICY "documents_delete_company"
  ON documents FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_members
       WHERE user_id   = auth.uid()
         AND is_active = true
    )
  );

CREATE POLICY "documents_service_all"
  ON documents FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────
-- STEP 12: Verification assertions
-- ──────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_workers_with_cid     INT;
  v_workers_total        INT;
  v_docs_with_cid        INT;
  v_docs_total           INT;
  v_orphan_docs          INT;
  v_workers_nullable     BOOLEAN;
  v_docs_nullable        BOOLEAN;
  v_has_settings_col     BOOLEAN;
BEGIN
  SELECT count(*) INTO v_workers_total FROM workers;
  SELECT count(*) INTO v_workers_with_cid FROM workers WHERE company_id IS NOT NULL;

  SELECT count(*) INTO v_docs_total FROM documents;
  SELECT count(*) INTO v_docs_with_cid FROM documents WHERE company_id IS NOT NULL;

  -- Documents without a valid worker (orphans)
  SELECT count(*) INTO v_orphan_docs
  FROM documents d
  WHERE NOT EXISTS (SELECT 1 FROM workers w WHERE w.id = d.worker_id);

  SELECT (is_nullable = 'YES') INTO v_workers_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'workers' AND column_name = 'company_id';

  SELECT (is_nullable = 'YES') INTO v_docs_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'company_id';

  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies'
      AND column_name = 'settings'
  ) INTO v_has_settings_col;

  -- Assert
  IF v_workers_with_cid <> v_workers_total THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % of % workers have company_id NULL after backfill.',
      (v_workers_total - v_workers_with_cid), v_workers_total;
  END IF;

  IF v_docs_with_cid <> v_docs_total THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % of % documents have company_id NULL after backfill.',
      (v_docs_total - v_docs_with_cid), v_docs_total;
  END IF;

  IF v_orphan_docs > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % documents have no matching worker row.',
      v_orphan_docs;
  END IF;

  IF v_workers_nullable IS TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: workers.company_id is still nullable.';
  END IF;

  IF v_docs_nullable IS TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: documents.company_id is still nullable.';
  END IF;

  IF NOT v_has_settings_col THEN
    RAISE EXCEPTION 'ASSERTION FAILED: companies.settings column is missing.';
  END IF;

  -- Policy assertions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workers'
      AND policyname = 'workers_select_company'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: workers_select_company policy missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'documents'
      AND policyname = 'documents_select_company'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: documents_select_company policy missing.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workers'
      AND policyname = 'authenticated users can manage workers'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: old workers blanket policy was not dropped.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'documents'
      AND policyname = 'authenticated users can manage documents'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: old documents blanket policy was not dropped.';
  END IF;

  -- Index assertions
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'workers'
      AND indexname = 'idx_workers_company_id'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: idx_workers_company_id missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'documents'
      AND indexname = 'idx_documents_company_id'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: idx_documents_company_id missing.';
  END IF;

  RAISE NOTICE
    'ALL ASSERTIONS PASSED: '
    'workers=%/% | documents=%/% | orphan_docs=0 | '
    'workers.company_id NOT NULL | documents.company_id NOT NULL | '
    'companies.settings EXISTS | new RLS policies in place',
    v_workers_with_cid, v_workers_total,
    v_docs_with_cid, v_docs_total;
END $$;

-- Final readable summary
SELECT
  (SELECT count(*) FROM workers)                                       AS workers_total,
  (SELECT count(*) FROM workers WHERE company_id IS NOT NULL)          AS workers_with_company_id,
  (SELECT count(*) FROM documents)                                     AS documents_total,
  (SELECT count(*) FROM documents WHERE company_id IS NOT NULL)        AS documents_with_company_id,
  (SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND tablename='workers')                AS workers_policies,
  (SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND tablename='documents')              AS documents_policies;

COMMIT;

-- ================================================================
-- Post-migration notes:
--
-- Application changes required (already implemented in Phase 2 Batch 1):
--   • All API routes now call getCurrentCompanyContext() instead of
--     requireAuth() / requireAdmin(), and add .eq('company_id', companyId)
--     to all worker/document queries.
--   • Upload and signed-url routes verify path ownership.
--   • Reports, exports, dashboard, issues, archive pages are scoped.
--
-- Known Phase 2 Batch 1 limitations (addressed in future batches):
--   • vehicles, heavy_equipment, lifting_equipment, subcontractors
--     do NOT yet have company_id — those are Batch 2 scope.
--   • professional_licenses, manager_licenses, lifting_machine_appointments,
--     safety_briefings, height_restrictions — company enforced only at
--     application level via worker ownership check (not via own company_id).
--   • Weekly report includes all vehicles/heavy/lifting (not yet scoped).
-- ================================================================
