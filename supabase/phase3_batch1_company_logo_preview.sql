-- phase3_batch1_company_logo_preview.sql
-- READ-ONLY preview: shows which companies have logo data stored in settings JSONB
-- and what would be backfilled into the new companies.logo_url column.
--
-- DO NOT run as a migration. Run in the Supabase SQL editor or psql
-- for read-only verification only. No INSERT / UPDATE / DELETE is issued.
--
-- Background:
--   The upload-logo route (phase 3 UX session) stored logos under settings->>'logo_url'
--   (flat, top-level key). The CompanyBranding schema in lib/company/settings.ts also
--   defines settings->'branding'->>'logoUrl' (nested). Both locations are checked.
--   The migration COALESCE prefers the flat location when both are present.
--
-- Also shown: whether the column already exists (idempotency check).

-- ─── 1. Which companies have logo data to backfill ────────────────────────────

SELECT
  id,
  name,
  slug,
  is_active,

  settings->>'logo_url'                   AS settings_logo_url_flat,
  settings->'branding'->>'logoUrl'        AS settings_branding_logo_url,

  COALESCE(
    settings->>'logo_url',
    settings->'branding'->>'logoUrl'
  )                                        AS logo_url_to_backfill,

  CASE
    WHEN settings->>'logo_url'             IS NOT NULL THEN 'flat (settings.logo_url)'
    WHEN settings->'branding'->>'logoUrl'  IS NOT NULL THEN 'nested (settings.branding.logoUrl)'
    ELSE 'none'
  END                                      AS source

FROM companies
ORDER BY
  CASE
    WHEN settings->>'logo_url' IS NOT NULL
      OR settings->'branding'->>'logoUrl' IS NOT NULL
    THEN 0 ELSE 1
  END,
  name;


-- ─── 2. Column existence check (will be no-op if already present) ─────────────

SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name  = 'companies'
  AND column_name = 'logo_url';
