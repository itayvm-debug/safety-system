-- ============================================================================
-- Migration: Worker Identity Isolation — Composite Unique Indexes
-- מיגרציה: ייחודיות זהות עובד מבוססת-חברה (אינדקסים קומפוזיטיים)
--
-- PROPOSAL ONLY — DO NOT EXECUTE WITHOUT REVIEW.
-- הצעה בלבד — אין לבצע ללא בדיקה מוקדמת ואישור.
-- אין לבצע SQL על Supabase Production.
--
-- Purpose:
--   Replace global unique indexes on national_id / passport_number with
--   composite (company_id, national_id) and (company_id, passport_number)
--   indexes. This allows the same identity to exist in multiple companies
--   (multi-tenant business rule) while still preventing duplicates within
--   a single company.
--
-- Prerequisites (run preview_worker_identity_isolation.sql first):
--   - Query 3 (intra-company national_id duplicates) must return 0 rows.
--   - Query 4 (intra-company passport_number duplicates) must return 0 rows.
--   - If either returns rows, resolve duplicates manually before running this.
--
-- Rollback:
--   Run the ROLLBACK section at the bottom of this file.
-- ============================================================================

BEGIN;

-- ─── Safety guard: abort if intra-company duplicates exist ──────────────────
-- This CTE will raise an exception if any duplicate is found, preventing
-- the migration from creating a broken state.

DO $$
DECLARE
  dup_national_id_count  INTEGER;
  dup_passport_count     INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_national_id_count
  FROM (
    SELECT company_id, national_id
    FROM workers
    WHERE national_id IS NOT NULL
    GROUP BY company_id, national_id
    HAVING COUNT(*) > 1
  ) dups;

  IF dup_national_id_count > 0 THEN
    RAISE EXCEPTION
      'Migration aborted: % intra-company duplicate(s) found in national_id. '
      'Resolve duplicates before running this migration.',
      dup_national_id_count;
  END IF;

  SELECT COUNT(*) INTO dup_passport_count
  FROM (
    SELECT company_id, passport_number
    FROM workers
    WHERE passport_number IS NOT NULL
    GROUP BY company_id, passport_number
    HAVING COUNT(*) > 1
  ) dups;

  IF dup_passport_count > 0 THEN
    RAISE EXCEPTION
      'Migration aborted: % intra-company duplicate(s) found in passport_number. '
      'Resolve duplicates before running this migration.',
      dup_passport_count;
  END IF;
END $$;

-- ─── Step 1: Drop the global unique indexes ──────────────────────────────────
-- These are the problematic indexes from migration_worker_identity.sql.
-- They enforce uniqueness across ALL companies, which violates multi-tenancy.

DROP INDEX IF EXISTS workers_national_id_unique;
DROP INDEX IF EXISTS workers_passport_number_unique;

-- ─── Step 2: Create composite unique indexes (company-scoped) ────────────────
-- The new indexes enforce uniqueness per company.
-- The same national_id/passport_number may exist in different companies.

CREATE UNIQUE INDEX IF NOT EXISTS workers_company_national_id_unique
  ON workers (company_id, national_id)
  WHERE national_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS workers_company_passport_number_unique
  ON workers (company_id, passport_number)
  WHERE passport_number IS NOT NULL;

-- ─── Step 3: Verify the new indexes ──────────────────────────────────────────
-- (informational — shows what was created)

-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'workers'
--   AND indexname IN (
--     'workers_company_national_id_unique',
--     'workers_company_passport_number_unique'
--   );

COMMIT;

-- ============================================================================
-- ROLLBACK (run only if you need to revert)
-- ============================================================================
--
-- BEGIN;
--
-- DROP INDEX IF EXISTS workers_company_national_id_unique;
-- DROP INDEX IF EXISTS workers_company_passport_number_unique;
--
-- -- WARNING: the following may fail if cross-company duplicates now exist.
-- -- Check with preview_worker_identity_isolation.sql first.
-- CREATE UNIQUE INDEX workers_national_id_unique
--   ON workers (national_id)
--   WHERE national_id IS NOT NULL;
--
-- CREATE UNIQUE INDEX workers_passport_number_unique
--   ON workers (passport_number)
--   WHERE passport_number IS NOT NULL;
--
-- COMMIT;
-- ============================================================================
