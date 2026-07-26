# ביקורת: Phase 2 Batch 1 — Workers + Documents Tenant Isolation

## מסמך ביקורת — Multi-Tenant Phase 2, Batch 1

**תאריך:** 2026-07-25  
**טווח:** workers, documents, routes תלויות-עובד, dashboard, issues, archive, export

---

## 1. מצב לפני המיגרציה

### טבלת workers
| עמודה | מצב לפני | מצב אחרי |
|-------|----------|----------|
| company_id | **חסר** | UUID NOT NULL FK → companies(id) |

**רשומות:** כל Workers שייכים לחברת ברירת המחדל (`00000000-0000-0000-0000-000000000001`)

### טבלת documents
| עמודה | מצב לפני | מצב אחרי |
|-------|----------|----------|
| company_id | **חסר** | UUID NOT NULL FK → companies(id) |

**רשומות:** כל Documents מקבלים company_id מה-worker ההורה שלהם

### טבלת companies
| עמודה | מצב לפני | מצב אחרי |
|-------|----------|----------|
| settings | **חסר** | JSONB NOT NULL DEFAULT '{}' |

---

## 2. RLS לפני ואחרי

### workers — לפני
```sql
"authenticated users can manage workers"
  ON workers FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```
**בעיה:** כל משתמש מאומת יכול לקרוא ולכתוב כל worker מכל חברה.

### workers — אחרי
```sql
workers_select_company   -- SELECT: רק workers של החברה שלי
workers_insert_company   -- INSERT: רק לחברה שלי
workers_update_company   -- UPDATE: רק workers של החברה שלי
workers_delete_company   -- DELETE: רק workers של החברה שלי
workers_service_all      -- ALL TO service_role
```

