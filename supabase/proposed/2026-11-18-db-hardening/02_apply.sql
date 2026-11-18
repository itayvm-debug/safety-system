-- CHANGE. Close client (anon / authenticated) access in schema public, now and for new objects;
-- pin search_path on trigger functions; install safedoc_health_check().
-- The application reaches tables only as service_role (verified 2026-11-18: the anon key is used
-- only for supabase.auth.signInWithPassword in app/api/auth/login/route.ts).
-- Ends in ROLLBACK (dry run). Replace with COMMIT to apply. Run as postgres.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND rolbypassrls) THEN
    RAISE EXCEPTION 'ABORT: service_role does not bypass RLS';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p') AND NOT relrowsecurity) THEN
    RAISE EXCEPTION 'ABORT: a public table has RLS off';
  END IF;
END $$;

-- 1. Existing objects
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- 2. Objects created later by postgres (migrations run as postgres)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- 3. Fixed search_path on trigger functions (Supabase advisor function_search_path_mutable)
ALTER FUNCTION public.enforce_entity_notes_company()                         SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_heavy_equipment_child_company_id()             SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_heavy_equipment_subcontractor_same_company()   SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_lifting_equipment_subcontractor_same_company() SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_lma_company()                                  SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_vehicle_child_company_id()                     SET search_path = public, pg_temp;
ALTER FUNCTION public.normalize_username()                                   SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at()                                    SET search_path = public, pg_temp;
ALTER FUNCTION public.update_wwr_updated_at()                                SET search_path = public, pg_temp;

-- 4. Health check: body of supabase/migrations/safedoc-health-check.sql is inserted here when run.

ROLLBACK;
-- COMMIT;
