-- ================================================================
-- SafeDoc — RLS Hardening: Remove authenticated mutation policies
-- ================================================================
--
-- PROBLEM:
--   11 tenant-data tables have RLS policies allowing the `authenticated`
--   role to INSERT, UPDATE, and DELETE rows for any company they belong to.
--
--   These policies use:
--     USING (company_id IN (
--       SELECT cm.company_id FROM company_members cm
--       WHERE cm.user_id = auth.uid() AND cm.is_active = true
--     ))
--
--   This means ANY authenticated user (owner, admin, OR member) who holds
--   a valid Supabase JWT + the public anon key can bypass the application's
--   API authorization layer and mutate data directly via the Supabase client.
--
--   The application enforces requireCompanyAdminRole() at the API layer to
--   restrict mutations to owners/admins. That enforcement is neutralised if
--   a member-role user calls Supabase directly.
--
-- FIX:
--   Drop all authenticated INSERT/UPDATE/DELETE policies.
--   SELECT policies are left in place (read is OK for all members).
--   service_role ALL policies are left in place (app goes through these).
--
-- IMPACT ON APPLICATION:
--   Zero — all mutations go through createServiceClient() which uses the
--   service_role key and bypasses RLS entirely. No application code uses
--   the anon-key Supabase client for mutations.
--
-- EMPLOYEE REVIEWS EXCEPTION:
--   Not applicable here: manager_user_mappings, worker_review_assignments,
--   worker_weekly_reviews, worker_transfer_audit already have service_role
--   ONLY policies — no authenticated write policies exist on those tables.
--
-- SAFE TO RUN:
--   All DROPs use IF EXISTS — idempotent, no-op if already removed.
--   No data is modified. No tables are altered.
-- ================================================================

BEGIN;

-- ── workers ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "workers_insert_company"            ON workers;
DROP POLICY IF EXISTS "workers_update_company"            ON workers;
DROP POLICY IF EXISTS "workers_delete_company"            ON workers;
-- legacy name from pre-migration state (batch1 rollback section)
DROP POLICY IF EXISTS "authenticated users can manage workers" ON workers;

-- ── documents ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "documents_insert_company"          ON documents;
DROP POLICY IF EXISTS "documents_update_company"          ON documents;
DROP POLICY IF EXISTS "documents_delete_company"          ON documents;
-- legacy
DROP POLICY IF EXISTS "authenticated users can manage documents" ON documents;

-- ── subcontractors ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "subcontractors_insert_company"     ON subcontractors;
DROP POLICY IF EXISTS "subcontractors_update_company"     ON subcontractors;
DROP POLICY IF EXISTS "subcontractors_delete_company"     ON subcontractors;
-- legacy (broad catch-alls from rollback section of batch2)
DROP POLICY IF EXISTS "Authenticated users can read subcontractors"   ON subcontractors;
DROP POLICY IF EXISTS "Authenticated users can insert subcontractors" ON subcontractors;
DROP POLICY IF EXISTS "Authenticated users can update subcontractors" ON subcontractors;
DROP POLICY IF EXISTS "Authenticated users can delete subcontractors" ON subcontractors;

-- ── vehicles ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "vehicles_insert_company"           ON vehicles;
DROP POLICY IF EXISTS "vehicles_update_company"           ON vehicles;
DROP POLICY IF EXISTS "vehicles_delete_company"           ON vehicles;
-- legacy (broad catch-all from batch2 rollback section)
DROP POLICY IF EXISTS "vehicles_authenticated"            ON vehicles;

-- ── vehicle_licenses ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "vehicle_licenses_insert_company"   ON vehicle_licenses;
DROP POLICY IF EXISTS "vehicle_licenses_update_company"   ON vehicle_licenses;
DROP POLICY IF EXISTS "vehicle_licenses_delete_company"   ON vehicle_licenses;

-- ── vehicle_insurances ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "vehicle_insurances_insert_company" ON vehicle_insurances;
DROP POLICY IF EXISTS "vehicle_insurances_update_company" ON vehicle_insurances;
DROP POLICY IF EXISTS "vehicle_insurances_delete_company" ON vehicle_insurances;

