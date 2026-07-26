-- ============================================================================
-- Preview: Worker Identity Isolation — Current State Inspection
-- תצוגה מקדימה: מצב הייחודיות הנוכחי של זהות עובד
--
-- READ-ONLY. Do not run on production without review.
-- אין לבצע SQL על Supabase Production — קובץ זה מיועד לעיון בלבד.
-- ============================================================================

-- ─── 1. הצגת כל האינדקסים הייחודיים על טבלת workers ───────────────────────

SELECT
    indexname,
    indexdef
FROM
    pg_indexes
WHERE
    tablename = 'workers'
    AND indexdef ILIKE '%unique%'
ORDER BY
    indexname;

-- Expected current output (problematic — global, not company-scoped):
--
--   workers_national_id_unique    | CREATE UNIQUE INDEX workers_national_id_unique
--                                   ON workers (national_id) WHERE national_id IS NOT NULL
--
--   workers_passport_number_unique | CREATE UNIQUE INDEX workers_passport_number_unique
--                                   ON workers (passport_number) WHERE passport_number IS NOT NULL
--
-- Problem: these indexes enforce uniqueness GLOBALLY across all companies.
-- A worker with national_id '203530332' in Company A blocks insertion of the
-- same national_id in Company B, violating the multi-tenant business rule.

-- ─── 2. בדיקת כפילויות חוצות-חברות (cross-company same national_id) ────────
-- האם קיימים כעת עובדים עם אותה תעודת זהות בחברות שונות?
-- (לאחר המיגרציה לאינדקס קומפוזיטי, שאילתה זו תאפשר כפילויות חוצות-חברות)

SELECT
    national_id,
    COUNT(DISTINCT company_id) AS companies_count,
    COUNT(*)                   AS worker_count,
    array_agg(DISTINCT company_id ORDER BY company_id) AS company_ids
FROM
    workers
WHERE
    national_id IS NOT NULL
GROUP BY
    national_id
HAVING
    COUNT(DISTINCT company_id) > 1
ORDER BY
    companies_count DESC,
    national_id;

-- Expected: 0 rows (current global index prevents this — but also incorrectly
-- blocks legitimate multi-tenant use).

-- ─── 3. בדיקת כפילויות בתוך חברה (intra-company duplicates) ────────────────
-- חיפוש כפילויות לגיטימיות שצריכות להיחסם גם לאחר המיגרציה

SELECT
    company_id,
    national_id,
    COUNT(*) AS count,
    array_agg(id ORDER BY created_at) AS worker_ids
FROM
    workers
WHERE
    national_id IS NOT NULL
GROUP BY
    company_id, national_id
HAVING
    COUNT(*) > 1
ORDER BY
    company_id, national_id;

-- Expected: 0 rows.
-- If this query returns rows, the migration MUST be aborted because
-- the new composite index would violate existing data.

-- ─── 4. אותו בדיקה עבור passport_number ─────────────────────────────────────

SELECT
    company_id,
    passport_number,
    COUNT(*) AS count,
    array_agg(id ORDER BY created_at) AS worker_ids
FROM
    workers
WHERE
    passport_number IS NOT NULL
GROUP BY
    company_id, passport_number
HAVING
    COUNT(*) > 1
ORDER BY
    company_id, passport_number;

-- Expected: 0 rows.

-- ─── 5. סיכום נתונים כלליים ────────────────────────────────────────────────

SELECT
    (SELECT COUNT(*) FROM workers)                                   AS total_workers,
    (SELECT COUNT(*) FROM workers WHERE national_id IS NOT NULL)     AS workers_with_national_id,
    (SELECT COUNT(*) FROM workers WHERE passport_number IS NOT NULL) AS workers_with_passport,
    (SELECT COUNT(*) FROM companies WHERE is_active = true)          AS active_companies;
