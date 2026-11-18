-- READ ONLY. State of authorized_phones and the legacy phone account. No row content, no email, no token values.
WITH t AS (SELECT c.oid, c.relname, c.relowner, c.relacl, c.relrowsecurity, c.relforcerowsecurity
           FROM pg_class c WHERE c.oid = 'public.authorized_phones'::regclass)
SELECT '01 table' AS section, format('owner=%s rls=%s force=%s rows=%s', pg_get_userbyid(relowner), relrowsecurity,
       relforcerowsecurity, (SELECT count(*) FROM public.authorized_phones)) AS detail FROM t
UNION ALL
SELECT '02 grant', format('%s %s (grantor %s%s)', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END,
       a.privilege_type, pg_get_userbyid(a.grantor), CASE WHEN a.is_grantable THEN ', WGO' ELSE '' END)
FROM t CROSS JOIN LATERAL aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) a
WHERE a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated')
UNION ALL
SELECT '03 column grants', (SELECT count(*)::text FROM pg_attribute att, t WHERE att.attrelid = t.oid AND att.attacl IS NOT NULL)
UNION ALL
SELECT '04 sequences owned', coalesce((SELECT string_agg(s.oid::regclass::text, ',') FROM pg_depend d
       JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S', t
       WHERE d.refobjid = t.oid AND d.classid = 'pg_class'::regclass AND d.deptype IN ('a', 'i')), 'none')
UNION ALL
SELECT '05 policy', format('%s cmd=%s roles=%s permissive=%s using=%s check=%s', policyname, cmd, roles, permissive,
       coalesce(qual, '-'), coalesce(with_check, '-'))
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'authorized_phones'
UNION ALL
SELECT '06 dependent view', coalesce((SELECT string_agg(DISTINCT v.oid::regclass::text, ',') FROM pg_depend d
       JOIN pg_rewrite rw ON rw.oid = d.objid JOIN pg_class v ON v.oid = rw.ev_class, t
       WHERE d.refobjid = t.oid AND d.classid = 'pg_rewrite'::regclass AND v.oid <> t.oid), 'none')
UNION ALL
SELECT '07 function mentions', coalesce((SELECT string_agg(p.oid::regprocedure::text || ' secdef=' || p.prosecdef, ',')
       FROM pg_proc p WHERE p.pronamespace NOT IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
       AND p.prosrc ~* 'authorized_phones'), 'none')
UNION ALL
SELECT '09 legacy user', format('id=%s banned_until=%s sessions=%s refresh_tokens_active=%s', u.id,
       coalesce(u.banned_until::text, 'NULL'), (SELECT count(*) FROM auth.sessions s WHERE s.user_id = u.id),
       (SELECT string_agg(r.id::text, ',') FROM auth.refresh_tokens r WHERE r.user_id = u.id::text AND NOT r.revoked))
FROM auth.users u WHERE u.email LIKE '%@safedoc.internal'
UNION ALL
SELECT '10 users banned', count(*)::text FROM auth.users WHERE banned_until IS NOT NULL
ORDER BY 1, 2;
