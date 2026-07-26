# Phase 2 Batch 2 — מדריך Rollback

## עקרון יסוד

**אין למחוק `company_id` לאחר שנוצרו נתונים של חברה שנייה.**

אם השלב שגיאות ב-COMMIT (כלומר המיגרציה נכשלה), PostgreSQL מחזיר הכל לקדמותו באופן אוטומטי — אין צורך בפעולה.

---

## תרחיש 1: כשלון לפני COMMIT

**מה קרה:** המיגרציה רצה, `DO $$ RAISE EXCEPTION` עצרה אותה, ה-COMMIT לא בוצע.

**תוצאה:** PostgreSQL מחזיר הכל אוטומטית. אין שינוי ב-DB.

**פעולה:** לא נדרשת. הרץ `preview_sql` כדי לאמת את המצב, תקן את הסיבה לכשל (ראה סעיף Blocked בתוצאת ה-Preview) ונסה שוב.

---

## תרחיש 2: מיגרציה SQL הצליחה — לפני Deploy

**מה קרה:** `COMMIT` בוצע — `company_id` הוסף ל-subcontractors ו-vehicles. הקוד הישן עדיין פועל ב-Vercel.

**האם המצב בטוח?** כן — הקוד הישן לא מחפש `company_id` ולכן עובד כרגיל. RLS החדש מגביל רק משתמשי JWT (לא service_role). כל הפונקציות קיימות.

**Rollback (אם נדרש):**

```sql
BEGIN;

-- 1. החזרת RLS ל-blanket
DROP POLICY IF EXISTS "subcontractors_select_company"    ON subcontractors;
DROP POLICY IF EXISTS "subcontractors_insert_company"   ON subcontractors;
DROP POLICY IF EXISTS "subcontractors_update_company"   ON subcontractors;
DROP POLICY IF EXISTS "subcontractors_delete_company"   ON subcontractors;
DROP POLICY IF EXISTS "subcontractors_service_all"      ON subcontractors;
CREATE POLICY "Authenticated users can read subcontractors"
  ON subcontractors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert subcontractors"
  ON subcontractors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update subcontractors"
  ON subcontractors FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete subcontractors"
  ON subcontractors FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "vehicles_select_company"   ON vehicles;
DROP POLICY IF EXISTS "vehicles_insert_company"   ON vehicles;
DROP POLICY IF EXISTS "vehicles_update_company"   ON vehicles;
DROP POLICY IF EXISTS "vehicles_delete_company"   ON vehicles;
DROP POLICY IF EXISTS "vehicles_service_all"      ON vehicles;
CREATE POLICY "vehicles_authenticated"
  ON vehicles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. הסרת composite index לפני הסרת NOT NULL
DROP INDEX IF EXISTS vehicles_company_vehicle_number_unique;

-- 3. החזרת global UNIQUE על vehicle_number
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_vehicle_number_unique
  ON vehicles (vehicle_number);

-- 4. הסרת NOT NULL constraint
ALTER TABLE subcontractors ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE vehicles       ALTER COLUMN company_id DROP NOT NULL;

-- 5. הסרת FK constraint
ALTER TABLE subcontractors DROP CONSTRAINT IF EXISTS subcontractors_company_id_fkey;
ALTER TABLE vehicles       DROP CONSTRAINT IF EXISTS vehicles_company_id_fkey;

-- 6. הסרת עמודות
ALTER TABLE subcontractors DROP COLUMN IF EXISTS company_id;
ALTER TABLE vehicles       DROP COLUMN IF EXISTS company_id;

COMMIT;
```

**⚠️ אזהרה:** אם כבר נוספו רכבים/קבלנים עם `company_id != default_company`, הסרת `company_id` תוביל לאיבוד מידע. ראה תרחיש 4.

---

## תרחיש 3: Rollback אחרי Deploy (לפני נתוני חברה שנייה)

**מה קרה:** הקוד החדש deployed. עדיין חברה אחת בלבד (Default Company).

**שלב א — Rollback קוד:**
1. חזור ל-Git commit הקודם ב-Vercel (Instant Rollback)
2. הכלים הישנים (`requireAuth/requireAdmin`) יחזרו לפעולה

**שלב ב — Rollback DB (אם נדרש):**
השתמש בסקריפט מתרחיש 2.

**הערה:** הקוד הישן לא ישתמש ב-`company_id` אפילו אם הוא קיים בטבלה — לכן ה-DB rollback הוא אופציונלי אם הכוונה לחזור ולהריץ את Batch 2 מחדש.

---

## תרחיש 4: Rollback לאחר שחברה שנייה יצרה נתונים

**⛔ אין להסיר company_id אחרי שחברה שנייה הוסיפה נתונים.**

**מה ניתן לעשות:**
1. ביצוע Rollback קוד בלבד (Vercel Instant Rollback) — חזרה לממשק הישן
2. שמירת DB כמות שהוא עם company_id
3. הקוד הישן (ללא company scope) יציג את נתוני כל החברות — **חשיפת מידע מחברה שנייה!**

**המלצה:** לא לבצע rollback קוד לאחר שחברה שנייה יצרה נתונים. במקום זאת:
- לתקן את הבעיה שגרמה לצורך ב-rollback
- לשחרר hotfix קדימה

---

## רשימת בדיקה לפני Rollback

- [ ] האם יש חברה שנייה עם נתונים? (בדוק: `SELECT COUNT(*) FROM companies WHERE is_active = true`)
- [ ] האם חברה שנייה הוסיפה subcontractors? (בדוק: `SELECT company_id, COUNT(*) FROM subcontractors GROUP BY company_id`)
- [ ] האם חברה שנייה הוסיפה vehicles? (בדוק: `SELECT company_id, COUNT(*) FROM vehicles GROUP BY company_id`)
- [ ] אם כן לאחת מהשאלות — **אל תסיר company_id**

---

## מצב חלקי (PARTIAL STATE)

אם המיגרציה נכשלה באמצע (נדיר בגלל ה-TRANSACTION), ייתכן מצב שבו `company_id` קיים אך ללא NOT NULL / FK / indexes.

הרץ את `preview_sql` — הוא יזהה מצב PARTIAL ויציג מה חסר.

במצב חלקי, ניתן להריץ את המיגרציה מחדש (היא idempotent — `IF NOT EXISTS` / `IF EXISTS` לכל DDL).

---

## סיכום

| מצב | פעולה |
|---|---|
| כשלון לפני COMMIT | כלום (PostgreSQL rollback אוטומטי) |
| לאחר COMMIT, לפני deploy | סקריפט rollback SQL (תרחיש 2) |
| לאחר deploy, חברה אחת | Vercel rollback + אופציונלי: DB rollback |
| לאחר deploy, חברה שנייה יצרה נתונים | ❌ אין rollback DB — hotfix בלבד |
