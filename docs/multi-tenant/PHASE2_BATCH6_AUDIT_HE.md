# Phase 2 Batch 6 — Audit Report (עברית)

## מטרה
בחינה מלאה של שש טבלאות מועמדות לבידוד דייר ב-Batch 6.
כל טבלה מסווגת לאחת מארבע קטגוריות בעלות:
- **A — DIRECT TENANT-OWNED**: company_id ישיר בטבלה עצמה.
- **B — PARENT-INHERITED**: ירושת company_id מהורה (workers) ללא עמודה משלה.
- **C — PLATFORM/INTERNAL**: נתוני פלטפורמה שאינם שייכים לדייר ספציפי.
- **D — DEPRECATED/UNUSED**: טבלה נטושה.

---

## 1. professional_licenses — סיווג: B (PARENT-INHERITED)

### סכמה
```
id UUID PK
worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE
license_type TEXT NOT NULL
license_number TEXT
expiry_date DATE
file_url TEXT
notes TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```
**אין company_id.** כל רשומה שייכת לבדיוק עובד אחד.

### מצב ב-API לפני Batch 6
| פעולה | endpoint | auth | company check |
|--------|----------|------|---------------|
| GET list | `GET /api/professional-licenses?worker_id=` | requireAuth | ✗ לא — כל worker_id מקבל תשובה |
| CREATE | `POST /api/professional-licenses` | requireAdmin | ✗ לא — worker_id לא מאומת מול חברה |
| UPDATE | `PATCH /api/professional-licenses/[id]` | requireAdmin | ✗ לא |
| DELETE | `DELETE /api/professional-licenses/[id]` | requireAdmin | ✗ לא |

### מצב Storage
Mode B (worker_id → workers.company_id) — `file_url` מאומת דרך שרשרת עובד.

### מצב RLS
אין הגדרה מפורשת בקובצי migration שנסרקו (ייתכן שאין RLS כלל על טבלה זו).

### מצב Export
**לא כלול** ב-COMPANY_SCOPED_TABLES ולא ב-GLOBAL_TABLES — לא מיוצא כלל!

### פערים שנמצאו
1. GET, POST, PATCH, DELETE — אין אימות שהעובד שייך לחברה.
2. אין RLS מוגדר (ייתכן שגישה ישירה לטבלה פתוחה).
3. לא מיוצא ב-admin export.

### החלטה: PARENT-INHERITED (B)
הרשומות תמיד נגישות דרך worker_id בלבד. אין גישה עצמאית.
**פתרון:** תיקון API + RLS מבוסס שרשרת עובד + הוספת WORKER_SCOPED_TABLES ב-export.

---

## 2. manager_licenses — סיווג: B (PARENT-INHERITED)

### סכמה
```
id UUID PK
worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE
license_type TEXT NOT NULL
vehicle_number TEXT
file_url TEXT
expiry_date DATE
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```
**אין company_id.** כל רשומה שייכת לבדיוק עובד אחד.

### מצב ב-API לפני Batch 6
| פעולה | endpoint | auth | company check |
|--------|----------|------|---------------|
| GET list | `GET /api/manager-licenses?worker_id=` | requireAuth | ✗ לא |
| CREATE | `POST /api/manager-licenses` | requireAdmin | ✗ לא |
| UPDATE | `PATCH /api/manager-licenses/[id]` | requireAdmin | ✗ לא |
| DELETE | `DELETE /api/manager-licenses/[id]` | requireAdmin | ✗ לא |

### מצב Storage
Mode B — `file_url` מאומת דרך worker_id → workers.company_id.

### מצב RLS
`manager_licenses_authenticated` FOR ALL TO authenticated USING (true) — פרוץ.

### מצב Export
**לא כלול** — לא מיוצא כלל.

### פערים שנמצאו
1. GET, POST, PATCH, DELETE — אין אימות שהעובד שייך לחברה.
2. RLS מאפשר לכל authenticated לקרוא ולכתוב לכל רשומות.
3. לא מיוצא ב-admin export.

### החלטה: PARENT-INHERITED (B)
**פתרון:** תיקון API + החלפת RLS לשרשרת עובד + WORKER_SCOPED_TABLES.

---

## 3. lifting_machine_appointments — סיווג: A (DIRECT TENANT-OWNED)

### סכמה
```
id UUID PK
worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE
equipment_id UUID REFERENCES heavy_equipment(id) ON DELETE SET NULL
machine_name TEXT NOT NULL
manufacturer TEXT
machine_identifier TEXT
safe_working_load TEXT
power_type TEXT
appointer_name TEXT NOT NULL
appointer_role TEXT
appointer_phone TEXT
appointer_address TEXT
appointer_zip TEXT
appointment_date DATE
operator_signature_url TEXT
appointer_signature_url TEXT
pdf_url TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```
**אין company_id.** שני הורים: workers (company_id ✓ מ-Batch 1), heavy_equipment (company_id ✓ מ-Batch 4).

