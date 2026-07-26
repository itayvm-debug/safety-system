# מדריך Rollback — Phase 2 Batch 1

## ⚠️ קרא לפני ביצוע Rollback

**Rollback של Phase 2 Batch 1 מחייב:**
1. ריצה בפרוד: **רק אחרי** אישור מנהל
2. Vercel: deploy של branch קודם (git revert)
3. Supabase: ריצת SQL rollback הבא
4. אין מחיקת נתונים — רק שינוי schema + policies

---

## SQL Rollback Script

```sql
-- ================================================================
-- mt_phase2_batch1_ROLLBACK.sql
-- מחזיר את workers + documents למצב לפני Phase 2 Batch 1.
-- ⚠️ הרץ רק בהוראה מפורשת של מנהל.
-- ================================================================

BEGIN;

-- 1. החזרת פוליסי workers למצב הישן
DROP POLICY IF EXISTS "workers_select_company"  ON workers;
DROP POLICY IF EXISTS "workers_insert_company"  ON workers;
DROP POLICY IF EXISTS "workers_update_company"  ON workers;
DROP POLICY IF EXISTS "workers_delete_company"  ON workers;
DROP POLICY IF EXISTS "workers_service_all"     ON workers;

CREATE POLICY "authenticated users can manage workers"
  ON workers FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 2. החזרת פוליסי documents למצב הישן
DROP POLICY IF EXISTS "documents_select_company"  ON documents;
DROP POLICY IF EXISTS "documents_insert_company"  ON documents;
DROP POLICY IF EXISTS "documents_update_company"  ON documents;
DROP POLICY IF EXISTS "documents_delete_company"  ON documents;
DROP POLICY IF EXISTS "documents_service_all"     ON documents;

CREATE POLICY "authenticated users can manage documents"
  ON documents FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 3. הסרת company_id מ-documents (לפני workers כי workers.id referenced)
ALTER TABLE documents DROP COLUMN IF EXISTS company_id;

-- 4. הסרת company_id מ-workers
ALTER TABLE workers DROP COLUMN IF EXISTS company_id;

-- 5. הסרת settings מ-companies
ALTER TABLE companies DROP COLUMN IF EXISTS settings;

-- 6. הסרת indexes
DROP INDEX IF EXISTS idx_workers_company_id;
DROP INDEX IF EXISTS idx_documents_company_id;

-- 7. אימות
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workers'
      AND column_name = 'company_id'
  ) THEN
    RAISE EXCEPTION 'ROLLBACK FAILED: workers.company_id still exists.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'documents'
      AND column_name = 'company_id'
  ) THEN
    RAISE EXCEPTION 'ROLLBACK FAILED: documents.company_id still exists.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workers'
      AND policyname = 'authenticated users can manage workers'
  ) THEN
    RAISE EXCEPTION 'ROLLBACK FAILED: old workers policy not restored.';
  END IF;

  RAISE NOTICE 'ROLLBACK VERIFIED: workers + documents returned to Phase 1 state.';
END $$;

COMMIT;
```

---

## שלבי Rollback מלאים

### שלב 1: Vercel (קוד)
```bash
git revert HEAD  # revert ל-commit לפני Phase 2 Batch 1
git push origin main
# Vercel יבנה ויפרוס אוטומטית
```

**לחלופין:** ב-Vercel Dashboard → Deployments → בחר deployment ישן → "Promote to Production"

### שלב 2: Supabase SQL
1. פתח SQL Editor ב-Supabase Dashboard
2. הדבק את ה-SQL Rollback Script למעלה
3. לחץ Run
4. ודא הודעת: `ROLLBACK VERIFIED: workers + documents returned to Phase 1 state.`

### שלב 3: אימות
```sql
-- בדיקה: workers.company_id לא קיים
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'workers'
  AND column_name = 'company_id';
-- Expected: 0 rows

-- בדיקה: פוליסי ישן קיים
SELECT policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'workers';
-- Expected: "authenticated users can manage workers"
```

---

## מה **לא** ישפיע על ה-Rollback

| נושא | הסבר |
|------|-------|
| נתוני workers | לא נמחקים — רק עמודת company_id מוסרת |
| נתוני documents | לא נמחקים — רק עמודת company_id מוסרת |
| companies table | Phase 1 data נשאר (companies + company_members) |
| קבצי Storage | לא נגעים |
| TypeScript types | יצריכו revert בקוד (Worker.company_id, Document.company_id) |

---

## הערות חשובות

1. **לא ניתן לבצע Partial Rollback** — הסרת company_id מ-workers בלי מ-documents תגרום לשגיאות FK.
2. **הסדר חשוב:** מסירים `documents.company_id` לפני `workers.company_id` (FK dependency).
3. **Phase 1 נשאר:** companies + company_members טבלאות נשארות — Rollback רק מחזיר את Batch 1 changes.
4. לאחר Rollback, השלב הבא יהיה Phase 2 Batch 1 מחדש עם התיקונים הנדרשים.
