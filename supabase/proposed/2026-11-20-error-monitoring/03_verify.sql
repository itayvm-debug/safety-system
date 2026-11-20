-- Expect: table exists, RLS on, no client privileges, every health check ok (11 rows incl. 'error-event cleanup running').
SELECT c.relrowsecurity AS rls_on,
       has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('authenticated', c.oid, 'SELECT') AS client_can_read
FROM pg_class c WHERE c.oid = 'public.app_error_events'::regclass;
SELECT * FROM public.safedoc_health_check();
