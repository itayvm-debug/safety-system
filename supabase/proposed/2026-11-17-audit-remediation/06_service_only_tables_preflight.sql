-- ================================================================
-- SafeDoc: preflight for 07_service_only_tables_lockdown.sql (READ ONLY)
-- Tables: public.site_feedback, public.manager_insurances,
--         public.legal_acceptances_dedup_backup
--
-- One statement, one result set. Run the whole file in the SQL Editor,
-- then "Download CSV" and keep the file: it is the record of the original
-- privileges and policies, and section 15 is the exact rollback.
-- Returns only object names, privileges and row counts; no row content.
-- ================================================================
WITH t AS (
  SELECT c.oid, c.relname::text AS relname, c.relkind, c.relowner, c.relacl,
         c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relname IN ('site_feedback', 'manager_insurances', 'legal_acceptances_dedup_backup')
),
roles_checked(rolname) AS (VALUES ('anon'::name), ('authenticated'::name), ('service_role'::name)),
privs(p) AS (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')),
tacl AS (   -- table-level ACL, one row per grantee/privilege (NULL ACL = owner defaults)
  SELECT t.relname, a.privilege_type, a.is_grantable,
         CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END AS grantee,
         pg_get_userbyid(a.grantor)::text AS grantor
  FROM t CROSS JOIN LATERAL aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) a
),
cacl AS (   -- column-level ACL
  SELECT t.relname, att.attname::text AS attname, a.privilege_type, a.is_grantable,
         CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END AS grantee,
         pg_get_userbyid(a.grantor)::text AS grantor
  FROM t
  JOIN pg_attribute att ON att.attrelid = t.oid AND att.attnum > 0 AND NOT att.attisdropped AND att.attacl IS NOT NULL
  CROSS JOIN LATERAL aclexplode(att.attacl) a
),
seqs AS (   -- sequences owned by these tables (serial = 'a', identity = 'i')
  SELECT t.relname AS table_name, s.oid AS seq_oid, s.oid::regclass::text AS seq_name,
         s.relowner, s.relacl, d.deptype
  FROM t
  JOIN pg_depend d ON d.refclassid = 'pg_class'::regclass AND d.refobjid = t.oid
                  AND d.classid = 'pg_class'::regclass AND d.deptype IN ('a', 'i')
  JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
),
sacl AS (
  SELECT seqs.table_name, seqs.seq_name, a.privilege_type, a.is_grantable,
         CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END AS grantee,
         pg_get_userbyid(a.grantor)::text AS grantor
  FROM seqs CROSS JOIN LATERAL aclexplode(coalesce(seqs.relacl, acldefault('S', seqs.relowner))) a
)

-- 01 Table, owner, RLS state and exact row count (counts are compared after the fix)
SELECT '01 table' AS section, t.relname AS object,
       format('kind=%s owner=%s rls=%s force_rls=%s rows=%s',
              t.relkind, pg_get_userbyid(t.relowner), t.relrowsecurity, t.relforcerowsecurity,
              (xpath('/row/n/text()',
                     query_to_xml(format('SELECT count(*) AS n FROM public.%I', t.relname), false, true, '')))[1]::text
       ) AS detail
FROM t
UNION ALL
SELECT '01 table', n, 'MISSING in public'
FROM unnest(ARRAY['site_feedback', 'manager_insurances', 'legal_acceptances_dedup_backup']) n
WHERE n NOT IN (SELECT relname FROM t)

-- 02 Table grants, with grantor (REVOKE run by the owner removes only grants the owner made)
UNION ALL
SELECT '02 table grant', relname,
       format('%s %s (grantor %s%s)', grantee, privilege_type, grantor,
              CASE WHEN is_grantable THEN ', WITH GRANT OPTION' ELSE '' END)
FROM tacl

-- 03 Column grants (REVOKE ALL ON TABLE also removes these; listed to prove it)
UNION ALL
SELECT '03 column grant', relname || '.' || attname,
       format('%s %s (grantor %s%s)', grantee, privilege_type, grantor,
              CASE WHEN is_grantable THEN ', WITH GRANT OPTION' ELSE '' END)
FROM cacl
UNION ALL
SELECT '03 column grant', '(all three tables)', 'none'
WHERE NOT EXISTS (SELECT 1 FROM cacl)

-- 04 Owned sequences and their grants
UNION ALL
SELECT '04 sequence', seq_name,
       format('table %s | %s %s (grantor %s%s)', table_name, grantee, privilege_type, grantor,
              CASE WHEN is_grantable THEN ', WITH GRANT OPTION' ELSE '' END)
FROM sacl
UNION ALL
SELECT '04 sequence', seq_name, format('table %s | kind=%s', table_name,
       CASE deptype WHEN 'a' THEN 'serial' ELSE 'identity' END)
FROM seqs
UNION ALL
SELECT '04 sequence', '(all three tables)', 'none'
WHERE NOT EXISTS (SELECT 1 FROM seqs)

-- 05 Effective privileges: includes grants to PUBLIC and grants inherited through role membership
UNION ALL
SELECT '05 effective', t.relname,
       r.rolname || ': '
       || coalesce(string_agg(p.p, ',' ORDER BY p.p) FILTER (WHERE has_table_privilege(r.rolname, t.oid, p.p)), 'none')
       || ' | any column privilege: '
       || bool_or(has_any_column_privilege(r.rolname, t.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))::text
FROM t CROSS JOIN roles_checked r CROSS JOIN privs p
GROUP BY t.relname, r.rolname

