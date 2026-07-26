-- ================================================================
-- Multi-Tenant Phase 1: companies + company_members foundation
-- mt_phase1_companies.sql  —  REPAIRED
-- idempotent — safe for all partial states
--
-- ROOT CAUSE OF ORIGINAL FAILURE:
--   The original script created "companies_select_member" policy
--   (which references company_members in its USING clause) BEFORE
--   company_members was created. PostgreSQL validates subquery
--   relations at CREATE POLICY time → ERROR 42P01.
--
-- ACTUAL STATE AFTER FAILURE (Supabase SQL Editor uses implicit transactions):
--   The entire script ran inside one implicit transaction.
--   When CREATE POLICY failed at line ~40, the transaction rolled back
--   completely — companies was NOT left behind.
--   Confirmed by Production inspection: both tables MISSING, profiles=3.
--
-- CORRECT ORDER:
--   1. BEGIN
--   2. Schema guard (detect incompatible pre-existing structure)
--   3. CREATE TABLE companies (IF NOT EXISTS)
--   4. CREATE TABLE company_members (IF NOT EXISTS)
--      — both tables must exist before any cross-referencing policy
--   5. Trigger on companies
--   6. Indexes on both tables
--   7. Backfill: default company + profile memberships
--   8. Enable RLS on both tables
--   9. Create all policies (both tables exist → no forward reference)
--  10. Assertions
--  11. COMMIT
--
-- ⚠️ הרץ ב-Supabase SQL Editor לאחר הרצת mt_phase1_companies_preview.sql
-- ================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────
-- STEP 1: Schema guard
-- Raise a descriptive exception if a pre-existing companies table
-- is structurally incompatible (missing required columns).
-- ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'companies'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'companies'
        AND column_name = 'slug'
    ) THEN
      RAISE EXCEPTION
        'INCOMPATIBLE SCHEMA: companies table exists but is missing column "slug". '
        'Inspect the table manually before continuing.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'companies'
        AND column_name = 'is_active'
    ) THEN
      RAISE EXCEPTION
        'INCOMPATIBLE SCHEMA: companies table exists but is missing column "is_active". '
        'Inspect the table manually before continuing.';
    END IF;
    RAISE NOTICE 'companies table pre-exists and schema is compatible — continuing.';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- STEP 2: Create companies table
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  name_en       TEXT,
  slug          TEXT        UNIQUE,
  registration  TEXT,
  address       TEXT,
  phone         TEXT,
  contact_email TEXT,
  safety_email  TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────
-- STEP 3: Create company_members table
-- MUST come before any policy on companies that references it.
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  role        TEXT        NOT NULL DEFAULT 'member'
                          CHECK (role IN ('owner', 'admin', 'member')),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

-- ──────────────────────────────────────────────────────────────────
-- STEP 4: Trigger on companies
-- update_updated_at() was created in migration_profiles.sql.
-- ──────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS companies_updated_at ON companies;
CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ──────────────────────────────────────────────────────────────────
-- STEP 5: Indexes
-- ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_companies_slug             ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_is_active        ON companies(is_active);
CREATE INDEX IF NOT EXISTS idx_company_members_company_id ON company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_user_id    ON company_members(user_id);

-- ──────────────────────────────────────────────────────────────────
-- STEP 6: Backfill — default company
-- Deterministic UUID so re-runs are idempotent.
-- ──────────────────────────────────────────────────────────────────

INSERT INTO companies (id, name, name_en, slug, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'SafeDoc',
  'SafeDoc',
  'safedoc-default',
  true
)
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────
-- STEP 7: Backfill — map every profiles row to the default company
-- admin → company role 'admin', everything else → 'member'.
-- ON CONFLICT: safe for partial or repeated execution.
-- ──────────────────────────────────────────────────────────────────

INSERT INTO company_members (company_id, user_id, role, is_active)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  p.id,
  CASE p.role
    WHEN 'admin' THEN 'admin'
    ELSE 'member'
  END,
  p.is_active
FROM profiles p
ON CONFLICT (company_id, user_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────
-- STEP 8: Enable RLS
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY is idempotent.
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE companies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────
-- STEP 9: RLS policies
--
-- Both tables now exist → no forward-reference risk.
--
-- RLS DESIGN:
--   companies:
--     SELECT — authenticated users see only companies they belong to.
--              The USING subquery queries company_members; that table's
--              own policy (user_id = auth.uid()) is non-recursive
--              because company_members policy never queries back into
--              companies.  No SECURITY DEFINER is required.
--     ALL    — service_role (superuser on Supabase, bypasses RLS
--              already; policy is explicit for documentation).
--   company_members:
--     SELECT — each authenticated user sees only their own rows.
--     ALL    — service_role.
--
-- Users cannot INSERT / UPDATE / DELETE on either table via the
-- application — those operations go through service_role API routes
-- only (Phase 8 + 9).
-- ──────────────────────────────────────────────────────────────────

-- companies: members may SELECT their company
DROP POLICY IF EXISTS "companies_select_member" ON companies;
CREATE POLICY "companies_select_member"
  ON companies FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT company_id FROM company_members
       WHERE user_id    = auth.uid()
         AND is_active  = true
    )
  );

