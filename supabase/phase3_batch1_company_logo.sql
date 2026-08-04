-- phase3_batch1_company_logo.sql
-- Migration: add companies.logo_url TEXT NULL and backfill from settings JSONB.
--
-- DO NOT run without reviewing the preview query (phase3_batch1_company_logo_preview.sql).
-- DO NOT run SQL. DO NOT commit. DO NOT push. DO NOT deploy.
--
-- Design:
--   1. ADD COLUMN guarded by IF NOT EXISTS — safe to run more than once.
--   2. Backfill only rows where logo_url IS NULL and settings has logo data,
--      so re-running does not overwrite manually-set values.
--   3. settings JSON is NEVER modified — the old keys remain for the
--      compatibility window (see phase3_batch1_company_logo_post_check.sql).
--      Remove them in a follow-up migration once the application no longer
--      reads from settings for the logo.
--
-- Backfill source priority:
--   1. settings->>'logo_url'            (flat — written by upload-logo route v1)
--   2. settings->'branding'->>'logoUrl' (nested — CompanyBranding schema location)

BEGIN;

-- Step 1: Add column (idempotent — no-op if the column already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name  = 'companies'
      AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE companies ADD COLUMN logo_url TEXT NULL;
  END IF;
END
$$;

-- Step 2: Backfill logo_url from settings JSONB.
-- Only updates rows where logo_url is still NULL and settings has logo data.
-- Existing settings JSON (branding, features, etc.) is left untouched.
UPDATE companies
SET logo_url = COALESCE(
  settings->>'logo_url',
  settings->'branding'->>'logoUrl'
)
WHERE logo_url IS NULL
  AND (
    settings->>'logo_url'              IS NOT NULL
    OR settings->'branding'->>'logoUrl'  IS NOT NULL
  );

COMMIT;
