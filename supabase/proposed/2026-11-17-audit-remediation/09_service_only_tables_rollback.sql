-- ================================================================
-- PROPOSED, NOT RUN. Rollback for 07_service_only_tables_lockdown.sql.
-- Ends in ROLLBACK (dry run); change to COMMIT to apply.
--
-- Choose ONE level.
--
-- Level A: the application cannot read or write site_feedback after 07.
--   The fix leaves service_role privileges unchanged and service_role
--   bypasses RLS, so this is not expected. If it happens, turn RLS off on
--   site_feedback only. Client privileges stay revoked, so clients are
--   still blocked by the missing grants.
--
-- Level B: return to the exact state before 07, including the exposure.
--   Use only on an explicit decision. Paste the "15 rollback sql" rows
--   from the preflight CSV in place of the template below. Those rows
--   hold the exact privileges and grant options, including TRUNCATE,
--   REFERENCES, TRIGGER and sequence grants if they were there.
--   The template reflects the live check of 2026-11-17 only.
-- ================================================================
BEGIN;

-- ── Level A ──────────────────────────────────────────────────────
ALTER TABLE public.site_feedback DISABLE ROW LEVEL SECURITY;

-- ── Level B (from the live preflight of 2026-11-18, section 15) ──
-- Exact statements: results/2026-11-18_06_section15_rollback.sql (51 statements).
-- Grants, identical for the three tables, all from grantor postgres, no grant option:
--   anon and authenticated: DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- No PUBLIC, column or sequence grants existed. Uncomment to apply Level B:
-- GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   ON TABLE public.site_feedback, public.manager_insurances, public.legal_acceptances_dedup_backup
--   TO anon, authenticated;
-- ALTER TABLE public.manager_insurances             DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.legal_acceptances_dedup_backup DISABLE ROW LEVEL SECURITY;
-- (ALTER TABLE public.site_feedback DISABLE ROW LEVEL SECURITY is in Level A above)

ROLLBACK;
-- COMMIT;
