-- phase3_batch1_company_logo_post_check.sql
-- Post-migration verification. Results appear in the SQL editor Results pane.
-- No RAISE NOTICE dependency. No INSERT / UPDATE / DELETE.
--
-- Expected values after a clean migration:
--   column_exists       = 1  (column was added)
--   unbackfilled        = 0  (all settings logo data was copied to the column)
--   logo_url_mismatches = 0  (column value equals what settings would produce)
--
-- If companies_with_logo_url = 0 that is normal when no logos were uploaded
-- before the migration ran — not an error.

-- ─── Summary counters ─────────────────────────────────────────────────────────

SELECT
  COUNT(*)                                                        AS total_companies,
  COUNT(logo_url)                                                 AS companies_with_logo_url,

  -- Rows where settings has logo data but logo_url was NOT backfilled (should be 0)
  SUM(CASE
    WHEN logo_url IS NULL
     AND (
       settings->>'logo_url'              IS NOT NULL
       OR settings->'branding'->>'logoUrl'  IS NOT NULL
     )
    THEN 1 ELSE 0
  END)                                                            AS unbackfilled,

  -- Rows where logo_url exists but differs from what COALESCE(settings sources) gives
  -- Non-zero means manual edit happened after backfill, or backfill ran twice with
  -- different data — investigate before removing settings keys
  SUM(CASE
    WHEN logo_url IS NOT NULL
     AND COALESCE(
       settings->>'logo_url',
       settings->'branding'->>'logoUrl'
     ) IS NOT NULL
     AND logo_url <> COALESCE(
       settings->>'logo_url',
       settings->'branding'->>'logoUrl'
     )
    THEN 1 ELSE 0
  END)                                                            AS logo_url_mismatches,

  -- Idempotency guard: confirm the column exists
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_name  = 'companies'
      AND column_name = 'logo_url'
  )                                                               AS column_exists

FROM companies;


-- ─── Detail rows: companies with logo data (for manual spot-check) ────────────

SELECT
  id,
  name,
  slug,
  logo_url,
  settings->>'logo_url'              AS settings_flat,
  settings->'branding'->>'logoUrl'   AS settings_branding
FROM companies
WHERE logo_url IS NOT NULL
   OR settings->>'logo_url' IS NOT NULL
   OR settings->'branding'->>'logoUrl' IS NOT NULL
ORDER BY name;