-- companies: service_role retains full server-side access
DROP POLICY IF EXISTS "companies_service_all" ON companies;
CREATE POLICY "companies_service_all"
  ON companies FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- company_members: each user reads only their own membership rows
DROP POLICY IF EXISTS "company_members_select_own" ON company_members;
CREATE POLICY "company_members_select_own"
  ON company_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- company_members: service_role retains full server-side access
DROP POLICY IF EXISTS "company_members_service_all" ON company_members;
CREATE POLICY "company_members_service_all"
  ON company_members FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────
-- STEP 10: Verification assertions
-- Any failure raises an exception and rolls back the transaction.
-- ──────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_company_count  INT;
  v_profile_count  INT;
  v_member_count   INT;
  v_unmapped_count INT;
  v_dup_count      INT;
  v_rls_companies  BOOLEAN;
  v_rls_members    BOOLEAN;
BEGIN
  SELECT count(*) INTO v_company_count  FROM companies;
  SELECT count(*) INTO v_profile_count  FROM profiles;
  SELECT count(*) INTO v_member_count   FROM company_members;

  -- every profile must have at least one membership
  SELECT count(*) INTO v_unmapped_count
  FROM profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM company_members cm WHERE cm.user_id = p.id
  );

  -- no user may have two memberships in the same company
  SELECT count(*) INTO v_dup_count
  FROM (
    SELECT company_id, user_id
    FROM company_members
    GROUP BY company_id, user_id
    HAVING count(*) > 1
  ) dups;

  -- RLS must be enabled
  SELECT relrowsecurity INTO v_rls_companies
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace AND relname = 'companies';

  SELECT relrowsecurity INTO v_rls_members
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace AND relname = 'company_members';

  -- assert

  IF v_company_count < 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: no rows in companies after backfill';
  END IF;

  IF v_member_count <> v_profile_count THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: company_members rows (%) != profiles rows (%). '
      'Some profiles were not mapped.',
      v_member_count, v_profile_count;
  END IF;

  IF v_unmapped_count > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % profile(s) have no company_members row.',
      v_unmapped_count;
  END IF;

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % (company_id, user_id) pair(s) appear more than once.',
      v_dup_count;
  END IF;

  IF NOT v_rls_companies THEN
    RAISE EXCEPTION 'ASSERTION FAILED: RLS is not enabled on companies.';
  END IF;

  IF NOT v_rls_members THEN
    RAISE EXCEPTION 'ASSERTION FAILED: RLS is not enabled on company_members.';
  END IF;

  -- Expected policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'companies'
      AND policyname = 'companies_select_member'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: policy companies_select_member is missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'company_members'
      AND policyname = 'company_members_select_own'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: policy company_members_select_own is missing.';
  END IF;

  -- Expected indexes
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'company_members'
      AND indexname = 'idx_company_members_user_id'
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: index idx_company_members_user_id is missing.';
  END IF;

  RAISE NOTICE
    'ALL ASSERTIONS PASSED: companies=% | profiles=% | members=% | unmapped=0 | duplicates=0 | RLS=ON',
    v_company_count, v_profile_count, v_member_count;
END $$;

-- Final readable summary
SELECT
  (SELECT count(*) FROM companies)                                      AS companies,
  (SELECT count(*) FROM profiles)                                       AS profiles,
  (SELECT count(*) FROM company_members)                                AS memberships,
  (SELECT count(*) FROM profiles p
     WHERE NOT EXISTS (
       SELECT 1 FROM company_members cm WHERE cm.user_id = p.id
     ))                                                                 AS unmapped_profiles,
  (SELECT relrowsecurity FROM pg_class
     WHERE relnamespace = 'public'::regnamespace AND relname = 'companies')
                                                                        AS companies_rls,
  (SELECT relrowsecurity FROM pg_class
     WHERE relnamespace = 'public'::regnamespace AND relname = 'company_members')
                                                                        AS members_rls;

COMMIT;

-- ================================================================
-- Post-migration manual step:
-- Update the default company's name / contact_email to match the
-- actual customer organisation:
--
--   UPDATE companies
--      SET name          = '<actual name>',
--          contact_email = '<actual email>'
--    WHERE id = '00000000-0000-0000-0000-000000000001';
--
-- ================================================================
