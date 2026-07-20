-- ================================================================
-- SafeDoc — Pre-Deploy Production State Check
-- predeploy_production_state_check.sql
--
-- READ-ONLY: SELECT ו-WITH ... SELECT בלבד.
-- אין CREATE, ALTER, INSERT, UPDATE, DELETE, DROP, TRUNCATE, GRANT, REVOKE.
--
-- מטרה: לאמת את מצב ה-DB לפני Deploy ולזהות migrations חסרות.
-- לכל בדיקה מוחזרות עמודות:
--   check_name        — שם הרכיב הנבדק
--   status:
--     PRESENT              = קיים ותקין
--     MISSING              = חסר (ראה הוראה בשדה)
--     INVALID              = קיים אך הגדרה שגויה — חסם לפני deploy
--     REVIEW REQUIRED      = RLS פעיל אך אין policies — לבדוק ידנית
--
-- Migrations שכבר הורצו ב-Production (אל תרוץ שוב):
--   ✓ migration_session1_legal_security.sql   (legal_acceptances + audit_logs + RLS)
--   ✓ migration_legal_acceptances_dedup_and_unique.sql (privacy_version + unique index)
--
-- Migrations שעדיין לא הורצו — נדרשות לפני deploy:
--   ⏳ migrations/phase2_fixes.sql             (entity_notes + archive columns)
--   ⏳ migrations/durable-rate-limiting.sql    (rate_limit_events + functions)
-- ================================================================


-- ────────────────────────────────────────────────────────────────────
-- 1. migration_session1_legal_security — legal_acceptances + audit_logs
--    הוחל ב-Production. MISSING = drift בלתי צפוי — לחקור, לא להריץ שוב.
-- ────────────────────────────────────────────────────────────────────

SELECT
  'legal_acceptances'  AS check_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'legal_acceptances'
    ) THEN 'PRESENT'
    ELSE 'MISSING — investigate production drift'
  END AS status;

SELECT
  'audit_logs'         AS check_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'audit_logs'
    ) THEN 'PRESENT'
    ELSE 'MISSING — investigate production drift'
  END AS status;


-- ────────────────────────────────────────────────────────────────────
-- 2. migration_legal_acceptances_dedup_and_unique
--    הוחל ב-Production. MISSING / INVALID = drift — לחקור, לא להריץ שוב.
-- ────────────────────────────────────────────────────────────────────

SELECT
  'legal_acceptances.privacy_version EXISTS'   AS check_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'legal_acceptances'
        AND column_name  = 'privacy_version'
    ) THEN 'PRESENT'
    ELSE 'MISSING — investigate production drift'
  END AS status;

SELECT
  'legal_acceptances.privacy_version NOT NULL' AS check_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'legal_acceptances'
        AND column_name  = 'privacy_version'
        AND is_nullable  = 'NO'
    ) THEN 'PRESENT'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'legal_acceptances'
        AND column_name  = 'privacy_version'
        AND is_nullable  = 'YES'
    ) THEN 'INVALID — column is NULLABLE; investigate production drift'
    ELSE 'MISSING — investigate production drift'
  END AS status;

-- אמת: שם + indexdef מכיל UNIQUE, user_id, terms_version, privacy_version, WHERE user_id IS NOT NULL
SELECT
  'unique index legal_acceptances_user_terms_privacy_uidx' AS check_name,
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename  = 'legal_acceptances'
        AND indexname  = 'legal_acceptances_user_terms_privacy_uidx'
    )
      THEN 'MISSING — investigate production drift'
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename  = 'legal_acceptances'
        AND indexname  = 'legal_acceptances_user_terms_privacy_uidx'
        AND upper(indexdef) LIKE '%UNIQUE%'
        AND lower(indexdef) LIKE '%user_id%'
        AND lower(indexdef) LIKE '%terms_version%'
        AND lower(indexdef) LIKE '%privacy_version%'
        AND lower(indexdef) LIKE '%user_id is not null%'
    )
      THEN 'PRESENT'
    ELSE 'INVALID — index exists but definition does not match expected (UNIQUE, user_id, terms_version, privacy_version, WHERE user_id IS NOT NULL)'
  END AS status;


