# Phase 2 Batch 4 — Audit: Heavy Equipment Tenant Isolation

**תאריך:** 2026-07-30  
**סטטוס:** ממתין למיגרציה  
**טבלאות:** `heavy_equipment`, `heavy_equipment_insurances`

---

## 1. מצב נוכחי — טבלאות

### `heavy_equipment`
| עמודה | סוג | ערת ברירת מחדל | הערה |
|---|---|---|---|
| id | UUID PK | gen_random_uuid() | |
| description | TEXT NOT NULL | | |
| license_number | TEXT | NULL | ייחודיות נוכחית: גלובלית (רק ב-API) |
| image_url | TEXT | NULL | Storage path |
| license_file_url | TEXT | NULL | Storage path |
| license_expiry | DATE | NULL | |
| insurance_file_url | TEXT | NULL | **שדה legacy** — הוחלף ע"י טבלת heavy_equipment_insurances |
| insurance_expiry | DATE | NULL | **שדה legacy** — הוחלף ע"י טבלת heavy_equipment_insurances |
| inspection_file_url | TEXT | NULL | Storage path |
| inspection_expiry | DATE | NULL | |
| subcontractor_id | UUID FK→subcontractors(id) | NULL | SET NULL on DELETE |
| project_name | TEXT | NULL | |
| is_active | BOOLEAN NOT NULL | true | |
| is_archived | BOOLEAN NOT NULL | false | |
| archived_at | TIMESTAMPTZ | NULL | |
| archived_by | TEXT | NULL | |
| manufacturer | TEXT | NULL | |
| machine_identifier | TEXT | NULL | |
| safe_working_load | TEXT | NULL | |
| power_type | TEXT | NULL | |
| created_at | TIMESTAMPTZ | now() | |
| updated_at | TIMESTAMPTZ | now() | |
| **company_id** | **UUID FK→companies(id)** | **MISSING** | **נדרש Batch 4** |

**RLS הנוכחי:** `"Auth users can manage heavy_equipment"` — FOR ALL TO authenticated USING (true) — **ללא הגבלת tenant**

### `heavy_equipment_insurances`
| עמודה | סוג | הערה |
|---|---|---|
| id | UUID PK | |
| heavy_equipment_id | UUID FK→heavy_equipment(id) | ON DELETE CASCADE |
| insurance_type | TEXT NOT NULL | |
| file_url | TEXT | Storage path |
| expiry_date | DATE | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| **company_id** | **UUID FK→companies(id)** | **MISSING — נדרש Batch 4** |

**Constraints:** UNIQUE(heavy_equipment_id, insurance_type)  
**RLS הנוכחי:** ללא (לא הופעל)

---

## 2. מודל בעלות

**שתי הטבלאות: TENANT_OWNED** — כל רשומה שייכת ישירות לחברה.

אינווריאנט:  
`heavy_equipment_insurances.company_id = heavy_equipment.company_id`

רצף הורשה:  
`heavy_equipment.company_id` ← backfill מחברה יחידה  
`heavy_equipment_insurances.company_id` ← backfill מ-`heavy_equipment.company_id`

---

## 3. פערי אבטחה שנמצאו

### API Routes

| Route | בעיה |
|---|---|
| GET /api/heavy-equipment | אין סינון company_id — מחזיר כלים של כל החברות |
| POST /api/heavy-equipment | uniqueness גלובלית (license_number), אין company_id ב-INSERT |
| GET /api/heavy-equipment/[id] | אין בדיקת בעלות |
| PATCH /api/heavy-equipment/[id] | אין בדיקת בעלות |
| DELETE /api/heavy-equipment/[id] | אין בדיקת בעלות |
| GET /api/heavy-equipment-insurances | אין בדיקת בעלות של parent |
| POST /api/heavy-equipment-insurances | אין בדיקת בעלות, אין company_id ב-INSERT |
| PATCH /api/heavy-equipment-insurances/[id] | אין בדיקת בעלות ישירה |
| DELETE /api/heavy-equipment-insurances/[id] | אין בדיקת בעלות ישירה |
| GET /api/alerts | heavy_equipment ללא company_id filter — דלף cross-tenant |

