-- READ ONLY. After 02. Every row: ok = true.
SELECT check_name, value, expected, value = expected AS ok FROM (
  SELECT 'policies on authorized_phones' AS check_name,
         (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'authorized_phones')::text AS value, '0' AS expected
  UNION ALL
  SELECT 'client privileges on authorized_phones',
         coalesce((SELECT string_agg(r || ' ' || p, ',') FROM unnest(ARRAY['anon', 'authenticated']) r,
                   unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
                   WHERE has_table_privilege(r::name, 'public.authorized_phones'::regclass, p)), 'none'), 'none'
  UNION ALL
  SELECT 'RLS on authorized_phones', (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.authorized_phones'::regclass), 'true'
  UNION ALL
  SELECT 'service_role SELECT', has_table_privilege('service_role', 'public.authorized_phones'::regclass, 'SELECT')::text, 'true'
  UNION ALL
  SELECT 'rows (unchanged)', (SELECT count(*) FROM public.authorized_phones)::text, '1'
  UNION ALL
  SELECT 'legacy account banned', (SELECT (banned_until > now())::text FROM auth.users WHERE id = '9eb38eab-24da-4dba-b277-0929ffb4ab58'), 'true'
  UNION ALL
  SELECT 'legacy active refresh tokens', (SELECT count(*) FROM auth.refresh_tokens WHERE user_id = '9eb38eab-24da-4dba-b277-0929ffb4ab58' AND NOT revoked)::text, '0'
  UNION ALL
  SELECT 'users banned in total', (SELECT count(*) FROM auth.users WHERE banned_until IS NOT NULL)::text, '1'
) c ORDER BY 1;