-- ────────────────────────────────────────────────────────────────────
-- 3. phase2_fixes — entity_notes + archive columns
--    ⏳ טרם הורץ ב-Production. MISSING = נדרש לפני deploy.
-- ────────────────────────────────────────────────────────────────────

SELECT
  'entity_notes' AS check_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'entity_notes'
    ) THEN 'PRESENT'
    ELSE 'MISSING — run migrations/phase2_fixes.sql before deploy'
  END AS status;

-- שורה נפרדת לכל טבלה × עמודה: is_archived / archived_at / archived_by
WITH expected_archive_cols(table_name, column_name) AS (
  VALUES
    ('workers',           'is_archived'),
    ('workers',           'archived_at'),
    ('workers',           'archived_by'),
    ('vehicles',          'is_archived'),
    ('vehicles',          'archived_at'),
    ('vehicles',          'archived_by'),
    ('heavy_equipment',   'is_archived'),
    ('heavy_equipment',   'archived_at'),
    ('heavy_equipment',   'archived_by'),
    ('lifting_equipment', 'is_archived'),
    ('lifting_equipment', 'archived_at'),
    ('lifting_equipment', 'archived_by'),
    ('subcontractors',    'is_archived'),
    ('subcontractors',    'archived_at'),
    ('subcontractors',    'archived_by')
)
SELECT
  e.table_name || '.' || e.column_name  AS check_name,
  CASE
    WHEN c.column_name IS NOT NULL THEN 'PRESENT'
    ELSE                                'MISSING — run migrations/phase2_fixes.sql before deploy'
  END                                   AS status
FROM expected_archive_cols e
LEFT JOIN information_schema.columns c
  ON  c.table_schema = 'public'
  AND c.table_name   = e.table_name
  AND c.column_name  = e.column_name
ORDER BY e.table_name, e.column_name;


-- ────────────────────────────────────────────────────────────────────
-- 4. durable-rate-limiting — rate_limit_events + function signatures
--    ⏳ טרם הורץ ב-Production. MISSING = נדרש לפני deploy.
--    מאמת signature באמצעות pg_proc + pg_get_function_identity_arguments.
-- ────────────────────────────────────────────────────────────────────

SELECT
  'rate_limit_events table'    AS check_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'rate_limit_events'
    ) THEN 'PRESENT'
    ELSE 'MISSING — run migrations/durable-rate-limiting.sql before deploy'
  END AS status;

-- rate_limit_check — ציפייה: (text, text, integer, integer, inet, uuid)
WITH func_check AS (
  SELECT pg_get_function_identity_arguments(p.oid) AS args
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'rate_limit_check'
)
SELECT
  'rate_limit_check() function' AS check_name,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM func_check)
      THEN 'MISSING — run migrations/durable-rate-limiting.sql before deploy'
    WHEN EXISTS (
      SELECT 1 FROM func_check
      WHERE lower(args) LIKE '%text%'
        AND lower(args) LIKE '%integer%'
        AND lower(args) LIKE '%inet%'
        AND lower(args) LIKE '%uuid%'
    )
      THEN 'PRESENT'
    ELSE 'INVALID — function exists but signature does not match expected (text, text, integer, integer, inet, uuid)'
  END AS status;

-- rate_limit_cleanup — ציפייה: (integer)
WITH func_check AS (
  SELECT pg_get_function_identity_arguments(p.oid) AS args
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'rate_limit_cleanup'
)
SELECT
  'rate_limit_cleanup() function' AS check_name,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM func_check)
      THEN 'MISSING — run migrations/durable-rate-limiting.sql before deploy'
    WHEN EXISTS (
      SELECT 1 FROM func_check
      WHERE lower(args) = 'integer'
    )
      THEN 'PRESENT'
    ELSE 'INVALID — function exists but signature does not match expected (integer)'
  END AS status;


