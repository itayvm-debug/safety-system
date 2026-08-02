# Phase 2 Batch 3 — תוכנית Rollback

**תאריך:** 2026-07-30  
**חשוב:** הריצה בתוך BEGIN/COMMIT מאפשרת ROLLBACK אוטומטי אם assertion נכשל.

---

## תרחישי כישלון ופעולות

### תרחיש 1 — migration_state אינו 'CLEAN PRE-MIGRATION'
**מה קרה:** פרוויו הראה מצב לא צפוי (חסרים רכבים, company_id NULL בטבלת vehicles).  
**פעולה:** אל תריץ את המיגרציה. תקן את הבעיה הבסיסית תחילה:
- ריצת `mt_phase2_batch2_subcontractors_vehicles.sql` אם Batch 2 לא הושלם
- תיקון שורות NULL ב-vehicles.company_id לפני המשך

---

### תרחיש 2 — כישלון ב-SAFETY GUARD (orphan check)
**שגיאה לדוגמה:**  
```
ASSERTION FAILED: N vehicle_license row(s) have NULL company_id after backfill.
```
**גורם:** קיימות שורות ב-vehicle_licenses ללא התאמה ב-vehicles (אמור להיות בלתי אפשרי בגלל FK, אבל נבדק כהגנה).  
**פעולה:** הריצה נכשלת ומתבצע ROLLBACK אוטומטי. בדוק:
```sql
SELECT vl.id, vl.vehicle_id
FROM vehicle_licenses vl
LEFT JOIN vehicles v ON v.id = vl.vehicle_id
WHERE v.id IS NULL;
```
תקן לפני חזרה על הריצה.

---

### תרחיש 3 — כישלון ב-assertion zero-mismatch
**שגיאה:**  
```
ASSERTION FAILED: N vehicle_license row(s) have company_id mismatch after backfill.
```
**גורם:** לא צפוי — vehicles.company_id היה NULL בזמן הbackfill.  
**פעולה:** ROLLBACK אוטומטי. ודא ש-Batch 2 הושלם (vehicles.company_id NOT NULL).

---

### תרחיש 4 — כישלון ב-RLS policy assertion
**שגיאה:**  
```
ASSERTION FAILED: vehicle_licenses_select_company policy missing.
```
**פעולה:** ROLLBACK אוטומטי — הכל מתבטל. שגיאה לא צפויה; בדוק הרשאות ב-Supabase.

---

### תרחיש 5 — Migration הושלמה, אבל יש לסגת ידנית

**שים לב:** זוהי פעולה הרסנית. בצע **רק** לאחר אישור מנהלי.

```sql
-- ⚠ ROLLBACK MANUAL — Phase 2 Batch 3 ⚠
-- Run ONLY if explicitly authorized.
-- This DESTROYS the company_id column and all related constraints.

BEGIN;

-- Step 1: Drop triggers and trigger function
DROP TRIGGER IF EXISTS vehicle_licenses_company_id_check   ON vehicle_licenses;
DROP TRIGGER IF EXISTS vehicle_insurances_company_id_check ON vehicle_insurances;
DROP FUNCTION IF EXISTS public.enforce_vehicle_child_company_id();

-- Step 2: Drop RLS policies — vehicle_licenses
DROP POLICY IF EXISTS "vehicle_licenses_select_company"  ON vehicle_licenses;
DROP POLICY IF EXISTS "vehicle_licenses_insert_company"  ON vehicle_licenses;
DROP POLICY IF EXISTS "vehicle_licenses_update_company"  ON vehicle_licenses;
DROP POLICY IF EXISTS "vehicle_licenses_delete_company"  ON vehicle_licenses;
DROP POLICY IF EXISTS "vehicle_licenses_service_all"     ON vehicle_licenses;
ALTER TABLE vehicle_licenses DISABLE ROW LEVEL SECURITY;

-- Step 3: Drop RLS policies — vehicle_insurances
DROP POLICY IF EXISTS "vehicle_insurances_select_company"  ON vehicle_insurances;
DROP POLICY IF EXISTS "vehicle_insurances_insert_company"  ON vehicle_insurances;
DROP POLICY IF EXISTS "vehicle_insurances_update_company"  ON vehicle_insurances;
DROP POLICY IF EXISTS "vehicle_insurances_delete_company"  ON vehicle_insurances;
DROP POLICY IF EXISTS "vehicle_insurances_service_all"     ON vehicle_insurances;
ALTER TABLE vehicle_insurances DISABLE ROW LEVEL SECURITY;

-- Step 4: Drop company_id index and column
DROP INDEX IF EXISTS public.vehicle_licenses_company_id_idx;
DROP INDEX IF EXISTS public.vehicle_insurances_company_id_idx;

ALTER TABLE vehicle_licenses  DROP COLUMN IF EXISTS company_id;
ALTER TABLE vehicle_insurances DROP COLUMN IF EXISTS company_id;

COMMIT;
```

**לאחר ה-Rollback הידני:** פרוס את גרסת הקוד הקודמת (ללא שינויי Batch 3 ב-TypeScript).  
Rollback של קוד TypeScript (לגרסת Batch 2):
- `lib/storage/authorize.ts`: החזר Mode B-vehicle ל-vehicle_licenses/insurances
- `lib/export/exportTables.ts`: החזר vehicle_licenses/insurances ל-GLOBAL_TABLES
- `app/api/vehicle-licenses/route.ts`: הסר `company_id: companyId` מה-INSERT, הסר `.eq('company_id')` מה-SELECT
- `app/api/vehicle-licenses/[id]/route.ts`: החזר שרשרת two-hop
- `app/api/vehicle-insurances/route.ts`: זהה
- `app/api/vehicle-insurances/[id]/route.ts`: זהה
- `types/index.ts`: הסר `company_id` מ-VehicleLicense ו-VehicleInsurance

---

## בדיקת מצב לאחר Rollback

הרץ את `mt_phase2_batch3_vehicle_children_preview.sql`:  
**ציפייה:** `migration_state = 'CLEAN PRE-MIGRATION'`

---

## ניהול סיכונים

| סיכון | הסתברות | פגיעה | הפחתה |
|-------|----------|-------|-------|
| Backfill נכשל (orphan) | נמוכה מאוד (FK קיים) | נמוכה | Safety guard + ROLLBACK אוטומטי |
| Trigger מונע INSERT לגיטימי | נמוכה | בינונית | API מעביר company_id נכון תמיד |
| RLS חוסמת service_role | לא קורה | — | service_role_all policy מוגדרת במפורש |
| Migration timeout | נמוכה | גבוהה | טבלות קטנות, index בנפרד |
