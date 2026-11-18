-- ================================================================
-- SafeDoc — safedoc_health_check(): read-only self-check of the live database.
-- Called daily by /api/maintenance/daily (service_role). Each row: check_name, ok, detail.
-- Idempotent (CREATE OR REPLACE). No data is changed.
--
-- Why: on 2026-11-18 the rate-limit migration turned out never to have been
-- applied (every limit failed open), and three tables had been readable with the
-- public key. Both went unnoticed. These checks turn such states into an alert.
-- ================================================================
CREATE OR REPLACE FUNCTION public.safedoc_health_check()
RETURNS TABLE(check_name text, ok boolean, detail text)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v text;
  n bigint;
BEGIN
  -- 1. Objects the application code depends on
  SELECT string_agg(x, ', ') INTO v FROM unnest(ARRAY[
    'public.rate_limit_check(text,text,integer,integer,inet,uuid)',
    'public.rate_limit_cleanup(integer)']) x
  WHERE to_regprocedure(x) IS NULL;
  check_name := 'required functions'; ok := v IS NULL; detail := coalesce('missing: ' || v, 'present'); RETURN NEXT;

  SELECT string_agg(x, ', ') INTO v FROM unnest(ARRAY[
    'rate_limit_events', 'companies', 'company_members', 'profiles', 'workers', 'documents',
    'safety_briefings', 'height_restrictions', 'professional_licenses', 'manager_licenses',
    'vehicles', 'vehicle_licenses', 'vehicle_insurances', 'heavy_equipment', 'heavy_equipment_insurances',
    'lifting_equipment', 'lifting_machine_appointments', 'subcontractors', 'entity_notes',
    'site_feedback', 'legal_acceptances', 'audit_logs']) x
  WHERE to_regclass('public.' || x) IS NULL;
  check_name := 'required tables'; ok := v IS NULL; detail := coalesce('missing: ' || v, 'present'); RETURN NEXT;

  -- 2. Row level security on every table in public
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v
  FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity;
  check_name := 'RLS on every table'; ok := v IS NULL; detail := coalesce('RLS off: ' || v, 'all on'); RETURN NEXT;

  -- 3. No client (anon / authenticated) privileges on tables, views or sequences in public
  SELECT string_agg(DISTINCT c.relname, ', ') INTO v
  FROM pg_class c
  CROSS JOIN unnest(ARRAY['anon', 'authenticated']) r
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND (has_table_privilege(r::name, c.oid, 'SELECT') OR has_table_privilege(r::name, c.oid, 'INSERT')
         OR has_table_privilege(r::name, c.oid, 'UPDATE') OR has_table_privilege(r::name, c.oid, 'DELETE')
         OR has_table_privilege(r::name, c.oid, 'TRUNCATE'));
  check_name := 'no client table access'; ok := v IS NULL; detail := coalesce('client access: ' || v, 'none'); RETURN NEXT;

  -- 4. No client-callable functions in public (trigger functions cannot be called directly)
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prorettype <> 'trigger'::regtype
    AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  check_name := 'no client-callable functions'; ok := v IS NULL; detail := coalesce('callable: ' || v, 'none'); RETURN NEXT;

  -- 5. No policy that opens rows to everyone
  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v
  FROM pg_policies
  WHERE schemaname IN ('public', 'storage')
    AND (qual = 'true' OR with_check = 'true')
    AND NOT (roles = ARRAY['service_role']::name[]);
  check_name := 'no USING (true) policies'; ok := v IS NULL; detail := coalesce(v, 'none'); RETURN NEXT;

  -- 6. Default privileges for new objects created by postgres do not reach clients
  SELECT string_agg(DISTINCT da.defaclobjtype::text || '->' || pg_get_userbyid(a.grantee), ', ') INTO v
  FROM pg_default_acl da CROSS JOIN LATERAL aclexplode(da.defaclacl) a
  WHERE da.defaclrole = 'postgres'::regrole AND da.defaclnamespace = 'public'::regnamespace
    AND a.grantee <> 0 AND pg_get_userbyid(a.grantee) IN ('anon', 'authenticated');
  check_name := 'closed defaults for new objects'; ok := v IS NULL; detail := coalesce('open: ' || v, 'closed'); RETURN NEXT;

  -- 7. Storage: the files bucket is private and has no client policy
  SELECT count(*) INTO n FROM storage.buckets WHERE id = 'worker-files' AND NOT public;
  check_name := 'worker-files bucket private'; ok := n = 1; detail := CASE WHEN n = 1 THEN 'private' ELSE 'missing or public' END; RETURN NEXT;

  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects';
  check_name := 'no storage.objects policies'; ok := n = 0; detail := n || ' policies'; RETURN NEXT;

  -- 8. Rate-limit retention: the daily cleanup is running (no event older than 72 hours)
  SELECT count(*) INTO n FROM public.rate_limit_events WHERE created_at < now() - interval '72 hours';
  check_name := 'rate-limit cleanup running'; ok := n = 0; detail := n || ' events older than 72h'; RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.safedoc_health_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.safedoc_health_check() TO service_role;
