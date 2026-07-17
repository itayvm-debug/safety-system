-- ================================================================
-- SafeDoc — Migration: legal_acceptances dedup + privacy_version + unique constraint
-- migration_legal_acceptances_dedup_and_unique.sql
-- idempotent — בטוח להרצה חוזרת
-- נריץ בתוך transaction — כשל באמצע = rollback אוטומטי
--
-- מפתח לוגי לכפילויות: (user_id, terms_version, privacy_version)
-- כל השלבים משתמשים במפתח זה.
--
-- סדר הפעולות (חשוב!):
--   1. ADD COLUMN privacy_version (nullable)
--   2. FILL: privacy_version = terms_version WHERE NULL
--   3. Assert: אין NULL לפני SET NOT NULL
--   4. SET NOT NULL
--   5. יצירת טבלת backup IF NOT EXISTS
--   6. Assert: הbackup נוצר לפני DELETE
--   7. DELETE כפילויות (שומר הקדום ביותר לפי created_at, id כtiebreaker)
--   8. Assert: אין כפילויות לאחר DELETE
--   9. DROP אינדקס ישן
--  10. CREATE UNIQUE INDEX חלקי חדש
--
-- ⚠️ הרץ את preview_legal_acceptances_dedup.sql (READ-ONLY) לפני הרצת קובץ זה
-- ⚠️ הרץ ב-Supabase SQL Editor בלבד
-- ⚠️ אל תריץ על DB עם נתוני production ללא אמות
-- ================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────
-- שלב 1: הוספת עמודת privacy_version (nullable תחילה)
--         ADD COLUMN IF NOT EXISTS — בטוח להרצה חוזרת
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE legal_acceptances
  ADD COLUMN IF NOT EXISTS privacy_version TEXT;

-- ──────────────────────────────────────────────────────────────────
-- שלב 2: מילוי ברירת מחדל לשורות קיימות
--         לוגיקה: הסכמה קיימת ניתנה על שני המסמכים יחד; גרסאות
--         טרם הופרדו לשני שדות נפרדים, לכן privacy_version = terms_version.
-- ──────────────────────────────────────────────────────────────────

UPDATE legal_acceptances
SET privacy_version = terms_version
WHERE privacy_version IS NULL;

-- ──────────────────────────────────────────────────────────────────
-- שלב 3: Assert — אין NULL לפני SET NOT NULL
--         בדיקה זו מגנה מפני race condition ומשאירה DB במצב נקי.
-- ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM legal_acceptances WHERE privacy_version IS NULL LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'ABORT: legal_acceptances contains rows with privacy_version IS NULL. '
      'Check step 2 (UPDATE) — cannot proceed to SET NOT NULL.';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- שלב 4: SET NOT NULL — כל השורות מאוכלסות, בטוח להגביל
-- ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'legal_acceptances'
      AND column_name = 'privacy_version'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE legal_acceptances
      ALTER COLUMN privacy_version SET NOT NULL;
    RAISE NOTICE 'privacy_version set to NOT NULL.';
  ELSE
    RAISE NOTICE 'privacy_version already NOT NULL — skipped.';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- שלב 5: טבלת גיבוי של הכפילויות
--         נוצרת פעם אחת בלבד (IF NOT EXISTS).
--         מכילה רק את הרשומות המאוחרות שיימחקו — לא את הראשונה.
--
--         מפתח הכפילויות: (user_id, terms_version, privacy_version)
--         Tiebreaker: created_at ASC, id ASC
-- ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'legal_acceptances_dedup_backup'
  ) THEN
    CREATE TABLE legal_acceptances_dedup_backup AS
    SELECT
      la.*,
      now()::timestamptz AS backed_up_at,
      'later duplicate — earliest record per (user_id, terms_version, privacy_version) was kept'::text AS dedup_reason
    FROM legal_acceptances la
    WHERE la.user_id IS NOT NULL
      AND la.id NOT IN (
        SELECT DISTINCT ON (user_id, terms_version, privacy_version) id
        FROM legal_acceptances
        WHERE user_id IS NOT NULL
        ORDER BY user_id, terms_version, privacy_version, created_at ASC, id ASC
      );

    RAISE NOTICE 'Backup table created: % rows backed up.',
      (SELECT COUNT(*) FROM legal_acceptances_dedup_backup);
  ELSE
    RAISE NOTICE 'Backup table already exists — skipping backup step.';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- שלב 6: Assert — הbackup קיים לפני DELETE
--         אם הטבלה לא קיימת, אין למחוק.
-- ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'legal_acceptances_dedup_backup'
  ) THEN
    RAISE EXCEPTION
      'ABORT: legal_acceptances_dedup_backup does not exist. '
      'Step 5 (backup creation) must complete before DELETE can proceed.';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- שלב 7: מחיקת רשומות כפולות
