-- CHANGE. Restores client privileges exactly as recorded on 2026-11-18 before 02_apply.sql.
-- Preflight: 25 tables with all 8 privileges for anon and authenticated (no grant option, grantor postgres);
-- 9 trigger functions EXECUTE for PUBLIC, anon, authenticated; no sequences in public;
-- default privileges by postgres in public: tables (8 privileges), sequences (SELECT, UPDATE, USAGE) and
-- functions (EXECUTE) for anon and authenticated. Trigger functions had no search_path set.
-- Ends in ROLLBACK; replace with COMMIT to apply.
BEGIN;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE
  public.audit_logs, public.companies, public.company_members, public.documents, public.entity_notes,
  public.heavy_equipment, public.heavy_equipment_insurances, public.height_restrictions, public.legal_acceptances,
  public.lifting_equipment, public.lifting_machine_appointments, public.manager_licenses, public.manager_user_mappings,
  public.professional_licenses, public.profiles, public.review_reminder_log, public.safety_briefings,
  public.subcontractors, public.vehicle_insurances, public.vehicle_licenses, public.vehicles,
  public.worker_review_assignments, public.worker_transfer_audit, public.worker_weekly_reviews, public.workers
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.enforce_entity_notes_company(), public.enforce_heavy_equipment_child_company_id(),
  public.enforce_heavy_equipment_subcontractor_same_company(), public.enforce_lifting_equipment_subcontractor_same_company(),
  public.enforce_lma_company(), public.enforce_vehicle_child_company_id(), public.normalize_username(),
  public.update_updated_at(), public.update_wwr_updated_at()
  TO anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

ALTER FUNCTION public.enforce_entity_notes_company()                         RESET search_path;
ALTER FUNCTION public.enforce_heavy_equipment_child_company_id()             RESET search_path;
ALTER FUNCTION public.enforce_heavy_equipment_subcontractor_same_company()   RESET search_path;
ALTER FUNCTION public.enforce_lifting_equipment_subcontractor_same_company() RESET search_path;
ALTER FUNCTION public.enforce_lma_company()                                  RESET search_path;
ALTER FUNCTION public.enforce_vehicle_child_company_id()                     RESET search_path;
ALTER FUNCTION public.normalize_username()                                   RESET search_path;
ALTER FUNCTION public.update_updated_at()                                    RESET search_path;
ALTER FUNCTION public.update_wwr_updated_at()                                RESET search_path;

-- DROP FUNCTION IF EXISTS public.safedoc_health_check();  -- only if also reverting the daily check code

ROLLBACK;
-- COMMIT;
