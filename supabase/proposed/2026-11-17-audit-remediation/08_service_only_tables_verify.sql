-- ================================================================
-- SafeDoc: verification after 07_service_only_tables_lockdown.sql (READ ONLY)
-- One statement, one result set. Every row with ok = true passes.
-- ok is empty on the two "same as preflight" rows: compare them with the
-- preflight CSV (section 01 for rows, section 08 for policies).
-- ================================================================
WITH t AS (
  SELECT c.oid, c.relname::text AS relname, c.relrowsecurity, c.relacl, c.relowner
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relname IN ('site_feedback', 'manager_insurances', 'legal_acceptances_dedup_backup')
),
clients(r) AS (VALUES ('anon'::name), ('authenticated'::name)),
privs(p) AS (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')),
checks AS (
  SELECT 'RLS enabled' AS check_name, t.relname AS object, t.relrowsecurity::text AS value, 'true' AS expected
  FROM t

  UNION ALL   -- table and column ACL entries for clients, from any grantor
  SELECT 'client grants (table + column)', t.relname,
         ((SELECT count(*) FROM aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) a
           WHERE a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated'))
        + (SELECT count(*) FROM pg_attribute att CROSS JOIN LATERAL aclexplode(att.attacl) a
           WHERE att.attrelid = t.oid AND att.attacl IS NOT NULL
             AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated'))))::text,
         '0'
  FROM t

  UNION ALL   -- effective access, including PUBLIC and inherited roles
  SELECT 'client effective access', t.relname || ' / ' || cl.r,
         coalesce(string_agg(p.p, ',') FILTER (WHERE has_table_privilege(cl.r, t.oid, p.p)), 'none')
         || CASE WHEN bool_or(has_any_column_privilege(cl.r, t.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))
                 THEN ' + column access' ELSE '' END,
         'none'
  FROM t CROSS JOIN clients cl CROSS JOIN privs p
  GROUP BY t.relname, cl.r

  UNION ALL   -- client access to sequences owned by these tables
  SELECT 'client sequence access', seq.oid::regclass::text || ' / ' || cl.r,
         has_sequence_privilege(cl.r, seq.oid, 'USAGE, SELECT, UPDATE')::text, 'false'
  FROM t
  JOIN pg_depend d ON d.refobjid = t.oid AND d.refclassid = 'pg_class'::regclass
                  AND d.classid = 'pg_class'::regclass AND d.deptype IN ('a', 'i')
  JOIN pg_class seq ON seq.oid = d.objid AND seq.relkind = 'S'
  CROSS JOIN clients cl

  UNION ALL   -- what the application uses on site_feedback
  SELECT 'server privilege', 'site_feedback / service_role ' || p,
         has_table_privilege('service_role', 'public.site_feedback'::regclass, p)::text, 'true'
  FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p

  UNION ALL
  SELECT 'server bypasses RLS', 'service_role', rolbypassrls::text, 'true'
  FROM pg_roles WHERE rolname = 'service_role'

  UNION ALL
  SELECT 'policies (unchanged)', t.relname,
         (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t.relname)::text,
         'same as preflight 08'
  FROM t

  UNION ALL
  SELECT 'rows (unchanged)', t.relname,
         (xpath('/row/n/text()',
                query_to_xml(format('SELECT count(*) AS n FROM public.%I', t.relname), false, true, '')))[1]::text,
         'same as preflight 01'
  FROM t
)
SELECT check_name, object, value, expected,
       CASE WHEN expected LIKE 'same as%' THEN NULL ELSE value = expected END AS ok
FROM checks
ORDER BY ok NULLS LAST, check_name, object;

-- ----------------------------------------------------------------
-- Optional check from outside, as a real client (run on your own machine,
-- not in the SQL Editor). It prints only the HTTP status, never row content.
-- The anon key is the NEXT_PUBLIC_SUPABASE_ANON_KEY value.
--
--   curl -s -o /dev/null -w "%{http_code}\n" \
--     "https://<project-ref>.supabase.co/rest/v1/site_feedback?select=id&limit=1" \
--     -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>"
--
-- Expected after the fix: 401 (permission denied). Repeat with
-- manager_insurances and legal_acceptances_dedup_backup.
-- ----------------------------------------------------------------