-- 06 Roles that anon/authenticated inherit from (a grant to any of them reaches the client)
UNION ALL
SELECT '06 role membership', r.rolname::text,
       coalesce((SELECT string_agg(g.rolname, ', ' ORDER BY g.rolname)
                 FROM pg_roles g
                 WHERE g.rolname <> r.rolname AND pg_has_role(r.rolname, g.oid, 'USAGE')), 'none')
FROM roles_checked r
WHERE r.rolname IN ('anon', 'authenticated')

-- 07 Server role and the role running this script
UNION ALL
SELECT '07 server', 'service_role',
       format('bypassrls=%s inherit=%s', rolbypassrls, rolinherit)
FROM pg_roles WHERE rolname = 'service_role'
UNION ALL
SELECT '07 server', 'current_user',
       current_user || ' | can act as owner: '
       || string_agg(t.relname || '=' || pg_has_role(current_user, t.relowner, 'USAGE')::text, ', ')
FROM t

-- 08 Existing policies (expected: none)
UNION ALL
SELECT '08 policy', tablename::text,
       format('%s cmd=%s roles=%s permissive=%s using=%s check=%s',
              policyname, cmd, roles, permissive, coalesce(qual, '-'), coalesce(with_check, '-'))
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('site_feedback', 'manager_insurances', 'legal_acceptances_dedup_backup')
UNION ALL
SELECT '08 policy', '(all three tables)', 'none'
WHERE NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                  AND tablename IN ('site_feedback', 'manager_insurances', 'legal_acceptances_dedup_backup'))

-- 09 Views that read these tables (a view runs as its owner and would bypass the fix). Expected: none
UNION ALL
SELECT DISTINCT '09 dependent view', v.oid::regclass::text,
       format('reads %s | kind=%s owner=%s anon_select=%s authenticated_select=%s options=%s',
              t.relname, v.relkind, pg_get_userbyid(v.relowner),
              has_table_privilege('anon', v.oid, 'SELECT'), has_table_privilege('authenticated', v.oid, 'SELECT'),
              coalesce(array_to_string(v.reloptions, ','), '-'))
FROM t
JOIN pg_depend d ON d.refclassid = 'pg_class'::regclass AND d.refobjid = t.oid AND d.classid = 'pg_rewrite'::regclass
JOIN pg_rewrite rw ON rw.oid = d.objid
JOIN pg_class v ON v.oid = rw.ev_class AND v.oid <> t.oid

-- 10 Functions whose body names these tables (SECURITY DEFINER + client EXECUTE would bypass the fix)
UNION ALL
SELECT '10 function', p.oid::regprocedure::text,
       format('security_definer=%s anon_execute=%s authenticated_execute=%s',
              p.prosecdef, has_function_privilege('anon', p.oid, 'EXECUTE'),
              has_function_privilege('authenticated', p.oid, 'EXECUTE'))
FROM pg_proc p
WHERE p.pronamespace NOT IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
  AND p.prosrc ~* '(site_feedback|manager_insurances|legal_acceptances_dedup_backup)'

-- 11 Triggers on these tables (not changed by the fix; listed for the record)
UNION ALL
SELECT '11 trigger', t.relname, tg.tgname || ' -> ' || tg.tgfoid::regproc::text
FROM t JOIN pg_trigger tg ON tg.tgrelid = t.oid AND NOT tg.tgisinternal

-- 12 Realtime / logical replication publications that include these tables
UNION ALL
SELECT '12 publication', pt.tablename::text, pt.pubname::text
FROM pg_publication_tables pt
WHERE pt.schemaname = 'public'
  AND pt.tablename IN ('site_feedback', 'manager_insurances', 'legal_acceptances_dedup_backup')

-- 13 Table inheritance / partitions (expected: none)
UNION ALL
SELECT '13 inheritance', t.relname, format('parent=%s child=%s', i.inhparent::regclass, i.inhrelid::regclass)
FROM t JOIN pg_inherits i ON t.oid IN (i.inhrelid, i.inhparent)

-- 14 Default privileges for NEW tables in public (information only; this fix does not change them)
UNION ALL
SELECT '14 default privilege (info)', 'set by ' || pg_get_userbyid(da.defaclrole)::text,
       format('new tables -> %s: %s',
              CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END,
              string_agg(a.privilege_type, ',' ORDER BY a.privilege_type))
FROM pg_default_acl da CROSS JOIN LATERAL aclexplode(da.defaclacl) a
WHERE da.defaclnamespace = 'public'::regnamespace AND da.defaclobjtype = 'r'
  AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated'))
GROUP BY da.defaclrole, a.grantee

-- 15 Exact rollback: statements that recreate today's client access. Save them.
UNION ALL
SELECT '15 rollback sql', relname,
       format('GRANT %s ON TABLE public.%I TO %s%s;', privilege_type, relname,
              CASE WHEN grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(grantee) END,
              CASE WHEN is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
FROM tacl WHERE grantee IN ('PUBLIC', 'anon', 'authenticated')
UNION ALL
SELECT '15 rollback sql', relname,
       format('GRANT %s (%I) ON TABLE public.%I TO %s%s;', privilege_type, attname, relname,
              CASE WHEN grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(grantee) END,
              CASE WHEN is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
FROM cacl WHERE grantee IN ('PUBLIC', 'anon', 'authenticated')
UNION ALL
SELECT '15 rollback sql', table_name,
       format('GRANT %s ON SEQUENCE %s TO %s%s;', privilege_type, seq_name,
              CASE WHEN grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(grantee) END,
              CASE WHEN is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
FROM sacl WHERE grantee IN ('PUBLIC', 'anon', 'authenticated')
UNION ALL
SELECT '15 rollback sql', relname, format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY;', relname)
FROM t WHERE NOT relrowsecurity

ORDER BY 1, 2, 3;
