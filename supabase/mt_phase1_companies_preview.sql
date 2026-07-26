-- ================================================================
-- mt_phase1_companies_preview.sql
-- Read-only diagnostic — SELECT only, no DDL, no DML.
-- Safe to run regardless of whether companies / company_members exist.
-- Run this BEFORE mt_phase1_companies.sql to understand current state.
-- ================================================================

-- ── 1. Table existence + RLS status ─────────────────────────────

SELECT
  t.tablename,
  COALESCE(c.relrowsecurity, false) AS rls_enabled,
  CASE
    WHEN t.tablename IS NULL THEN 'MISSING'
    ELSE 'EXISTS'
  END AS status
FROM (VALUES ('companies'), ('company_members')) AS want(tablename)
LEFT JOIN pg_tables t
  ON t.schemaname = 'public' AND t.tablename = want.tablename
LEFT JOIN pg_class c
  ON c.relnamespace = 'public'::regnamespace AND c.relname = want.tablename
ORDER BY want.tablename;

-- ── 2. Columns (empty set if table does not exist) ───────────────

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('companies', 'company_members')
ORDER BY table_name, ordinal_position;

-- ── 3. Constraints ───────────────────────────────────────────────

SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON  tc.constraint_name = kcu.constraint_name
  AND tc.table_schema    = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('companies', 'company_members')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name, kcu.ordinal_position;

-- ── 4. Indexes ───────────────────────────────────────────────────

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('companies', 'company_members')
ORDER BY tablename, indexname;

-- ── 5. Policies ──────────────────────────────────────────────────

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
  AND tablename IN ('companies', 'company_members')
ORDER BY tablename, policyname;

-- ── 6. Profile count ─────────────────────────────────────────────

SELECT count(*) AS total_profiles FROM profiles;

-- ── 7. Row counts + backfill status (conditional) ───────────────
-- Uses dynamic SQL so the block never fails when tables are absent.

DO $$
DECLARE
  v_co_exists  BOOLEAN;
  v_cm_exists  BOOLEAN;
  v_co_count   INT := 0;
  v_cm_count   INT := 0;
  v_pr_count   INT;
  v_unmapped   INT := 0;
  v_dups       INT := 0;
BEGIN
  SELECT count(*) INTO v_pr_count FROM profiles;

  SELECT EXISTS(
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'companies'
  ) INTO v_co_exists;

  SELECT EXISTS(
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'company_members'
  ) INTO v_cm_exists;

  RAISE NOTICE '========== mt_phase1_companies_preview ==========';
  RAISE NOTICE 'companies        : %', CASE v_co_exists WHEN true THEN 'EXISTS' ELSE 'MISSING' END;
  RAISE NOTICE 'company_members  : %', CASE v_cm_exists WHEN true THEN 'EXISTS' ELSE 'MISSING' END;
  RAISE NOTICE 'profiles count   : %', v_pr_count;

  IF v_co_exists THEN
    EXECUTE 'SELECT count(*) FROM companies' INTO v_co_count;
    RAISE NOTICE 'companies rows   : %', v_co_count;
  END IF;

  IF v_cm_exists THEN
    EXECUTE 'SELECT count(*) FROM company_members' INTO v_cm_count;
    RAISE NOTICE 'company_members rows: %', v_cm_count;

    EXECUTE '
      SELECT count(*)
      FROM profiles p
      WHERE NOT EXISTS (
        SELECT 1 FROM company_members cm WHERE cm.user_id = p.id
      )
    ' INTO v_unmapped;
    RAISE NOTICE 'profiles without membership: %', v_unmapped;

    EXECUTE '
      SELECT count(*) FROM (
        SELECT company_id, user_id
        FROM company_members
        GROUP BY company_id, user_id
        HAVING count(*) > 1
      ) dups
    ' INTO v_dups;
    RAISE NOTICE 'duplicate (company_id, user_id) pairs: %', v_dups;
  END IF;

  RAISE NOTICE '=================================================';
  RAISE NOTICE 'EXPECTED STATE BEFORE MIGRATION:';
  RAISE NOTICE '  companies EXISTS   : %', v_co_exists;
  RAISE NOTICE '  company_members EXISTS: %', v_cm_exists;
  RAISE NOTICE '  (current partial state: companies=EXISTS, company_members=MISSING)';
  RAISE NOTICE '=================================================';
END $$;

-- ── 8. Orphan check (only if both tables exist) ──────────────────

DO $$
DECLARE
  v_co_exists BOOLEAN;
  v_cm_exists BOOLEAN;
  v_orphans   INT := 0;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='companies')
    INTO v_co_exists;
  SELECT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='company_members')
    INTO v_cm_exists;

  IF v_co_exists AND v_cm_exists THEN
    EXECUTE '
      SELECT count(*) FROM company_members cm
      WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = cm.company_id)
    ' INTO v_orphans;
    RAISE NOTICE 'Orphan company_members (no matching company): %', v_orphans;

    EXECUTE '
      SELECT count(*) FROM company_members cm
      WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = cm.user_id)
    ' INTO v_orphans;
    RAISE NOTICE 'Orphan company_members (no matching profile): %', v_orphans;
  ELSE
    RAISE NOTICE 'Skipping orphan check — one or both tables are missing.';
  END IF;
END $$;
