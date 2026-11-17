-- ================================================================
-- PROPOSED, NOT RUN. Close direct client access to three public tables
-- that had RLS off and full anon/authenticated grants (live check 2026-11-17).
--
--   public.site_feedback                   used by the app only through
--                                          createServiceClient() (service_role)
--   public.manager_insurances              deprecated; no code reads or writes it
--   public.legal_acceptances_dedup_backup  one-time backup; no code reads or writes it
--
-- Changes:
--   * RLS enabled on the three tables, with no policy (clients get no rows).
--   * Every privilege of PUBLIC, anon and authenticated removed from the
--     tables, their columns and the sequences they own.
-- Does not change:
--   * rows, columns, indexes, constraints, triggers;
--   * service_role or postgres privileges (service_role bypasses RLS);
--   * Storage, any other table, USAGE on schema public, default privileges.
--
-- Order:
--   1. 06_service_only_tables_preflight.sql -> save the CSV.
--   2. This file as it is. It ends in ROLLBACK, so it is a dry run:
--      "Success" means every precondition and check passed; nothing is kept.
--   3. Change the last line to COMMIT; and run the whole file again.
--   4. 08_service_only_tables_verify.sql, then the application checks.
-- Run the whole file at once, as postgres (the table owner).
-- Any failed precondition or check raises an error and undoes everything.
-- ================================================================
BEGIN;
SET LOCAL lock_timeout = '5s';        -- do not wait behind application traffic; rerun if it times out
SET LOCAL statement_timeout = '60s';

-- ── 0. Preconditions ─────────────────────────────────────────────
DO $$
DECLARE
  names text[] := ARRAY['site_feedback', 'manager_insurances', 'legal_acceptances_dedup_backup'];
  bad   text;
BEGIN
  SELECT string_agg(n, ', ') INTO bad
  FROM unnest(names) n
  WHERE NOT EXISTS (SELECT 1 FROM pg_class c
                    WHERE c.relnamespace = 'public'::regnamespace AND c.relname = n AND c.relkind = 'r');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: not an ordinary table in public: %', bad;
  END IF;

  -- The application reaches site_feedback only as service_role. Without BYPASSRLS,
  -- RLS with no policy would block the application.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND rolbypassrls) THEN
    RAISE EXCEPTION 'ABORT: service_role does not bypass RLS';
  END IF;

  SELECT string_agg(c.relname || ' (owner ' || pg_get_userbyid(c.relowner) || ')', ', ') INTO bad
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY (names)
    AND NOT pg_has_role(current_user, c.relowner, 'USAGE');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: % cannot be altered by %; run as the owner', bad, current_user;
  END IF;

  SELECT string_agg(DISTINCT i.inhrelid::regclass || ' <- ' || i.inhparent::regclass, ', ') INTO bad
  FROM pg_inherits i
  JOIN pg_class c ON c.oid IN (i.inhrelid, i.inhparent)
  WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY (names);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: inheritance or partitions involved: %', bad;
  END IF;

  -- A view runs as its owner, so it would keep exposing the rows after this fix.
  SELECT string_agg(DISTINCT v.oid::regclass::text, ', ') INTO bad
  FROM pg_class c
  JOIN pg_depend d ON d.refclassid = 'pg_class'::regclass AND d.refobjid = c.oid
                  AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_rewrite rw ON rw.oid = d.objid
  JOIN pg_class v ON v.oid = rw.ev_class AND v.oid <> c.oid
  WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY (names);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: views read these tables and must be handled first: %', bad;
  END IF;

  -- Same for a SECURITY DEFINER function that clients may execute.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO bad
  FROM pg_proc p
  WHERE p.prosecdef
    AND p.pronamespace NOT IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
    AND p.prosrc ~* '(site_feedback|manager_insurances|legal_acceptances_dedup_backup)'
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: client-executable SECURITY DEFINER functions read these tables: %', bad;
  END IF;
END $$;

-- Row counts before the change (temporary, dropped at the end of the transaction)
CREATE TEMP TABLE rls_fix_rowcounts ON COMMIT DROP AS
SELECT 'site_feedback'::text AS table_name, count(*) AS n FROM public.site_feedback
UNION ALL SELECT 'manager_insurances', count(*) FROM public.manager_insurances
UNION ALL SELECT 'legal_acceptances_dedup_backup', count(*) FROM public.legal_acceptances_dedup_backup;

-- ── 1. RLS on, no policy ─────────────────────────────────────────
-- Not FORCE: the owner (postgres) keeps access for maintenance.
ALTER TABLE public.site_feedback                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_insurances             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_acceptances_dedup_backup ENABLE ROW LEVEL SECURITY;

-- ── 2. Remove client privileges ──────────────────────────────────
-- REVOKE ALL ON TABLE also removes the matching column-level privileges.
-- No CASCADE: if anon/authenticated passed a grant on, this fails and nothing changes.
REVOKE ALL ON TABLE public.site_feedback,
                    public.manager_insurances,
                    public.legal_acceptances_dedup_backup
  FROM PUBLIC, anon, authenticated;

