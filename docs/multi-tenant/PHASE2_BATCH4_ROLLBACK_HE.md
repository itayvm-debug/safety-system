# Phase 2 Batch 4 — Rollback: Heavy Equipment

**תאריך:** 2026-07-30  
**חשוב:** Rollback מחייב אישור מפורש. אין לבצע ללא הנחיה ישירה.

---

## מתי לבצע Rollback

- Bug קריטי שנגרם ישירות ממיגרציה זו
- אחרי תיאום עם כל ה-stakeholders
- **אין לבצע** אם הבעיה ניתנת לתיקון ב-hotfix

---

## Rollback SQL

```sql
BEGIN;

-- 1. הסר triggers
DROP TRIGGER IF EXISTS heavy_equipment_subcontractor_same_company ON heavy_equipment;
DROP FUNCTION IF EXISTS public.enforce_heavy_equipment_subcontractor_same_company();

DROP TRIGGER IF EXISTS heavy_equipment_insurances_company_id_check ON heavy_equipment_insurances;
DROP FUNCTION IF EXISTS public.enforce_heavy_equipment_child_company_id();

-- 2. הסר RLS policies על heavy_equipment
DROP POLICY IF EXISTS "heavy_equipment_select_company"   ON heavy_equipment;
DROP POLICY IF EXISTS "heavy_equipment_insert_company"   ON heavy_equipment;
DROP POLICY IF EXISTS "heavy_equipment_update_company"   ON heavy_equipment;
DROP POLICY IF EXISTS "heavy_equipment_delete_company"   ON heavy_equipment;
DROP POLICY IF EXISTS "heavy_equipment_service_all"      ON heavy_equipment;

-- 3. החזר blanket policy על heavy_equipment
ALTER TABLE heavy_equipment DISABLE ROW LEVEL SECURITY;
ALTER TABLE heavy_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can manage heavy_equipment"
  ON heavy_equipment FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. הסר RLS policies על heavy_equipment_insurances
DROP POLICY IF EXISTS "heavy_equipment_insurances_select_company"  ON heavy_equipment_insurances;
DROP POLICY IF EXISTS "heavy_equipment_insurances_insert_company"  ON heavy_equipment_insurances;
DROP POLICY IF EXISTS "heavy_equipment_insurances_update_company"  ON heavy_equipment_insurances;
DROP POLICY IF EXISTS "heavy_equipment_insurances_delete_company"  ON heavy_equipment_insurances;
DROP POLICY IF EXISTS "heavy_equipment_insurances_service_all"     ON heavy_equipment_insurances;
ALTER TABLE heavy_equipment_insurances DISABLE ROW LEVEL SECURITY;

-- 5. הסר indexes
DROP INDEX IF EXISTS public.heavy_equipment_company_id_idx;
DROP INDEX IF EXISTS public.heavy_equipment_insurances_company_id_idx;

-- 6. הסר company_id columns (DATA LOSS — בדוק לפני!)
--    שמור גיבוי לפני הרצה:
--    COPY (SELECT id, company_id FROM heavy_equipment) TO '/tmp/he_company_ids.csv' CSV;
--    COPY (SELECT id, company_id FROM heavy_equipment_insurances) TO '/tmp/hei_company_ids.csv' CSV;
ALTER TABLE heavy_equipment_insurances DROP COLUMN IF EXISTS company_id;
ALTER TABLE heavy_equipment DROP COLUMN IF EXISTS company_id;

COMMIT;
```

---

## שלבי Rollback ב-TypeScript

לאחר ה-SQL:

1. החזר `heavy_equipment` ו-`heavy_equipment_insurances` ל-`STANDALONE_LEGACY_CONFIGS` ב-`lib/storage/authorize.ts`
2. הסר מ-`TENANT_MIGRATED_TABLES`
3. החזר `heavy_equipment` ל-`GLOBAL_TABLES` ב-`lib/export/exportTables.ts`
4. הסר `.eq('company_id', companyId)` מכל ה-routes שעודכנו
5. החזר `requireAuth()` / `requireAdmin()` ב-API routes של heavy-equipment
6. הסר `company_id` מ-`types/index.ts`
7. Deploy ואמת שהמערכת חוזרת לפעולה תקינה

---

## אימות לאחר Rollback

```sql
SELECT COUNT(*) FROM heavy_equipment;  -- same as before
SELECT COUNT(*) FROM heavy_equipment_insurances;  -- same as before
SELECT policyname FROM pg_policies WHERE tablename = 'heavy_equipment';
-- Expected: "Auth users can manage heavy_equipment"
```
