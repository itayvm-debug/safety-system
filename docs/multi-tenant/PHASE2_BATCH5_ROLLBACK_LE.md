# Phase 2 Batch 5 — Rollback Plan: Lifting Equipment

**תאריך:** 2026-07-30  
**טבלה:** `lifting_equipment`

---

## מתי לבצע rollback

- אם ה-migration נכשל באמצע (partial state) ואי-אפשר להמשיך
- אם בדיקות post-migration גילו בעיה קריטית
- כלל: rollback רק אם pre-commit assertions נכשלו (COMMIT לא בוצע)

---

## Rollback SQL

```sql
BEGIN;

-- 1. הסרת triggers ופונקציות
DROP TRIGGER IF EXISTS lifting_equipment_subcontractor_same_company ON lifting_equipment;
DROP FUNCTION IF EXISTS enforce_lifting_equipment_subcontractor_same_company();

-- 2. הסרת RLS policies החדשות
DROP POLICY IF EXISTS lifting_equipment_select_own_company ON lifting_equipment;
DROP POLICY IF EXISTS lifting_equipment_insert_own_company ON lifting_equipment;
DROP POLICY IF EXISTS lifting_equipment_update_own_company ON lifting_equipment;
DROP POLICY IF EXISTS lifting_equipment_delete_own_company ON lifting_equipment;
DROP POLICY IF EXISTS lifting_equipment_service_all ON lifting_equipment;

-- 3. שחזור פוליסת blanket המקורית
CREATE POLICY IF NOT EXISTS "Auth users can manage lifting_equipment"
  ON lifting_equipment FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 4. הסרת index
DROP INDEX IF EXISTS lifting_equipment_company_id_idx;

-- 5. הסרת עמודת company_id (גורם לאיבוד נתוני backfill)
--    בצע רק אם הbackfill לא שומש בסביבת Production!
ALTER TABLE lifting_equipment DROP COLUMN IF EXISTS company_id;

COMMIT;
```

**אזהרה:** שלב 5 (DROP COLUMN) מוחק את הנתונים שבוצעו להם backfill. בסביבת Production — לא לבצע ללא אישור מפורש.

---

## Rollback TypeScript

הסיבוב ידני של הקבצים הבאים:

1. **`types/index.ts`** — הסר `company_id: string` מ-`LiftingEquipment`
2. **`app/api/lifting-equipment/route.ts`** — שחזר לגרסה עם `requireAuth`/`requireAdmin`
3. **`app/api/lifting-equipment/[id]/route.ts`** — שחזר לגרסה ללא ownership check
4. **`app/dashboard/page.tsx`** — הסר `.eq('company_id', companyId)` מטבלת lifting_equipment
5. **`app/issues/page.tsx`** — הסר `.eq('company_id', companyId)` מטבלת lifting_equipment
6. **`app/archive/page.tsx`** — הסר `.eq('company_id', companyId)` מטבלת lifting_equipment
7. **`app/api/alerts/route.ts`** — הסר `.eq('company_id', companyId)` מטבלת lifting_equipment
8. **`app/api/reports/weekly-status/route.ts`** — הסר `.eq('company_id', companyId)` מטבלת lifting_equipment
9. **`lib/storage/authorize.ts`** — החזר `lifting_equipment` ל-`STANDALONE_LEGACY_CONFIGS`; הסר מ-`TENANT_MIGRATED_TABLES`; הסר Mode A fetch
10. **`lib/export/exportTables.ts`** — החזר `lifting_equipment` מ-`COMPANY_SCOPED_TABLES` ל-`GLOBAL_TABLES`

---

## Post-Rollback Verification

```sql
-- 1. בדוק שעמודה הוסרה
SELECT column_name FROM information_schema.columns
WHERE table_name = 'lifting_equipment' AND column_name = 'company_id';
-- צפוי: 0 שורות

-- 2. בדוק שפוליסת blanket חזרה
SELECT policyname FROM pg_policies WHERE tablename = 'lifting_equipment';
-- צפוי: "Auth users can manage lifting_equipment"

-- 3. בדוק שהtrigger הוסר
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_table = 'lifting_equipment'
  AND trigger_name = 'lifting_equipment_subcontractor_same_company';
-- צפוי: 0 שורות
```
