# Phase 2 Batch 2 — ביקורת: קבלני משנה ורכבים

## סיכום ממצאים

| ממצא | חומרה | מצב |
|---|---|---|
| `subcontractors` — חסר `company_id` | קריטי | ✅ ממתין למיגרציה |
| `vehicles` — חסר `company_id` | קריטי | ✅ ממתין למיגרציה |
| `vehicles.vehicle_number` — unique גלובלי | קריטי | ✅ ממתין למיגרציה |
| כל API-י קבלני משנה — ללא company context | קריטי | ✅ תוקן בקוד |
| כל API-י רכבים — ללא company context | קריטי | ✅ תוקן בקוד |
| vehicle-licenses/insurances — ללא ownership check | קריטי | ✅ תוקן (דרך parent vehicle) |
| worker DELETE — cleanup ל-subcontractors/vehicles ללא company_id | גבוה | ✅ תוקן |
| storage authorize Mode C — ייחסם עם 2+ חברות | קריטי | ✅ עודכן |
| export — subcontractors/vehicles גלובליים | גבוה | ✅ תוקן |
| `subcontractors/page.tsx` — ללא auth + ללא company scope | גבוה | ✅ תוקן |
| `vehicles/[id]/page.tsx` — workers dropdown לא מסונן | בינוני | ✅ תוקן |
| `vehicles/new/page.tsx` — workers dropdown לא מסונן | בינוני | ✅ תוקן |
| alerts API — vehicles/equipment ללא company scope | גבוה | ✅ תוקן |
| weekly-report — vehicles/equipment ללא company scope | גבוה | ✅ תוקן |

---

## סכמות מדויקות שנמצאו

### טבלת `subcontractors`

```sql
id                   UUID    PK DEFAULT gen_random_uuid()
name                 TEXT    NOT NULL
contact_name         TEXT    NULL
phone                TEXT    NULL
notes                TEXT    NULL
responsible_worker_id UUID    NULL FK → workers(id)   (ON DELETE לא ידוע — אין migration)
is_archived          BOOLEAN NOT NULL DEFAULT false
archived_at          TIMESTAMPTZ NULL
archived_by          TEXT    NULL
created_at           TIMESTAMPTZ DEFAULT now()
updated_at           TIMESTAMPTZ DEFAULT now()
```

**חסר:** `company_id` — לא קיים.

**אין** UNIQUE constraint על אף עמודה.

**הערה:** `responsible_worker_id` קיים ב-production אך אין migration file שמוסיף אותו — ככל הנראה הוסף ישירות ב-Supabase Editor. ON DELETE clause לא ידוע מהקוד, אך הוא מסוכן: מחיקת עובד מחברה א' יכולה לאפס את `responsible_worker_id` של קבלן משנה מחברה ב'.

**RLS כרגע:**
```sql
"Authenticated users can read subcontractors"   FOR SELECT TO authenticated USING (true)
"Authenticated users can insert subcontractors" FOR INSERT TO authenticated WITH CHECK (true)
"Authenticated users can update subcontractors" FOR UPDATE TO authenticated USING/WITH CHECK (true)
"Authenticated users can delete subcontractors" FOR DELETE TO authenticated USING (true)
```
→ כל משתמש מאומת רואה ומשנה את כל קבלני המשנה בכל החברות.

---

### טבלת `vehicles`

```sql
id                   UUID    PK DEFAULT gen_random_uuid()
vehicle_type         TEXT    NOT NULL
model                TEXT    NULL
vehicle_number       TEXT    NOT NULL UNIQUE (גלובלי! workers_vehicle_number_unique)
vehicle_color        TEXT    NULL
image_url            TEXT    NULL
assigned_manager_id  UUID    NULL FK → workers(id) ON DELETE SET NULL
project_name         TEXT    NULL
is_active            BOOLEAN NOT NULL DEFAULT true
notes                TEXT    NULL
is_archived          BOOLEAN NOT NULL DEFAULT false
archived_at          TIMESTAMPTZ NULL
archived_by          TEXT    NULL
created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
```

**חסר:** `company_id` — לא קיים.

**בעיית UNIQUE גלובלי:** `vehicles_vehicle_number_unique` על `vehicle_number` בלבד — חברה ב' לא תוכל להכניס רכב עם אותו מספר רישוי כמו ברכב של חברה א', מה שישבור multi-tenancy.

**FK מסוכן:** `assigned_manager_id → workers(id)` — אין אכיפת DB שמנהל וכלי הרכב שייכים לאותה חברה. נאכף ברמת האפליקציה.

**RLS כרגע:**
```sql
"vehicles_authenticated" FOR ALL TO authenticated USING (true) WITH CHECK (true)
```

---

### טבלת `vehicle_licenses`

```sql
id           UUID PK
vehicle_id   UUID NOT NULL FK → vehicles(id) ON DELETE CASCADE
file_url     TEXT NULL
expiry_date  DATE NULL
created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
```

**אין company_id** — tenant identity מגיעה דרך vehicle_id בלבד.
**RLS:** `"vehicle_licenses_authenticated"` blanket ALL.

