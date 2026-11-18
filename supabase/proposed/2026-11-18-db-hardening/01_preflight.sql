-- READ ONLY. Client (PUBLIC / anon / authenticated) privileges in schema public, and RLS state.
WITH objs AS (
  SELECT c.oid, c.relname::text AS name, CASE c.relkind WHEN 'S' THEN 'SEQUENCE' ELSE 'TABLE' END AS kind,
         coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner)) AS acl
  FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','v','m','S','p','f')
  UNION ALL
  SELECT p.oid, p.oid::regprocedure::text, 'FUNCTION', coalesce(p.proacl, acldefault('f', p.proowner))
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
)
SELECT kind, count(DISTINCT name) AS objects,
       string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END, ',') AS grantees,
       count(*) AS acl_entries, bool_or(a.is_grantable) AS any_grant_option
FROM objs CROSS JOIN LATERAL aclexplode(objs.acl) a
WHERE a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated')
GROUP BY kind ORDER BY kind;
-- Also run: SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r';
