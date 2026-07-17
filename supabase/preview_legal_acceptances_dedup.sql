-- ================================================================
-- SafeDoc — Preview: legal_acceptances dedup simulation
-- preview_legal_acceptances_dedup.sql
--
-- ⚠️ קובץ זה מכיל SELECT בלבד — אין כל כתיבה לDB
-- הרץ לפני הרצת migration_legal_acceptances_dedup_and_unique.sql
-- כדי לאמת את ההיקף הצפוי.
--
-- גרסה 2: בטוחה גם כאשר עמודת privacy_version טרם נוצרה.
--
-- שיטת הגישה הבטוחה לשדה privacy_version:
--   to_jsonb(la)->>'privacy_version'
--   → מחזיר NULL אם העמודה אינה קיימת בטבלה,
--     במקום שגיאת "column does not exist".
--
-- מפתח הכפילויות המדומה: (user_id, terms_version, effective_privacy_version)
-- כאשר effective_privacy_version =
--   COALESCE(to_jsonb(la)->>'privacy_version', la.terms_version)
-- זהה להתנהגות המיגרציה לאחר שלב 2 (FILL NULL → terms_version).
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- שאילתה 1: סיכום כללי
-- ──────────────────────────────────────────────────────────────────

SELECT
  COUNT(*)                                                        AS total_rows,
  COUNT(*) FILTER (WHERE la.user_id IS NOT NULL)                 AS rows_with_user,
  COUNT(*) FILTER (WHERE la.user_id IS NULL)                     AS rows_with_null_user,

  -- כאשר העמודה privacy_version אינה קיימת עדיין, הביטוי מחזיר NULL
  -- לכל השורות — כלומר, כל השורות ייספרו כחסרות privacy_version (תקין).
  COUNT(*) FILTER (
    WHERE to_jsonb(la)->>'privacy_version' IS NULL
  )                                                               AS rows_with_null_privacy_version,

  -- כפילויות שיימחקו: לאחר סימולציית שלב 2 של המיגרציה (FILL)
  (
    SELECT COUNT(*)
    FROM legal_acceptances la2
    WHERE la2.user_id IS NOT NULL
      AND la2.id NOT IN (
        SELECT DISTINCT ON (
          la3.user_id,
          la3.terms_version,
          COALESCE(to_jsonb(la3)->>'privacy_version', la3.terms_version)
        ) la3.id
        FROM legal_acceptances la3
        WHERE la3.user_id IS NOT NULL
        ORDER BY
          la3.user_id,
          la3.terms_version,
          COALESCE(to_jsonb(la3)->>'privacy_version', la3.terms_version),
          la3.created_at ASC,
          la3.id ASC
      )
  )                                                               AS duplicate_rows_to_backup_and_delete,

  -- קבוצות ייחודיות שיש בהן יותר מרשומה אחת
  (
    SELECT COUNT(*)
    FROM (
      SELECT
        la4.user_id,
        la4.terms_version,
        COALESCE(to_jsonb(la4)->>'privacy_version', la4.terms_version) AS effective_privacy
      FROM legal_acceptances la4
      WHERE la4.user_id IS NOT NULL
      GROUP BY
        la4.user_id,
        la4.terms_version,
        COALESCE(to_jsonb(la4)->>'privacy_version', la4.terms_version)
      HAVING COUNT(*) > 1
    ) dup_groups
  )                                                               AS duplicate_groups

FROM legal_acceptances la;


-- ──────────────────────────────────────────────────────────────────
-- שאילתה 2: פירוט קבוצות הכפילויות
-- (מציגה עד 50 קבוצות; הגדל LIMIT אם יש יותר)
-- ──────────────────────────────────────────────────────────────────

SELECT
  la.user_id,
  la.terms_version,
  COALESCE(to_jsonb(la)->>'privacy_version', la.terms_version)   AS effective_privacy_version,
  COUNT(*)                                                        AS row_count,
  MIN(la.created_at)                                             AS earliest_created_at,
  MAX(la.created_at)                                             AS latest_created_at
FROM legal_acceptances la
WHERE la.user_id IS NOT NULL
GROUP BY
  la.user_id,
  la.terms_version,
  COALESCE(to_jsonb(la)->>'privacy_version', la.terms_version)
HAVING COUNT(*) > 1
ORDER BY row_count DESC, la.user_id, la.terms_version
LIMIT 50;


-- ──────────────────────────────────────────────────────────────────
-- שאילתה 3: הרשומות הספציפיות שיימחקו (המאוחרות בכל קבוצה)
-- ──────────────────────────────────────────────────────────────────

SELECT
  la.id,
  la.user_id,
  la.user_email,
  la.terms_version,
  COALESCE(to_jsonb(la)->>'privacy_version', la.terms_version)   AS effective_privacy_version,
  la.created_at,
  'WILL BE DELETED — later duplicate'                            AS fate
FROM legal_acceptances la
WHERE la.user_id IS NOT NULL
  AND la.id NOT IN (
    SELECT DISTINCT ON (
      la2.user_id,
      la2.terms_version,
      COALESCE(to_jsonb(la2)->>'privacy_version', la2.terms_version)
    ) la2.id
    FROM legal_acceptances la2
    WHERE la2.user_id IS NOT NULL
    ORDER BY
      la2.user_id,
      la2.terms_version,
      COALESCE(to_jsonb(la2)->>'privacy_version', la2.terms_version),
      la2.created_at ASC,
      la2.id ASC
  )
ORDER BY la.user_id, la.terms_version, la.created_at
LIMIT 200;


-- ──────────────────────────────────────────────────────────────────
-- שאילתה 4: הרשומות שיישמרו (הקדומות בכל קבוצה)
-- (רלוונטי רק כאשר שאילתה 2 מראה קבוצות כפולות)
-- ──────────────────────────────────────────────────────────────────

SELECT
  la.id,
  la.user_id,
  la.user_email,
  la.terms_version,
  COALESCE(to_jsonb(la)->>'privacy_version', la.terms_version)   AS effective_privacy_version,
  la.created_at,
  'WILL BE KEPT — earliest record'                               AS fate
FROM legal_acceptances la
WHERE la.user_id IS NOT NULL
  AND (
    la.user_id,
    la.terms_version,
    COALESCE(to_jsonb(la)->>'privacy_version', la.terms_version)
  ) IN (
    SELECT
      la2.user_id,
      la2.terms_version,
      COALESCE(to_jsonb(la2)->>'privacy_version', la2.terms_version)
    FROM legal_acceptances la2
    WHERE la2.user_id IS NOT NULL
    GROUP BY
      la2.user_id,
      la2.terms_version,
      COALESCE(to_jsonb(la2)->>'privacy_version', la2.terms_version)
    HAVING COUNT(*) > 1
  )
  AND la.id IN (
    SELECT DISTINCT ON (
      la3.user_id,
      la3.terms_version,
      COALESCE(to_jsonb(la3)->>'privacy_version', la3.terms_version)
    ) la3.id
    FROM legal_acceptances la3
    WHERE la3.user_id IS NOT NULL
    ORDER BY
      la3.user_id,
      la3.terms_version,
      COALESCE(to_jsonb(la3)->>'privacy_version', la3.terms_version),
      la3.created_at ASC,
      la3.id ASC
  )
ORDER BY la.user_id, la.terms_version, la.created_at
LIMIT 200;


-- ──────────────────────────────────────────────────────────────────
-- שאילתה 5: בדיקת indexes קיימים
-- ──────────────────────────────────────────────────────────────────

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'legal_acceptances'
ORDER BY indexname;