--         שומרת הרשומה הקדומה ביותר לפי (created_at ASC, id ASC)
--         לכל שילוב (user_id, terms_version, privacy_version).
--
--         לא נמחקות:
--         - רשומות עם user_id IS NULL (היסטוריה של משתמשים שנמחקו)
--         - רשומות ייחודיות
--         - רשומות עם user_id, terms_version, privacy_version שונה
-- ──────────────────────────────────────────────────────────────────

DELETE FROM legal_acceptances
WHERE user_id IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT ON (user_id, terms_version, privacy_version) id
    FROM legal_acceptances
    WHERE user_id IS NOT NULL
    ORDER BY user_id, terms_version, privacy_version, created_at ASC, id ASC
  );

-- ──────────────────────────────────────────────────────────────────
-- שלב 8: Assert — אין כפילויות אחרי DELETE
--         אם נמצאות כפילויות — RAISE EXCEPTION → transaction תתבצע rollback
-- ──────────────────────────────────────────────────────────────────

DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT 1
    FROM legal_acceptances
    WHERE user_id IS NOT NULL
    GROUP BY user_id, terms_version, privacy_version
    HAVING COUNT(*) > 1
  ) sub;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'ABORT: % duplicate groups remain after DELETE on (user_id, terms_version, privacy_version). '
      'Rolling back transaction. Investigate before re-running.',
      dup_count;
  ELSE
    RAISE NOTICE 'Assert passed: no duplicates remain on (user_id, terms_version, privacy_version).';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- שלב 9: הסרת unique index ישן — (user_id, terms_version) בלבד
--         לא רלוונטי עוד; יוחלף בשלב 10 ב-index כולל privacy_version
-- ──────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS legal_acceptances_user_version_uidx;

-- ──────────────────────────────────────────────────────────────────
-- שלב 10: יצירת unique index חלקי חדש
--
--         מפתח: (user_id, terms_version, privacy_version)
--         WHERE user_id IS NOT NULL
--
--         הסבר לחריג user_id IS NULL:
--         - NULL IS NOT equal NULL ב-PostgreSQL
--         - לכן, גם ללא חריג, שורות עם user_id=NULL לא יחסמו אחת את השניה
--         - אך הפרד WHERE מבהיר את הכוונה ויצמצם את גודל האינדקס
--         - ON CONFLICT ב-PostgREST ו-Supabase עובד עם predicate זה
-- ──────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptances_user_terms_privacy_uidx
  ON legal_acceptances(user_id, terms_version, privacy_version)
  WHERE user_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────
-- סיום עסקה
-- ──────────────────────────────────────────────────────────────────

COMMIT;

-- ──────────────────────────────────────────────────────────────────
-- אימות לאחר הרצה (SELECT בלבד — אין כתיבה)
-- ──────────────────────────────────────────────────────────────────

SELECT
  'legal_acceptances'           AS table_name,
  COUNT(*)                      AS total_rows,
  COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS rows_with_user,
  COUNT(*) FILTER (WHERE user_id IS NULL)     AS rows_null_user,
  COUNT(*) FILTER (WHERE privacy_version IS NULL) AS null_privacy_version
FROM legal_acceptances;

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'legal_acceptances'
ORDER BY indexname;

-- ──────────────────────────────────────────────────────────────────
-- ROLLBACK MANUAL — אם יש צורך לבטל לאחר COMMIT:
--
-- 1. שחזור כפילויות שנמחקו (מהbackup):
--    INSERT INTO legal_acceptances
--      SELECT id, user_id, user_email, terms_version, accepted_terms,
--             accepted_privacy, ip_address, user_agent, created_at, privacy_version
--      FROM legal_acceptances_dedup_backup
--      ON CONFLICT DO NOTHING;
--
-- 2. הסרת NOT NULL מ-privacy_version:
--    ALTER TABLE legal_acceptances ALTER COLUMN privacy_version DROP NOT NULL;
--
-- 3. הסרת עמודת privacy_version:
--    ALTER TABLE legal_acceptances DROP COLUMN IF EXISTS privacy_version;
--
-- 4. הסרת index חדש:
--    DROP INDEX IF EXISTS legal_acceptances_user_terms_privacy_uidx;
--
-- 5. החזרת index ישן:
--    CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptances_user_version_uidx
--      ON legal_acceptances(user_id, terms_version);
--
-- ⚠️ לא למחוק את legal_acceptances_dedup_backup עד לוודא שהמיגרציה תקינה
-- ================================================================
