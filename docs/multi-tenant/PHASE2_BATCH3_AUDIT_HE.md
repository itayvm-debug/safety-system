# Phase 2 Batch 3 — ביקורת טרום-מיגרציה: vehicle_licenses + vehicle_insurances

**תאריך:** 2026-07-30  
**מצב:** בוצעה ביקורת מלאה — ממתין להפעלת מיגרציה

---

## 1. מצב קיים (לפני Batch 3)

### טבלת vehicle_licenses
| שדה | סוג | אילוץ | הערה |
|-----|-----|--------|------|
| id | UUID | PRIMARY KEY | gen_random_uuid() |
| vehicle_id | UUID NOT NULL | REFERENCES vehicles(id) ON DELETE CASCADE | |
| file_url | TEXT | nullable | |
| expiry_date | DATE | nullable | |
| created_at | TIMESTAMPTZ NOT NULL | DEFAULT now() | |
| updated_at | TIMESTAMPTZ NOT NULL | DEFAULT now() | |

**חסר:** company_id. **RLS:** כבוי. **פוליסות:** אין.

### טבלת vehicle_insurances
| שדה | סוג | אילוץ | הערה |
|-----|-----|--------|------|
| id | UUID | PRIMARY KEY | gen_random_uuid() |
| vehicle_id | UUID NOT NULL | REFERENCES vehicles(id) ON DELETE CASCADE | |
| insurance_type | TEXT NOT NULL | | 'ביטוח חובה' / 'ביטוח מקיף' / 'ביטוח צד ג' |
| file_url | TEXT | nullable | |
| expiry_date | DATE | nullable | |
| created_at | TIMESTAMPTZ NOT NULL | DEFAULT now() | |
| updated_at | TIMESTAMPTZ NOT NULL | DEFAULT now() | |
| | | UNIQUE(vehicle_id, insurance_type) | |

**חסר:** company_id. **RLS:** כבוי. **פוליסות:** אין.

### אינדקסים קיימים
- `vehicle_licenses_vehicle_idx ON vehicle_licenses (vehicle_id)`
- `vehicle_insurances_vehicle_idx ON vehicle_insurances (vehicle_id)`

---

## 2. בעיות אבטחה שזוהו

### 2a. חיתוך-חברה בטבלאות הצאצא
vehicle_licenses ו-vehicle_insurances אינן מכילות company_id. הגישה מתבצעת כיום דרך שרשרת:  
`child.vehicle_id → vehicles.id → vehicles.company_id`

זו גישה **לא ישירה** — מסתמכת על אימות ה-parent בלבד, ולא על company_id ישיר בטבלת הצאצא.

### 2b. ייצוא לא מדויק
`exportTables.ts` מקבץ את שתי הטבלאות תחת `GLOBAL_TABLES` ומייצא את **כל** הרשומות ממחברות כל החברות — ללא סינון company_id.

### 2c. אחסון (Storage) — Mode B-vehicle
`authorize.ts` משתמש ב-Mode B-vehicle (vehicle_id IN רשימת רכבי החברה) במקום Mode A (company_id ישיר). עם company_id, ניתן לעבור ל-Mode A היעיל יותר.

---

## 3. מסלול API קיים — לפני Batch 3

| Route | Method | אימות בעלות |
|-------|--------|-------------|
| /api/vehicle-licenses | GET | Verify vehicles.company_id = companyId, query by vehicle_id only |
| /api/vehicle-licenses | POST | Verify vehicles.company_id, INSERT without company_id |
| /api/vehicle-licenses/[id] | PATCH | Two-hop: license → vehicle_id → vehicles.company_id |
| /api/vehicle-licenses/[id] | DELETE | Two-hop: license → vehicle_id → vehicles.company_id |
| /api/vehicle-insurances | GET | Verify vehicles.company_id = companyId, query by vehicle_id only |
| /api/vehicle-insurances | POST | Verify vehicles.company_id, INSERT without company_id |
| /api/vehicle-insurances/[id] | PATCH | Two-hop: insurance → vehicle_id → vehicles.company_id |
| /api/vehicle-insurances/[id] | DELETE | Two-hop: insurance → vehicle_id → vehicles.company_id |

---

## 4. שינויים נדרשים (Batch 3)

### 4a. DDL
1. הוסף `company_id UUID REFERENCES companies(id) ON DELETE RESTRICT` ל-vehicle_licenses (nullable תחילה)
2. Backfill: `UPDATE vehicle_licenses SET company_id = vehicles.company_id WHERE vehicle_id = vehicles.id`
3. Assert zero NULL, zero mismatch
4. `ALTER COLUMN company_id SET NOT NULL`
5. `CREATE INDEX IF NOT EXISTS vehicle_licenses_company_id_idx ON vehicle_licenses (company_id)`
6. חזור על 1-5 עבור vehicle_insurances

### 4b. אכיפת עקביות — Trigger
יצירת פונקציה + טריגר BEFORE INSERT OR UPDATE:
```sql
FUNCTION enforce_vehicle_child_company_id()
-- מוודא: NEW.company_id IS NOT DISTINCT FROM vehicles.company_id WHERE id = NEW.vehicle_id
```
הטריגר מונע:
- הוספת רשומה עם company_id שגוי
- עדכון company_id לחברה שאינה בעלת ה-vehicle_id
- עדכון vehicle_id לרכב מחברה אחרת

### 4c. RLS
הפעל RLS + צור 5 פוליסות לכל טבלה:
- `_select_company`: USING (company_id IN user's companies)
- `_insert_company`: WITH CHECK (company_id IN user's companies)
- `_update_company`: USING + WITH CHECK
- `_delete_company`: USING
- `_service_all`: TO service_role, USING true

### 4d. קוד TypeScript

| קובץ | שינוי |
|------|-------|
| `types/index.ts` | הוסף `company_id: string` ל-VehicleLicense + VehicleInsurance |
| `lib/storage/authorize.ts` | הוסף vehicle_licenses/insurances ל-TENANT_MIGRATED_TABLES + Mode A batch |
| `lib/export/exportTables.ts` | הזז vehicle_licenses/insurances מ-GLOBAL_TABLES ל-COMPANY_SCOPED_TABLES |
| `app/api/vehicle-licenses/route.ts` | GET: הוסף `.eq('company_id', companyId)`. POST: הוסף `company_id: companyId` ל-INSERT |
| `app/api/vehicle-licenses/[id]/route.ts` | PATCH/DELETE: החלף שרשרת two-hop בבדיקת company_id ישירה |
| `app/api/vehicle-insurances/route.ts` | זהה ל-licenses |
| `app/api/vehicle-insurances/[id]/route.ts` | זהה ל-licenses [id] |

---

## 5. אינווריאנט מרכזי

**לאחר הריצה:** `vehicle_licenses.company_id = vehicles.company_id WHERE vehicles.id = vehicle_licenses.vehicle_id`

האכיפה: טריגר BEFORE INSERT OR UPDATE על שתי הטבלאות.  
הגיבוי: FK על vehicle_id → vehicles(id) ON DELETE CASCADE (הסיר צאצאים אם הרכב נמחק).

---

## 6. טבלאות שאינן מושפעות מ-Batch 3
- vehicles — הושלם ב-Batch 2
- heavy_equipment — ל-Batch עתידי
- lifting_equipment — ל-Batch עתידי
- כל שאר הטבלאות — בטיפול Phase 2 עתידי