### מצב ב-API לפני Batch 6
| פעולה | endpoint | auth | company check |
|--------|----------|------|---------------|
| GET list | `GET /api/lifting-machine-appointments` | requireAuth | ✗ לא — ללא worker_id מחזיר הכל |
| GET single | `GET /api/lifting-machine-appointments/[id]` | requireAuth | ✗ לא |
| CREATE | `POST /api/lifting-machine-appointments` | requireAdmin | ✗ לא — worker + equipment לא מאומתים |
| DELETE | `DELETE /api/lifting-machine-appointments/[id]` | requireAdmin | ✗ לא |
| PDF | `POST /api/lifting-machine-appointments/generate-pdf` | requireAdmin | ✗ לא |

### מצב Storage
Mode B — pdf_url, operator_signature_url, appointer_signature_url דרך worker_id.

### מצב RLS
`Auth users can manage lifting_machine_appointments` — פרוץ.

### מצב Export
GLOBAL_TABLES — מייצא כל מינויים מכל חברות.

### פערים שנמצאו
1. GET list ללא worker_id מחזיר את כל המינויים מכל חברות.
2. POST יכול לקשר עובד מחברה א' עם ציוד מחברה ב'.
3. GET/DELETE [id] — אין בדיקת בעלות.
4. generate-pdf — אין בדיקת בעלות.
5. RLS פרוץ.
6. Export לא מסונן.

### סיבות לבחירת DIRECT TENANT-OWNED
- GET list ללא worker_id חייב להיות מסונן — רק company_id מאפשר זאת בצורה נקייה.
- כפל הורים (worker + heavy_equipment) דורש אכיפת same-company ברמת DB.
- Storage: Mode A פשוט יותר וישיר יותר עם company_id.
- Export: חייב להיות company-scoped.

**פתרון:** הוספת company_id + backfill מ-worker.company_id + trigger אכיפה + RLS + תיקון API.

---

## 4. safety_briefings — סיווג: B (PARENT-INHERITED)

### סכמה
```
id UUID PK
worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE
mode TEXT CHECK ('system','external')
language TEXT
conducted_by TEXT
signature_url TEXT
file_url TEXT
briefed_at DATE NOT NULL
expires_at DATE NOT NULL
created_at TIMESTAMPTZ
```
**אין company_id.**

### מצב ב-API לפני Batch 6
| פעולה | endpoint | auth | company check |
|--------|----------|------|---------------|
| CREATE | `POST /api/safety-briefings` | requireCompanyAdmin | ✓ בודק workers.company_id |
| DELETE | `DELETE /api/safety-briefings` | requireCompanyAdmin | ✓ בודק worker דרך briefing |
| READ | (אין GET route ישיר) | — | — |

**ה-API כבר מוגן לחלוטין לכתיבה!** הקריאה מתבצעת רק דרך nested query על workers (מסונן לפי company_id).

### מצב Storage
Mode B — file_url, signature_url דרך worker_id → workers.company_id.

### מצב RLS
`authenticated users can read` — SELECT בלבד ל-authenticated (פרוץ לקריאה).
`service role full access` — service_role ALL.

### מצב Export
GLOBAL_TABLES — **מייצא תדריכים מכל החברות!**

### פערים שנמצאו
1. RLS SELECT לא מסונן לפי חברה — כל authenticated יכול לקרוא כל תדריך ישירות מ-Supabase.
2. Export ב-GLOBAL_TABLES — דולף נתונים של חברות אחרות.

### החלטה: PARENT-INHERITED (B)
API כתיבה כבר מוגן. פתרון: החלפת RLS SELECT לשרשרת עובד + הזזה ל-WORKER_SCOPED_TABLES ב-export.

---

## 5. height_restrictions — סיווג: B (PARENT-INHERITED)

### סכמה
```
id UUID PK
worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE
language TEXT NOT NULL
conducted_by TEXT
signature_url TEXT
file_url TEXT
issued_at TIMESTAMPTZ NOT NULL
expires_at TIMESTAMPTZ NOT NULL
created_at TIMESTAMPTZ
```
**אין company_id.**

### מצב ב-API לפני Batch 6
| פעולה | endpoint | auth | company check |
|--------|----------|------|---------------|
| CREATE | `POST /api/height-restrictions` | requireCompanyAdmin | ✓ בודק workers.company_id |
| DELETE | `DELETE /api/height-restrictions` | requireCompanyAdmin | ✓ בודק worker דרך restriction |