---

### טבלת `vehicle_insurances`

```sql
id             UUID PK
vehicle_id     UUID NOT NULL FK → vehicles(id) ON DELETE CASCADE
insurance_type TEXT NOT NULL
file_url       TEXT NULL
expiry_date    DATE NULL
created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE(vehicle_id, insurance_type)
```

**אין company_id.** RLS: blanket ALL.

---

## כל ה-API Routes — ניתוח מפורט

### `/api/subcontractors` — GET / POST

| שדה | מצב לפני | מצב אחרי |
|---|---|---|
| auth | `requireAuth()` | `getCurrentCompanyContext()` |
| company scope | ❌ אין | ✅ `.eq('company_id', companyId)` |
| service_role | ✅ כן | ✅ כן |
| client company_id | ✅ לא קיים | ✅ מוגדר server-side |
| duplicate check | ❌ אין | ✅ ב-DB constraint לאחר מיגרציה |

**שינוי נדרש:** החלפת `requireAuth/requireAdmin` ב-`getCurrentCompanyContext/requireCompanyAdmin`. הוספת `.eq('company_id', companyId)` לכל query. הגדרת `company_id = companyId` ב-INSERT. בדיקת ownership לפני DELETE.

---

### `/api/subcontractors/[id]` — GET / PATCH / DELETE

| שדה | מצב לפני | מצב אחרי |
|---|---|---|
| auth | `requireAuth()` | `getCurrentCompanyContext()` |
| ownership check | ❌ אין | ✅ `.eq('company_id', companyId)` |
| responsible_worker cross-tenant | ❌ אין בדיקה | ✅ בדיקת worker.company_id === companyId |
| archive | ❌ ללא company check | ✅ בדיקת ownership |
| delete | ❌ ללא company check | ✅ בדיקת ownership |

---

### `/api/vehicles` — GET / POST

| שדה | מצב לפני | מצב אחרי |
|---|---|---|
| auth | `requireAuth()` | `getCurrentCompanyContext()` |
| company scope | ❌ אין | ✅ `.eq('company_id', companyId)` |
| vehicle_number unique check | ❌ גלובלי | ✅ מסונן לחברה + DB composite |
| assigned_manager cross-tenant | ❌ אין בדיקה | ✅ בדיקת worker.company_id === companyId |
| duplicate message | `"כבר קיים במערכת"` | `"כבר קיים בחברה"` |

---

### `/api/vehicles/[id]` — GET / PATCH / DELETE

| שדה | מצב לפני | מצב אחרי |
|---|---|---|
| auth | `requireAdmin()` | `requireCompanyAdmin()` |
| ownership | ❌ `.eq('id', id)` | ✅ `.eq('id', id).eq('company_id', companyId)` |
| assigned_manager cross-tenant | ❌ אין | ✅ בדיקת worker ownership |
| delete | ❌ לא בודק company | ✅ בדיקת ownership |

---

### `/api/vehicle-licenses` ו-`/api/vehicle-insurances`

| שדה | מצב לפני | מצב אחרי |
|---|---|---|
| auth | `requireAdmin()` | `requireCompanyAdmin()` |
| GET by vehicle_id | ❌ ללא ownership check | ✅ בדיקת vehicle.company_id |
| POST | ❌ ללא ownership check | ✅ בדיקת parent vehicle ownership |
| PATCH/DELETE | ❌ ללא ownership chain | ✅ record → vehicle_id → vehicle.company_id |

---

### `/api/alerts`

| שדה | מצב לפני | מצב אחרי |
|---|---|---|
| auth | `getCurrentCompanyContext()` ✅ | ✅ ללא שינוי |
| workers query | ✅ `.eq('company_id', companyId)` | ✅ |
| vehicles query | ❌ ללא company_id | ✅ `.eq('company_id', companyId)` |
| heavy_equipment query | ❌ ללא company_id | ❌ עדיין legacy (Batch 3) |
| lifting_equipment query | ❌ ללא company_id | ❌ עדיין legacy (Batch 3) |

---

### `/api/reports/weekly-status`

| שדה | מצב לפני | מצב אחרי |
|---|---|---|
| workers query | ✅ company_id | ✅ |
| vehicles query | ❌ גלובלי | ✅ `.eq('company_id', companyId)` |
| heavy_equipment | ❌ גלובלי | ❌ legacy (Batch 3) |
| lifting_equipment | ❌ גלובלי | ❌ legacy (Batch 3) |

---

## ניתוח Pages

### `/subcontractors/page.tsx`

**מצב לפני:** `createServiceClient()` ישיר, ללא auth wrapper, ללא company scope.
**מצב אחרי:** שימוש ב-`getCurrentCompanyContext()`, סינון לפי `company_id`.

### `/vehicles/[id]/page.tsx`

**מצב לפני:** Workers dropdown: `.from('workers').select().eq('is_active', true)` — כל חברות.
**מצב אחרי:** Workers dropdown: `.eq('is_active', true).eq('company_id', companyId)`.

