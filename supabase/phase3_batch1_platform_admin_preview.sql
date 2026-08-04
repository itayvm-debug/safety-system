-- Phase 3 Batch 1 — Platform Admin Schema Preview
-- Status: NO SCHEMA CHANGES REQUIRED
--
-- All tables needed for Phase 3 Batch 1 already exist:
--   companies        (id, name, name_en, slug UNIQUE, registration, address, phone,
--                    contact_email, safety_email, is_active, settings JSONB,
--                    created_at, updated_at)
--   company_members  (id, company_id FK, user_id FK, role, is_active, joined_at,
--                    UNIQUE(company_id, user_id))
--   profiles         (id, full_name, username UNIQUE, email UNIQUE, role, job_title,
--                    is_active, created_at, updated_at)
--
-- This file is a READ-ONLY verification that the schema supports Phase 3 operations.
-- Run this on Supabase SQL Editor BEFORE deployment to confirm schema state.

SELECT
  'companies'       AS table_name,
  COUNT(*)          AS row_count,
  bool_and(id IS NOT NULL AND name IS NOT NULL AND is_active IS NOT NULL) AS schema_ok
FROM companies

UNION ALL

SELECT
  'company_members' AS table_name,
  COUNT(*)          AS row_count,
  bool_and(id IS NOT NULL AND company_id IS NOT NULL AND user_id IS NOT NULL AND role IS NOT NULL) AS schema_ok
FROM company_members

UNION ALL

SELECT
  'profiles'        AS table_name,
  COUNT(*)          AS row_count,
  bool_and(id IS NOT NULL AND role IS NOT NULL AND is_active IS NOT NULL) AS schema_ok
FROM profiles;
