-- ================================================================
-- RLS Cleanup: entity_notes — drop permissive "authenticated_all" policy
-- ================================================================
--
-- PROBLEM:
--   phase2_fixes.sql created an overly-permissive policy:
--     CREATE POLICY authenticated_all ON entity_notes
--       FOR ALL TO authenticated USING (true) WITH CHECK (true);
--
--   mt_phase2_batch6.sql created per-company policies (correct) but only
--   dropped "authenticated manage notes", NOT "authenticated_all".
--
--   In Supabase, multiple permissive policies are combined with OR.
--   So: USING (true) OR (company_id IN (...)) = true — any authenticated
--   user can read any entity_note, neutralising the correct policies.
--
-- FIX:
--   Drop "authenticated_all" if it still exists.
--   Verify the per-company policies from mt_phase2_batch6 are intact.
--
-- IMPACT ON APPLICATION:
--   Zero — all data access goes through createServiceClient() which
--   bypasses RLS entirely. This only affects direct Supabase client access
--   (anon key + user JWT), which is not used in production code today.
--
-- SAFE TO RUN:
--   Idempotent — DROP POLICY IF EXISTS is a no-op if already dropped.
-- ================================================================

BEGIN;

-- Drop the permissive catch-all that neutralises the per-company policies
DROP POLICY IF EXISTS "authenticated_all"        ON entity_notes;
DROP POLICY IF EXISTS "authenticated manage notes" ON entity_notes;

-- Verify the correct per-company policies are present (assertions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'entity_notes'
      AND policyname  = 'entity_notes_select_own_company'
  ) THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: entity_notes_select_own_company policy missing. '
      'Run mt_phase2_batch6.sql first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'entity_notes'
      AND policyname  = 'entity_notes_service_all'
  ) THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: entity_notes_service_all policy missing. '
      'Run mt_phase2_batch6.sql first.';
  END IF;

  -- Confirm the permissive policy is gone
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'entity_notes'
      AND policyname  = 'authenticated_all'
  ) THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: authenticated_all policy still exists after DROP.';
  END IF;

  RAISE NOTICE 'entity_notes RLS: authenticated_all removed, per-company policies intact — OK';
END $$;

COMMIT;
