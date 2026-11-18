# מטריצת הרשאות DB — SafeDoc
> עודכן: 2026-11-18 | גרסה: 2.0 | סיווג: פנימי | מקור: שאילתה חיה על `rwpahefpexizaicrrxoc` (pg_class, pg_policies, has_table_privilege)
> גרסה 1.0 (2026-07-18) תיארה את המצב שלפני ריבוי חברות — הוחלפה.

## 1. עקרון

1. **כל הגישה לנתונים — מהשרת בלבד, כ-`service_role`** (`createServiceClient()`), שעוקף RLS. ההרשאה העסקית נאכפת בקוד: `getCurrentCompanyContext()` / `requireCompanyAdminRole()` + סינון `company_id`.
2. **ל-`anon` ול-`authenticated` אין אף הרשאה** על טבלאות, sequences או פונקציות ב-`public` (בוטל 2026-11-18), וברירת המחדל לאובייקטים חדשים שנוצרים ע"י `postgres` סגורה.
3. **RLS פעיל על כל הטבלאות** — שכבה שנייה. מדיניות ה-SELECT ל-`authenticated` שנשארו (לפי חברה / own) אינן בשימוש ואינן נגישות כל עוד אין GRANT; אם תוחזר הרשאה בטעות, הן מגבילות לחברה של המשתמש.
4. **בדיקה יומית** — `safedoc_health_check()` (דרך `/api/maintenance/daily`) נכשלת ושולחת מייל אם טבלה בלי RLS, הרשאה ללקוח, פונקציה שהלקוח יכול להריץ, מדיניות `USING (true)`, ברירת מחדל פתוחה, bucket ציבורי או מדיניות על `storage.objects`.

## 2. טבלאות (30, כולן RLS פעיל, לאף אחת אין SELECT ל-anon/authenticated)

| טבלה | מדיניות (מי) | הערה |
|---|---|---|
| workers, documents, subcontractors, vehicles, vehicle_licenses, vehicle_insurances, heavy_equipment, heavy_equipment_insurances, lifting_equipment, lifting_machine_appointments, entity_notes | `*_select_company` (authenticated, לפי חברה) + `*_service_all` (service_role) | הרשאת הלקוח בוטלה; המדיניות שכבה רדומה |
| safety_briefings, height_restrictions, professional_licenses, manager_licenses | `*_worker_select` (authenticated, דרך העובד) + `*_service_all` | כנ"ל |
| companies | `companies_select_member` + `companies_service_all` | כנ"ל |
| company_members | `company_members_select_own` + `company_members_service_all` | כנ"ל |
| profiles | `profiles_select_own` | כנ"ל |
| legal_acceptances | `legal_acceptances_select_own` + `legal_acceptances_service_insert` | כנ"ל |
| audit_logs | `audit_logs_service_insert` (service_role) | |
| manager_user_mappings, review_reminder_log, worker_review_assignments, worker_transfer_audit, worker_weekly_reviews | service_role בלבד | |
| rate_limit_events | `rate_limit_service_role_only` | IP גולמי, נמחק אחרי 24 שעות (cron יומי) |
| site_feedback, manager_insurances, legal_acceptances_dedup_backup, authorized_phones | — (אין מדיניות) | ננעלו 2026-11-18 אחרי שהיו נגישות ללקוח |

## 3. פונקציות ב-`public`

| פונקציה | מי מריץ |
|---|---|
| `rate_limit_check(...)`, `rate_limit_cleanup(int)` | service_role בלבד |
| `safedoc_health_check()` | service_role בלבד |
| 9 פונקציות trigger (`update_updated_at`, `enforce_*`, `normalize_username`, `update_wwr_updated_at`) | לא ניתנות לקריאה ישירה; `search_path` קבוע |

## 4. Storage
- bucket `worker-files` פרטי; אין מדיניות על `storage.objects` → אין גישה ללקוח.
- כל קובץ נפתח דרך `/api/signed-url` (קישור לשעה) אחרי `authorizeStorageObjectAccess` — הקובץ חייב להיות מוצמד לרשומה של החברה הפעילה (ישירות לפי `company_id`, או דרך העובד ב-inner join).

## 5. Auth
- anon/publishable key — רק ל-`signInWithPassword` בשרת. האפליקציה משתמשת במפתחות החדשים (`sb_publishable_…`, `sb_secret_…`); מפתחות ה-JWT הישנים לא בשימוש (אומת בלוגים 2026-11-18) — מומלץ להשבית אותם בלוח של Supabase.

## 6. שינוי עתידי — כללים
- טבלה חדשה: `ENABLE ROW LEVEL SECURITY`, בלי GRANT ל-anon/authenticated (ברירת המחדל כבר סגורה), ולהוסיף אותה לרשימת `required tables` ב-health check אם הקוד תלוי בה.
- פונקציה חדשה: `SET search_path = public, pg_temp`; `REVOKE ... FROM PUBLIC, anon, authenticated` מפורש; `GRANT EXECUTE ... TO service_role`.
- כל שינוי הרשאות בסביבה החיה: בדיקה מקדימה → הרצת ניסיון (ROLLBACK) → COMMIT → `SELECT * FROM safedoc_health_check()` → קובץ rollback ב-`supabase/proposed/<תאריך>-<נושא>/`.