-- ── heavy_equipment ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "heavy_equipment_insert_company"    ON heavy_equipment;
DROP POLICY IF EXISTS "heavy_equipment_update_company"    ON heavy_equipment;
DROP POLICY IF EXISTS "heavy_equipment_delete_company"    ON heavy_equipment;
-- legacy
DROP POLICY IF EXISTS "Auth users can manage heavy_equipment" ON heavy_equipment;

-- ── heavy_equipment_insurances ────────────────────────────────────────────────
DROP POLICY IF EXISTS "heavy_equipment_insurances_insert_company" ON heavy_equipment_insurances;
DROP POLICY IF EXISTS "heavy_equipment_insurances_update_company" ON heavy_equipment_insurances;
DROP POLICY IF EXISTS "heavy_equipment_insurances_delete_company" ON heavy_equipment_insurances;

-- ── lifting_equipment ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS lifting_equipment_insert_own_company ON lifting_equipment;
DROP POLICY IF EXISTS lifting_equipment_update_own_company ON lifting_equipment;
DROP POLICY IF EXISTS lifting_equipment_delete_own_company ON lifting_equipment;
-- legacy
DROP POLICY IF EXISTS "Auth users can manage lifting_equipment" ON lifting_equipment;

-- ── lifting_machine_appointments ──────────────────────────────────────────────
DROP POLICY IF EXISTS "lma_insert_own_company"            ON lifting_machine_appointments;
DROP POLICY IF EXISTS "lma_update_own_company"            ON lifting_machine_appointments;
DROP POLICY IF EXISTS "lma_delete_own_company"            ON lifting_machine_appointments;
-- legacy
DROP POLICY IF EXISTS "Auth users can manage lifting_machine_appointments" ON lifting_machine_appointments;

-- ── entity_notes ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "entity_notes_insert_own_company"   ON entity_notes;
DROP POLICY IF EXISTS "entity_notes_update_own_company"   ON entity_notes;
DROP POLICY IF EXISTS "entity_notes_delete_own_company"   ON entity_notes;
-- legacy (already removed by rls_entity_notes_cleanup.sql, but listed for completeness)
DROP POLICY IF EXISTS "authenticated_all"                 ON entity_notes;
DROP POLICY IF EXISTS "authenticated manage notes"        ON entity_notes;


-- ================================================================
-- ASSERTION BLOCK: verify service_role ALL policies intact + no mutations remain
-- ================================================================
DO $$
DECLARE
  missing_count    INT;
  remaining_count  INT;
BEGIN
  -- Warn if any service_role ALL policy was accidentally dropped
  SELECT COUNT(*) INTO missing_count
  FROM (VALUES
    ('workers',                     'workers_service_all'),
    ('documents',                   'documents_service_all'),
    ('subcontractors',              'subcontractors_service_all'),
    ('vehicles',                    'vehicles_service_all'),
    ('vehicle_licenses',            'vehicle_licenses_service_all'),
    ('vehicle_insurances',          'vehicle_insurances_service_all'),
    ('heavy_equipment',             'heavy_equipment_service_all'),
    ('heavy_equipment_insurances',  'heavy_equipment_insurances_service_all'),
    ('lifting_equipment',           'lifting_equipment_service_all'),
    ('lifting_machine_appointments','lma_service_all'),
    ('entity_notes',                'entity_notes_service_all')
  ) AS expected(tbl, pol)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename   = expected.tbl
      AND p.policyname  = expected.pol
  );

  IF missing_count > 0 THEN
    RAISE WARNING '% service_role ALL policies not found — application writes may break!', missing_count;
  ELSE
    RAISE NOTICE 'All 11 service_role ALL policies confirmed present.';
  END IF;

  -- Verify zero authenticated INSERT/UPDATE/DELETE policies remain
  SELECT COUNT(*) INTO remaining_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'workers', 'documents', 'subcontractors', 'vehicles',
      'vehicle_licenses', 'vehicle_insurances',
      'heavy_equipment', 'heavy_equipment_insurances',
      'lifting_equipment', 'lifting_machine_appointments',
      'entity_notes'
    )
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
    AND roles @> ARRAY['authenticated']::name[];

  IF remaining_count > 0 THEN
    RAISE WARNING '% authenticated mutation policies still exist on tenant tables!', remaining_count;
  ELSE
    RAISE NOTICE 'RLS hardening complete: zero authenticated mutation policies on tenant tables.';
  END IF;

  RAISE NOTICE 'rls_remove_authenticated_mutations migration complete.';
END $$;

COMMIT;