-- ────────────────────────────────────────────────────────────────────
-- 5. RLS — כל 20 הטבלאות הצפויות
--    LEFT JOIN מבטיח שורה לכל טבלה גם אם אינה קיימת.
-- ────────────────────────────────────────────────────────────────────

WITH expected_tables(table_name) AS (
  VALUES
    ('authorized_phones'),
    ('profiles'),
    ('workers'),
    ('documents'),
    ('subcontractors'),
    ('vehicles'),
    ('vehicle_licenses'),
    ('vehicle_insurances'),
    ('heavy_equipment'),
    ('heavy_equipment_insurances'),
    ('lifting_equipment'),
    ('lifting_machine_appointments'),
    ('safety_briefings'),
    ('height_restrictions'),
    ('manager_licenses'),
    ('professional_licenses'),
    ('entity_notes'),
    ('legal_acceptances'),
    ('audit_logs'),
    ('site_feedback')
)
SELECT
  e.table_name                                               AS check_name,
  CASE
    WHEN t.tablename IS NULL THEN 'MISSING — table does not exist in public schema'
    WHEN t.rowsecurity         THEN 'PRESENT — RLS enabled'
    ELSE                            'INVALID — RLS disabled on critical table'
  END                                                        AS status
FROM expected_tables e
LEFT JOIN pg_tables t
  ON  t.schemaname = 'public'
  AND t.tablename  = e.table_name
ORDER BY e.table_name;


-- ────────────────────────────────────────────────────────────────────
-- 6a. Policies — snapshot מלא
-- ────────────────────────────────────────────────────────────────────

SELECT
  tablename  AS table_name,
  policyname AS policy_name,
  cmd        AS operation,
  roles      AS applies_to
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ────────────────────────────────────────────────────────────────────
-- 6b. Policies — סיכום לכל טבלה צפויה
--   service_role_only = true  → PRESENT בלי user policies (גישה דרך service_role בלבד)
--   service_role_only = false → REVIEW REQUIRED אם אין policies
-- ────────────────────────────────────────────────────────────────────

WITH expected_tables(table_name, service_role_only) AS (
  VALUES
    ('authorized_phones',            true),
    ('profiles',                     false),
    ('workers',                      false),
    ('documents',                    false),
    ('subcontractors',               false),
    ('vehicles',                     false),
    ('vehicle_licenses',             false),
    ('vehicle_insurances',           false),
    ('heavy_equipment',              false),
    ('heavy_equipment_insurances',   false),
    ('lifting_equipment',            false),
    ('lifting_machine_appointments', false),
    ('safety_briefings',             false),
    ('height_restrictions',          false),
    ('manager_licenses',             false),
    ('professional_licenses',        false),
    ('entity_notes',                 false),
    ('legal_acceptances',            false),
    ('audit_logs',                   true),
    ('site_feedback',                false)
),
rls_info AS (
  SELECT tablename, rowsecurity
  FROM   pg_tables
  WHERE  schemaname = 'public'
),
policy_counts AS (
  SELECT tablename, COUNT(*) AS cnt
  FROM   pg_policies
  WHERE  schemaname = 'public'
  GROUP BY tablename
)
SELECT
  e.table_name,
  CASE
    WHEN r.tablename IS NULL THEN 'MISSING'
    WHEN r.rowsecurity       THEN 'enabled'
    ELSE                          'disabled'
  END                           AS rls_status,
  COALESCE(p.cnt, 0)           AS policy_count,
  CASE
    WHEN r.tablename IS NULL
      THEN 'MISSING — table does not exist'
    WHEN NOT r.rowsecurity
      THEN 'INVALID — RLS disabled'
    WHEN COALESCE(p.cnt, 0) = 0 AND e.service_role_only
      THEN 'PRESENT — service-role-only (no user policies expected)'
    WHEN COALESCE(p.cnt, 0) = 0
      THEN 'REVIEW REQUIRED — RLS enabled but no policies found; verify service-role-only intent'
    ELSE 'PRESENT'
  END                           AS status