**ה-API כבר מוגן לחלוטין לכתיבה!**

### מצב Storage
Mode B — file_url, signature_url דרך worker_id.

### מצב RLS
`Auth users can manage height_restrictions` FOR ALL TO authenticated — **פרוץ לגמרי** (read + write).

### מצב Export
GLOBAL_TABLES — דולף נתונים.

### פערים שנמצאו
1. RLS מאפשר לכל authenticated לקרוא ולכתוב ישירות — הכי גרוע מבין טבלאות B.
2. Export ב-GLOBAL_TABLES — דולף נתונים.

### החלטה: PARENT-INHERITED (B)
**פתרון:** החלפת RLS לשרשרת עובד (SELECT בלבד ל-authenticated) + WORKER_SCOPED ב-export.

---

## 6. entity_notes — סיווג: A (DIRECT TENANT-OWNED)

### סכמה
```
id UUID PK
entity_type TEXT CHECK ('worker','vehicle','heavy_equipment','lifting_equipment','subcontractor')
entity_id UUID NOT NULL
content TEXT NOT NULL
status TEXT CHECK ('ok','needs_attention')
created_by TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```
**אין company_id. אין worker_id. ישות פולימורפית.**

### מצב ב-API לפני Batch 6
| פעולה | endpoint | auth | company check |
|--------|----------|------|---------------|
| GET list | `GET /api/entity-notes?entity_type=&entity_id=` | requireAuth | ✗ לא — כל entity_id מחזיר |
| CREATE | `POST /api/entity-notes` | requireAuth | ✗ לא — entity_id לא מאומת |
| UPDATE | `PATCH /api/entity-notes/[id]` | requireAuth | ✗ לא |
| DELETE | `DELETE /api/entity-notes/[id]` | requireAuth | ✗ לא |

### מצב Storage
אין קבצים — entity_notes לא מכיל URL.

### מצב RLS
`authenticated manage notes` FOR ALL TO authenticated — פרוץ לגמרי.

### מצב Export
GLOBAL_TABLES — מייצא הכל.

### פערים שנמצאו
1. GET: כל authenticated יכול לקרוא הערות של ישויות מחברות אחרות.
2. POST: entity_id לא מאומת — ניתן לצרף הערה לישות של חברה אחרת.
3. PATCH/DELETE: אין בדיקת בעלות כלל.
4. RLS פרוץ לגמרי.
5. Export לא מסונן.

### סיבות לבחירת DIRECT TENANT-OWNED
- אין עמודת FK ישירה אחת שמזהה את ההורה — ישות פולימורפית (5 סוגי הורה).
- כל 5 סוגי הורה (workers, vehicles, heavy_equipment, lifting_equipment, subcontractors) כבר מכילים company_id.
- הוספת company_id ישירה פותרת את כל הבעיות בצורה נקייה.
- Backfill: UPDATE לפי כל entity_type בנפרד.
- Trigger אכיפה: resolve entity → compare company_id.

**פתרון:** הוספת company_id + polymorphic backfill + consistency trigger + RLS + תיקון API + lib/company/resolve-entity-company.ts.

---

## סיכום סיווג

| טבלה | סיווג | שינוי סכמה? | שינוי API? | שינוי RLS? | שינוי Export? |
|------|--------|-------------|------------|------------|----------------|
| professional_licenses | B | ✗ | ✓ | ✓ | ✓ (WORKER_SCOPED) |
| manager_licenses | B | ✗ | ✓ | ✓ | ✓ (WORKER_SCOPED) |
| lifting_machine_appointments | A | ✓ company_id | ✓ | ✓ | ✓ (COMPANY_SCOPED) |
| safety_briefings | B | ✗ | ✗ (כבר מוגן) | ✓ | ✓ (WORKER_SCOPED) |
| height_restrictions | B | ✗ | ✗ (כבר מוגן) | ✓ | ✓ (WORKER_SCOPED) |
| entity_notes | A | ✓ company_id | ✓ | ✓ | ✓ (COMPANY_SCOPED) |

## Batch 6 — קבוצות עבודה
- **Group A — Schema migration**: lifting_machine_appointments, entity_notes
- **Group B — API fix + RLS**: professional_licenses, manager_licenses
- **Group C — RLS only**: safety_briefings, height_restrictions
- **Group D — Export + Storage**: כל הטבלאות

## הגבלות שנשארות (Phase 3+)
- worker detail page (app/workers/[id]/page.tsx) לא מוגן לפי company_id ברמת דף — gap עתידי.
- entity_notes PATCH/DELETE לא מאמת שהמשתמש יצר את ההערה — כל admin בחברה יכול לשנות הכל (מקובל).