### `/vehicles/new/page.tsx`

**מצב לפני:** Workers dropdown גלובלי.
**מצב אחרי:** Workers dropdown מסונן לחברה.

---

## ניתוח Storage Authorization

### מצב לפני Batch 2

```
TENANT_MIGRATED_TABLES = { workers, documents }
STANDALONE_LEGACY_CONFIGS = [
  vehicles        → image_url
  vehicle_licenses → file_url
  vehicle_insurances → file_url
  heavy_equipment → image_url, license_file_url, insurance_file_url, inspection_file_url
  heavy_equipment_insurances → file_url
  lifting_equipment → image_url, inspection_file_url
]
```

**Mode C (standalone legacy) ייחסם כשתהיה יותר מחברה אחת פעילה** — כולל גישה לקבצי רכבים וציוד.

### מצב אחרי Batch 2

```
TENANT_MIGRATED_TABLES = { workers, documents, vehicles }  ← vehicles הוסף
STANDALONE_LEGACY_CONFIGS = [
  heavy_equipment → image_url, license_file_url, insurance_file_url, inspection_file_url
  heavy_equipment_insurances → file_url
  lifting_equipment → image_url, inspection_file_url
]
```

`vehicle_licenses` ו-`vehicle_insurances` → **Mode B-vehicle** (דרך `vehicle_id IN (company vehicle IDs)`).

---

## Export (`lib/export/exportTables.ts`)

| טבלה | מצב לפני | מצב אחרי |
|---|---|---|
| `workers` | COMPANY_SCOPED ✅ | ✅ |
| `documents` | COMPANY_SCOPED ✅ | ✅ |
| `subcontractors` | GLOBAL_TABLES ❌ | COMPANY_SCOPED ✅ |
| `vehicles` | GLOBAL_TABLES ❌ | COMPANY_SCOPED ✅ |
| `vehicle_licenses` | GLOBAL_TABLES ❌ | ⚠️ via parent vehicle (Batch 3) |
| `vehicle_insurances` | GLOBAL_TABLES ❌ | ⚠️ via parent vehicle (Batch 3) |
| `heavy_equipment` | GLOBAL_TABLES ❌ | GLOBAL_TABLES (Batch 3) |
| `safety_briefings` | GLOBAL_TABLES ❌ | GLOBAL_TABLES (Batch 3) |

---

## ייחודיות זהות עסקית

### vehicle_number

**החלטה:** הסרת global UNIQUE, יצירת `UNIQUE(company_id, vehicle_number)`.
**נימוק:** מספר רישוי הוא מזהה עסקי קנוני לרכב, אך כל חברה מנהלת את הרכבים שלה באופן עצמאי. אותו מספר רישוי יכול להופיע בשתי חברות שמנהלות את אותו רכב פיזי (נדיר אך לגיטימי).
**הודעת שגיאה:** `"רכב עם מספר רישוי זה כבר קיים בחברה"` — לא `"במערכת"`.

### subcontractor name

**החלטה:** אין UNIQUE constraint על שם קבלן משנה.
**נימוק:** אין שדה "מספר עוסק" / "מספר רישום עסק" בסכמה הנוכחית. שמות קבלנים יכולים להיות זהים (לגיטימי). אם יתווסף שדה מספר עוסק בעתיד — יקבל `UNIQUE(company_id, business_number)`.

---

## FK בין-entities: רכב ↔ עובד, קבלן משנה ↔ עובד

### בעיה

`vehicles.assigned_manager_id → workers(id)` — FK בלבד, ללא אכיפת חברה.
`subcontractors.responsible_worker_id → workers(id)` — FK בלבד, ללא אכיפת חברה.

### אכיפה

**DB:** לא ניתן להוסיף FK compound (`vehicle.company_id = worker.company_id`) ב-PostgreSQL standard FK.
**אפליקציה:** בדיקת cross-company בכל PATCH/POST:
```typescript
// לפני הגדרת assigned_manager_id על רכב:
const { data: manager } = await supabase
  .from('workers').select('id')
  .eq('id', assigned_manager_id).eq('company_id', companyId)
  .maybeSingle();
if (!manager) return NextResponse.json({ error: 'עובד לא נמצא בחברה זו' }, { status: 422 });
```
**RLS (defense-in-depth):** policies מגבילות לחברה פעילה של המשתמש.

---

## מגבלות ידועות לאחר Batch 2

| נושא | מצב | Batch |
|---|---|---|
| `heavy_equipment` — חסר company_id | legacy | 3 |
| `lifting_equipment` — חסר company_id | legacy | 3 |
| `heavy_equipment_insurances` | legacy | 3 |
| `safety_briefings` — חסר company_id | legacy | 3 |
| `height_restrictions` | legacy | 3 |
| `vehicle_licenses` — company_id ישיר | legacy (parent-validated) | 3 |
| `vehicle_insurances` — company_id ישיר | legacy (parent-validated) | 3 |
| export של vehicle-children | partial | 3 |