### documents — לפני
```sql
"authenticated users can manage documents"
  ON documents FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

### documents — אחרי
```sql
documents_select_company
documents_insert_company
documents_update_company
documents_delete_company
documents_service_all
```

**עיקרון RLS:** כל הפוליסי מנגנוני `company_members` בצד DB (שכבת הגנה נוספת). האפליקציה עצמה משתמשת ב-`service_role` (עוקפת RLS), כך שהאכיפה העיקרית היא ב-Application Layer דרך `getCurrentCompanyContext()`.

---

## 3. ביקורת API Routes — Workers

### `/api/workers` (GET)
| לפני | אחרי |
|------|------|
| `requireAuth()` | `getCurrentCompanyContext()` |
| ללא `company_id` filter | `.eq('company_id', companyId)` |
| מחזיר **כל** ה-workers | מחזיר רק workers של החברה |

### `/api/workers` (POST)
| לפני | אחרי |
|------|------|
| `requireAdmin()` | `requireCompanyAdmin()` |
| ללא `company_id` ב-insert | `company_id: companyId` ב-insert |
| חיפוש כפילויות גלובלי | חיפוש כפילויות בתוך החברה בלבד |

### `/api/workers/[id]` (GET/PUT/PATCH/DELETE)
| לפני | אחרי |
|------|------|
| lookup by `id` only | lookup by `id` AND `company_id` |
| ללא בדיקת ownership | 404 אם id לא שייך לחברה |

**סיכון שנסגר:** User B יכול היה לקרוא/לעדכן/למחוק Worker של User A.

---

## 4. ביקורת API Routes — Documents

### `/api/documents` (POST)
| לפני | אחרי |
|------|------|
| fetch worker ללא company check | fetch worker עם `.eq('company_id', companyId)` |
| ללא `company_id` ב-insert | `company_id: companyId` ב-insert |

### `/api/documents` (DELETE)
| לפני | אחרי |
|------|------|
| delete by `doc_id` only | verify `company_id` before delete |

**סיכון שנסגר:** User B יכול היה למחוק מסמך של User A ע"י ניחוש ה-UUID.

---

## 5. ביקורת Upload + Signed URL

### `/api/upload` (POST)
| לפני | אחרי |
|------|------|
| `requireAdmin()` | `requireCompanyAdmin()` |
| Path: `{folder}/{ts}-{hex}.{ext}` | ללא שינוי (flat — Phase 2 Batch 2 יוסיף company prefix) |

**הערה:** Storage paths עדיין flat. צריך company-prefix ב-Batch 2. כרגע אחסון לא מבודד ב-path, אבל הגישה מבודדת דרך signed-url ownership check.

### `/api/signed-url` (GET)
| לפני | אחרי |
|------|------|
| יוצר signed URL לכל path מאומת | מאמת ownership לפני יצירת URL |

**סיכון שנסגר (קריטי):** User B יכול היה לקבל signed URL לכל קובץ של כל User A ע"י ידיעת ה-path.

**מנגנון הגנה החדש:** `verifyPathOwnership()` בודק:
- `workers.photo_url` עם `company_id`
- `documents.file_url` עם `company_id`
- `safety_briefings.file_url / signature_url` עם `worker_id IN (company workers)`
- `height_restrictions.file_url / signature_url` עם `worker_id IN (company workers)`

---

## 6. ביקורת Safety Briefings + Height Restrictions

### `/api/safety-briefings`
| לפני | אחרי |
|------|------|
| `requireAdmin()` | `requireCompanyAdmin()` |
| ללא company check | מאמת worker שייך לחברה (POST) |
| ללא company check on delete | מאמת worker שייך לחברה (DELETE) |

### `/api/height-restrictions`
| לפני | אחרי |
|------|------|
| `requireAdmin()` | `requireCompanyAdmin()` |
| ללא company check | מאמת worker שייך לחברה (POST + DELETE) |

---

## 7. ביקורת Alerts + Reports + Export

### `/api/alerts` (GET)
| לפני | אחרי |
|------|------|
| כל workers ללא filter | workers עם `.eq('company_id', companyId)` |

### `/api/reports/weekly-status` (POST — manual)
| לפני | אחרי |
|------|------|
| `requireAdmin()` | `requireCompanyAdmin()` |
| `fetchAllData()` — כל workers | `fetchCompanyData(companyId)` |

### `/api/reports/weekly-status` (GET — cron)
| לפני | אחרי |
|------|------|
| כל workers בדוח אחד | לכל company בנפרד, workers מסוננים |

### `/api/admin/export` (GET)
| לפני | אחרי |
|------|------|
| `exportAllTables()` — הכל | `exportAllTables(companyId)` — workers/docs מסוננים |

---

## 8. ביקורת Server Components

### `app/dashboard/page.tsx`
| לפני | אחרי |
|------|------|
| `getSession()` — רק לצורכי role | `getCurrentCompanyContext()` — redirect אם אין |
| workers/docs ללא filter | `.eq('company_id', companyId)` |

### `app/issues/page.tsx`
| לפני | אחרי |
|------|------|
| **ללא auth check** (רק middleware) | `getCurrentCompanyContext()` — redirect |
| workers ללא filter | `.eq('company_id', companyId)` |

### `app/archive/page.tsx`
| לפני | אחרי |
|------|------|
| `requireAuth()` | `getCurrentCompanyContext()` — redirect |
| workers ללא filter | `.eq('company_id', companyId)` |

---

## 9. מגבלות ידועות של Batch 1 (Batch 2 יטפל בהן)

| ישות | מצב |
|------|-----|
| vehicles | ללא company_id — לא מסוננים |
| heavy_equipment | ללא company_id — לא מסוננים |
| lifting_equipment | ללא company_id — לא מסוננים |
| subcontractors | ללא company_id — לא מסוננים |
| professional_licenses | ללא company_id — מאובטח רק דרך workers |
| manager_licenses | ללא company_id — מאובטח רק דרך workers |
| lifting_machine_appointments | ללא company_id — מאובטח רק דרך workers |
| Storage paths | Flat — ללא company prefix |
| Weekly report vehicles section | כל הרכבים (לא company-scoped) |
| Export vehicles section | כל הרכבים (לא company-scoped) |

---

## 10. לא בוצע שינוי

| נושא | הסבר |
|------|-------|
| vehicles/equipment/subcontractors | מחוץ לטווח Batch 1 במפורש |
| APP_URL, customer.ts, operator.ts | לא נדרש שינוי |
| middleware | לא נדרש שינוי |
| login/logout | לא נדרש שינוי |
| profiles | לא נדרש שינוי |