FROM expected_tables   e
LEFT JOIN rls_info     r ON r.tablename = e.table_name
LEFT JOIN policy_counts p ON p.tablename = e.table_name
ORDER BY e.table_name;


-- ────────────────────────────────────────────────────────────────────
-- 7. Storage bucket — worker-files
--    שלב א: to_regclass כדי לוודא ש-storage.buckets נגישה.
--    אם שלב א מחזיר MISSING — הפסק; שלבי ב-ג ייכשלו.
-- ────────────────────────────────────────────────────────────────────

SELECT
  'storage.buckets table accessible' AS check_name,
  CASE
    WHEN to_regclass('storage.buckets') IS NOT NULL
      THEN 'PRESENT'
    ELSE 'MISSING — storage schema not accessible from this role; skip storage checks below'
  END AS status;

-- שלב ב: קיום ה-bucket (הרץ רק אם שלב א = PRESENT)
SELECT
  'storage bucket worker-files'          AS check_name,
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM storage.buckets WHERE id = 'worker-files'
    )
      THEN 'MISSING — create worker-files bucket in Supabase Storage (private)'
    ELSE 'PRESENT'
  END AS status;

-- שלב ג: bucket חייב להיות private (public = false)
SELECT
  'storage bucket worker-files private'  AS check_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM storage.buckets
      WHERE id = 'worker-files' AND public = false
    )
      THEN 'PRESENT — private (correct)'
    WHEN EXISTS (
      SELECT 1 FROM storage.buckets
      WHERE id = 'worker-files' AND public = true
    )
      THEN 'INVALID — bucket is public; must be set to private before deploy'
    ELSE 'MISSING'
  END AS status;


-- ────────────────────────────────────────────────────────────────────
-- 8. Row counts — sanity בטוח דרך pg_stat_user_tables
--    אין פנייה ישירה לטבלאות; לא ייכשל אם טבלה חסרה.
--    n_live_tup = הערכת autovacuum (לא COUNT מדויק — מספיק לבדיקת sanity).
-- ────────────────────────────────────────────────────────────────────

WITH expected_tables(table_name) AS (
  VALUES
    ('workers'),
    ('legal_acceptances'),
    ('audit_logs'),
    ('profiles')
)
SELECT
  e.table_name,
  CASE
    WHEN s.relname IS NOT NULL THEN 'EXISTS'
    ELSE                            'MISSING'
  END                             AS exists_status,
  COALESCE(s.n_live_tup, 0)      AS estimated_rows
FROM expected_tables e
LEFT JOIN pg_stat_user_tables s
  ON  s.schemaname = 'public'
  AND s.relname    = e.table_name
ORDER BY e.table_name;


-- ════════════════════════════════════════════════════════════════════
-- ציפיות לתוצאות תקינות לפני deploy:
--
--   PRESENT  → legal_acceptances, audit_logs, privacy_version, unique index
--   PRESENT  → entity_notes + כל archive columns (לאחר phase2_fixes)
--   PRESENT  → rate_limit_events, rate_limit_check(), rate_limit_cleanup()
--   PRESENT  → RLS enabled — כל 20 הטבלאות הצפויות
--   PRESENT  → storage bucket worker-files, private = true
--
--   MISSING  rate_limit_events / entity_notes  → הרץ migration לפני deploy
--   INVALID  על כל שורה                        → חסם לפני deploy
--   MISSING  שהיה PRESENT בעבר                 → investigate production drift
--   REVIEW REQUIRED                            → בדוק ידנית לפני deploy
-- ════════════════════════════════════════════════════════════════════
