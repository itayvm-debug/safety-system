-- verify_worker_identity_isolation.sql
-- READ-ONLY verification of Phase 2 worker identity isolation migration.
-- Returns one row with migration_state: 'APPLIED' | 'NOT APPLIED' | 'PARTIAL' | 'BLOCKED'
-- Run after the production migration to confirm the indexes and uniqueness constraints are active.
-- Safe to run at any time; makes no changes.

WITH
-- ── Check 1: Unique indexes exist on workers table ──────────────────────────
index_check AS (
  SELECT
    COUNT(*) FILTER (
      WHERE schemaname = 'public'
        AND tablename  = 'workers'
        AND indexname  = 'workers_national_id_unique'
    ) AS has_national_id_idx,
    COUNT(*) FILTER (
      WHERE schemaname = 'public'
        AND tablename  = 'workers'
        AND indexname  = 'workers_passport_number_unique'
    ) AS has_passport_idx
  FROM pg_indexes
),

-- ── Check 2: Cross-company duplicates (national_id) ──────────────────────────
-- A value > 0 means the migration is BLOCKED — duplicate data would violate the
-- unique constraint and must be resolved before applying the migration.
cross_company_national_id AS (
  SELECT COUNT(*) AS dup_count
  FROM (
    SELECT national_id
    FROM workers
    WHERE national_id IS NOT NULL AND national_id <> ''
    GROUP BY national_id
    HAVING COUNT(DISTINCT company_id) > 1
  ) t
),

-- ── Check 3: Cross-company duplicates (passport_number) ─────────────────────
cross_company_passport AS (
  SELECT COUNT(*) AS dup_count
  FROM (
    SELECT passport_number
    FROM workers
    WHERE passport_number IS NOT NULL AND passport_number <> ''
    GROUP BY passport_number
    HAVING COUNT(DISTINCT company_id) > 1
  ) t
),

-- ── Derive migration state ───────────────────────────────────────────────────
combined AS (
  SELECT
    i.has_national_id_idx,
    i.has_passport_idx,
    n.dup_count AS national_id_cross_company_dups,
    p.dup_count AS passport_cross_company_dups,
    (n.dup_count + p.dup_count) AS total_blocking_dups
  FROM index_check i, cross_company_national_id n, cross_company_passport p
)

SELECT
  CASE
    WHEN total_blocking_dups > 0
      THEN 'BLOCKED'
    WHEN has_national_id_idx = 1 AND has_passport_idx = 1
      THEN 'APPLIED'
    WHEN has_national_id_idx = 0 AND has_passport_idx = 0
      THEN 'NOT APPLIED'
    ELSE
      'PARTIAL'
  END                         AS migration_state,
  has_national_id_idx         AS national_id_index_present,
  has_passport_idx            AS passport_index_present,
  national_id_cross_company_dups,
  passport_cross_company_dups,
  total_blocking_dups,
  CASE
    WHEN total_blocking_dups > 0
      THEN 'Resolve duplicate national_id / passport_number values across companies before applying migration'
    WHEN has_national_id_idx = 1 AND has_passport_idx = 1
      THEN 'Worker identity isolation migration is fully applied and active'
    WHEN has_national_id_idx = 0 AND has_passport_idx = 0
      THEN 'Migration not yet applied; run preview_worker_identity_isolation.sql to apply'
    ELSE
      'Partial state — one index missing; investigate before proceeding'
  END                         AS notes
FROM combined;