### Pages

| Page | בעיה |
|---|---|
| /dashboard | heavy_equipment query ללא company_id filter |
| /issues | heavy_equipment query ללא company_id filter |
| /archive | heavy_equipment query ללא company_id filter |
| /api/reports/weekly-status | heavy_equipment query ללא company_id filter |

### Storage Authorization

- `heavy_equipment` ו-`heavy_equipment_insurances` ב-STANDALONE_LEGACY_CONFIGS (Mode C)
- Mode C מותר רק כשיש חברה אחת — רגישות גבוהה עם ריבוי חברות

### Export

- `heavy_equipment` ב-GLOBAL_TABLES (לא מסוננת לפי חברה)
- `generateEquipmentExcel()` משתמש בשדות legacy (`insurance_file_url`, `insurance_expiry`) במקום `heavy_equipment_insurances`

---

## 4. תלויות Batch

| Batch | טבלה | תנאי |
|---|---|---|
| Batch 1 | workers | DONE |
| Batch 2 | vehicles, subcontractors | DONE — subcontractors.company_id נדרש לבדיקת cross-tenant |
| Batch 3 | vehicle_licenses, vehicle_insurances | DONE |
| **Batch 4** | **heavy_equipment, heavy_equipment_insurances** | **THIS** |

Safety Guard: Batch 2 חייב להסתיים לפני Batch 4 (subcontractors.company_id חייב להיות NOT NULL).

---

## 5. תוכנית Backfill

**הנחה:** בסביבת Production הנוכחית יש חברה פעילה אחת בלבד.

Logic:
```
SELECT COUNT(*) FROM companies WHERE is_active = true → must be 1
SELECT id FROM companies WHERE is_active = true → company_id לכל heavy_equipment
UPDATE heavy_equipment SET company_id = <single_company_id>
UPDATE heavy_equipment_insurances SET company_id = heavy_equipment.company_id
```

אם יש יותר מחברה אחת — המיגרציה נחסמת ומחייבת הקצאה ידנית.

---

## 6. אכיפה ברמת DB

### Trigger 1: subcontractor_id same-company
- טבלה: `heavy_equipment`
- אירוע: BEFORE INSERT OR UPDATE
- לוגיקה: אם `NEW.subcontractor_id IS NOT NULL`, verify `subcontractors.company_id = NEW.company_id`

### Trigger 2: parent-child company_id consistency
- טבלה: `heavy_equipment_insurances`
- אירוע: BEFORE INSERT OR UPDATE
- לוגיקה: `heavy_equipment_insurances.company_id` חייב להיות שווה ל-`heavy_equipment.company_id`

---

## 7. שינויים נדרשים ב-TypeScript

- `types/index.ts` — הוסף `company_id: string` ל-HeavyEquipment ו-HeavyEquipmentInsurance
- `app/api/heavy-equipment/route.ts` — requireCompanyAdmin(), `.eq('company_id', companyId)`, tenant-local uniqueness
- `app/api/heavy-equipment/[id]/route.ts` — ownership check לפני GET/PATCH/DELETE
- `app/api/heavy-equipment-insurances/route.ts` — parent ownership check, INSERT עם company_id
- `app/api/heavy-equipment-insurances/[id]/route.ts` — direct company_id ownership check
- `app/api/alerts/route.ts` — הוסף `.eq('company_id', companyId)`
- `app/api/reports/weekly-status/route.ts` — הוסף `.eq('company_id', companyId)`
- `app/dashboard/page.tsx` — הוסף `.eq('company_id', companyId)`
- `app/issues/page.tsx` — הוסף `.eq('company_id', companyId)`
- `app/archive/page.tsx` — הוסף `.eq('company_id', companyId)`
- `lib/storage/authorize.ts` — העבר ל-TENANT_MIGRATED_TABLES, הסר מ-STANDALONE_LEGACY_CONFIGS
- `lib/export/exportTables.ts` — העבר ל-COMPANY_SCOPED_TABLES
- `lib/export/generateExcel.ts` — תקן generateEquipmentExcel() לשימוש ב-insurances array
