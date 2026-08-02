# Phase 2 Batch 5 — Audit: Lifting Equipment Tenant Isolation

**תאריך:** 2026-07-30  
**סטטוס:** ממתין למיגרציה  
**טבלאות:** `lifting_equipment`

---

## 1. מצב נוכחי — טבלה

### `lifting_equipment`
| עמודה | סוג | ערת ברירת מחדל | הערה |
|---|---|---|---|
| id | UUID PK | gen_random_uuid() | |
| description | TEXT NOT NULL | | |
| image_url | TEXT | NULL | Storage path |
| inspection_file_url | TEXT | NULL | Storage path |
| inspection_expiry | DATE | NULL | |
| subcontractor_id | UUID FK→subcontractors(id) | NULL | SET NULL on DELETE |
| project_name | TEXT | NULL | |
| is_active | BOOLEAN NOT NULL | true | |
| is_archived | BOOLEAN NOT NULL | false | |
| archived_at | TIMESTAMPTZ | NULL | |
| archived_by | TEXT | NULL | |
| created_at | TIMESTAMPTZ | now() | |
| updated_at | TIMESTAMPTZ | now() | |
| **company_id** | **UUID FK→companies(id)** | **MISSING** | **נדרש Batch 5** |

**RLS הנוכחי:** `"Auth users can manage lifting_equipment"` — FOR ALL TO authenticated USING (true) — **ללא הגבלת tenant**

**Trigger הנוכחי:** `lifting_equipment_updated_at` — updated_at בלבד.

---

## 2. מודל בעלות

**TENANT_OWNED** — כל רשומה שייכת ישירות לחברה.

רצף הורשה:  
`lifting_equipment.company_id` ← backfill מחברה יחידה פעילה

אין טבלות ילד — `lifting_equipment` היא standalone (אין heavy_equipment_insurances מקבילה).

**אחרי Batch 5**: `STANDALONE_LEGACY_CONFIGS` יהיה **ריק לחלוטין**. Storage Mode C לא יהיה בשימוש עוד.

---

## 3. פערי אבטחה שנמצאו

### API Routes

| Route | בעיה |
|---|---|
| GET /api/lifting-equipment | אין סינון company_id — מחזיר ציוד של כל החברות |
| POST /api/lifting-equipment | אין company_id ב-INSERT — insertמגלובלי |
| GET /api/lifting-equipment/[id] | אין בדיקת בעלות — כל ID נגיש |
| PATCH /api/lifting-equipment/[id] | אין בדיקת בעלות — עדכון cross-company |
| DELETE /api/lifting-equipment/[id] | אין בדיקת בעלות — מחיקה cross-company |

### Pages ו-APIs שמשתמשים ב-lifting_equipment ללא סינון

| מיקום | בעיה |
|---|---|
| `app/dashboard/page.tsx` | `.from('lifting_equipment')` ללא `.eq('company_id', companyId)` |
| `app/issues/page.tsx` | `.from('lifting_equipment')` ללא `.eq('company_id', companyId)` |
| `app/archive/page.tsx` | `.from('lifting_equipment')` ללא `.eq('company_id', companyId)` |
| `app/api/alerts/route.ts` | `.from('lifting_equipment')` ללא `.eq('company_id', companyId)` |
| `app/api/reports/weekly-status/route.ts` | `.from('lifting_equipment')` ללא `.eq('company_id', companyId)` |

### Storage

`lib/storage/authorize.ts` — `lifting_equipment` נמצאת ב-**`STANDALONE_LEGACY_CONFIGS` (Mode C)**:
```typescript
{ table: 'lifting_equipment', urlColumns: ['image_url', 'inspection_file_url'] }
```

Mode C מסוכן: תקף רק כשיש חברה יחידה פעילה. לאחר Batch 5 יעבור ל-**Mode A** (company_id ישיר).

### Export

`lib/export/exportTables.ts` — `lifting_equipment` נמצאת ב-**`GLOBAL_TABLES`** — מייצא נתוני כל החברות.

---

## 4. אסטרטגיית Backfill

**תנאים:**
- Batch 2 חייב להיות complete (subcontractors.company_id = NOT NULL)
- **חברה יחידה פעילה** בטבלת `companies` (is_active = true)

**תהליך:**
```sql
UPDATE lifting_equipment
SET company_id = (SELECT id FROM companies WHERE is_active = true LIMIT 1)
WHERE company_id IS NULL;
```

Safety Guard: אם יש יותר מחברה אחת פעילה ו-`company_id` עדיין לא קיים — migration יכשל עם `BLOCKED`.

---

## 5. אכיפה ברמת DB

### Trigger: subcontractor_same_company
```
enforce_lifting_equipment_subcontractor_same_company()
  BEFORE INSERT OR UPDATE ON lifting_equipment
```
אינווריאנט: `subcontractors.company_id = lifting_equipment.company_id`

---

## 6. שינויים נדרשים ב-TypeScript

| קובץ | שינוי |
|---|---|
| `types/index.ts` | הוסף `company_id: string` ל-`LiftingEquipment` |
| `app/api/lifting-equipment/route.ts` | `requireCompanyAdmin()` + `.eq('company_id', companyId)` |
| `app/api/lifting-equipment/[id]/route.ts` | ownership check עם `company_id` |
| `app/dashboard/page.tsx` | `.eq('company_id', companyId)` לטבלת lifting_equipment |
| `app/issues/page.tsx` | `.eq('company_id', companyId)` לטבלת lifting_equipment |
| `app/archive/page.tsx` | `.eq('company_id', companyId)` לטבלת lifting_equipment |
| `app/api/alerts/route.ts` | `.eq('company_id', companyId)` לטבלת lifting_equipment |
| `app/api/reports/weekly-status/route.ts` | `.eq('company_id', companyId)` לטבלת lifting_equipment |
| `lib/storage/authorize.ts` | העבר ל-TENANT_MIGRATED_TABLES; הסר מ-STANDALONE_LEGACY_CONFIGS; הוסף Mode A fetch |
| `lib/export/exportTables.ts` | העבר מ-GLOBAL_TABLES ל-COMPANY_SCOPED_TABLES |

---

## 7. טבלאות שנותרו לבחינה עתידית (Batch 6)

| טבלה | סוג בעיה | עדיפות |
|---|---|---|
| `professional_licenses` | worker-linked; GET/PATCH/DELETE ללא company check | גבוהה |
| `manager_licenses` | worker-linked; GET/PATCH/DELETE ללא company check | גבוהה |
| `lifting_machine_appointments` | worker-linked; GET/POST/DELETE ללא company check | גבוהה |
| `entity_notes` | cross-entity; GET/POST/PATCH/DELETE ללא company check | בינונית |
| `profiles` | platform-level (לא company-scoped by design) | לא בתחום |
| `authorized_phones` | platform-level | לא בתחום |
| `legal_acceptances` | platform-level | לא בתחום |