-- Sequences owned by these tables only (serial or identity).
DO $$
DECLARE s record;
BEGIN
  FOR s IN
    SELECT DISTINCT seq.oid::regclass AS seq
    FROM pg_depend d
    JOIN pg_class seq ON seq.oid = d.objid AND seq.relkind = 'S'
    WHERE d.classid = 'pg_class'::regclass
      AND d.refclassid = 'pg_class'::regclass
      AND d.deptype IN ('a', 'i')
      AND d.refobjid IN ('public.site_feedback'::regclass,
                         'public.manager_insurances'::regclass,
                         'public.legal_acceptances_dedup_backup'::regclass)
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated', s.seq);
    RAISE NOTICE 'client privileges removed from sequence %', s.seq;
  END LOOP;
END $$;

-- ── 3. Checks (any failure undoes the whole transaction) ─────────
DO $$
DECLARE
  tbls  oid[] := ARRAY['public.site_feedback'::regclass,
                       'public.manager_insurances'::regclass,
                       'public.legal_acceptances_dedup_backup'::regclass]::oid[];
  privs text[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
  bad   text;
BEGIN
  -- 3a. RLS is on
  SELECT string_agg(c.oid::regclass::text, ', ') INTO bad
  FROM pg_class c WHERE c.oid = ANY (tbls) AND NOT c.relrowsecurity;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'CHECK FAILED: RLS still off on %', bad; END IF;

  -- 3b. No table-level ACL entry left for PUBLIC/anon/authenticated, from any grantor
  SELECT string_agg(DISTINCT c.oid::regclass || ' ' || a.privilege_type || ' -> '
           || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END
           || ' (grantor ' || pg_get_userbyid(a.grantor) || ')', '; ') INTO bad
  FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  WHERE c.oid = ANY (tbls) AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated'));
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'CHECK FAILED: client table grants remain: %', bad; END IF;

  -- 3c. No column-level ACL entry left for them
  SELECT string_agg(DISTINCT att.attrelid::regclass || '.' || att.attname || ' ' || a.privilege_type, '; ') INTO bad
  FROM pg_attribute att CROSS JOIN LATERAL aclexplode(att.attacl) a
  WHERE att.attrelid = ANY (tbls) AND att.attacl IS NOT NULL
    AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated'));
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'CHECK FAILED: client column grants remain: %', bad; END IF;

  -- 3d. Effective access, including through PUBLIC and inherited role membership
  SELECT string_agg(r || ' ' || p || ' on ' || t::regclass, '; ') INTO bad
  FROM unnest(tbls) t, unnest(ARRAY['anon', 'authenticated']) r, unnest(privs) p
  WHERE has_table_privilege(r::name, t, p);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'CHECK FAILED: clients still have access: %', bad; END IF;

  SELECT string_agg(r || ' column access on ' || t::regclass, '; ') INTO bad
  FROM unnest(tbls) t, unnest(ARRAY['anon', 'authenticated']) r
  WHERE has_any_column_privilege(r::name, t, 'SELECT, INSERT, UPDATE, REFERENCES');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'CHECK FAILED: %', bad; END IF;

  -- 3e. No client access to the owned sequences
  SELECT string_agg(DISTINCT r || ' on ' || seq.oid::regclass, '; ') INTO bad
  FROM pg_depend d
  JOIN pg_class seq ON seq.oid = d.objid AND seq.relkind = 'S'
  CROSS JOIN unnest(ARRAY['anon', 'authenticated']) r
  WHERE d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass
    AND d.deptype IN ('a', 'i') AND d.refobjid = ANY (tbls)
    AND has_sequence_privilege(r::name, seq.oid, 'USAGE, SELECT, UPDATE');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'CHECK FAILED: client sequence access remains: %', bad; END IF;

  -- 3f. The server keeps what the application uses on site_feedback:
  --     SELECT (list, count), INSERT ... RETURNING, UPDATE, DELETE
  SELECT string_agg(p, ', ') INTO bad
  FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
  WHERE NOT has_table_privilege('service_role', 'public.site_feedback'::regclass, p);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'CHECK FAILED: service_role lacks % on site_feedback', bad; END IF;

  -- a serial id needs USAGE on its sequence for INSERT (identity columns do not)
  SELECT string_agg(seq.oid::regclass::text, ', ') INTO bad
  FROM pg_depend d JOIN pg_class seq ON seq.oid = d.objid AND seq.relkind = 'S'
  WHERE d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass AND d.deptype = 'a'
    AND d.refobjid = 'public.site_feedback'::regclass
    AND NOT has_sequence_privilege('service_role', seq.oid, 'USAGE');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'CHECK FAILED: service_role lacks USAGE on %', bad; END IF;

  -- 3g. No row was added or removed
  SELECT string_agg(rc.table_name, ', ') INTO bad
  FROM rls_fix_rowcounts rc
  WHERE rc.n <> (xpath('/row/n/text()',
                       query_to_xml(format('SELECT count(*) AS n FROM public.%I', rc.table_name), false, true, '')))[1]::text::bigint;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'CHECK FAILED: row count changed on %', bad; END IF;

  RAISE NOTICE 'All checks passed';
END $$;

-- Dry run by default. To apply: replace ROLLBACK with COMMIT and run the whole file again.
ROLLBACK;
-- COMMIT;
