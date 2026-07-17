# מלאי נתונים — SafeDoc
> **מסמך עבודה פנימי** | נוצר: 2026-07-15 | לא להפצה חיצונית
> **מצב:** טיוטה ראשונית — יש לאמת מול מציאות ה-DB לפני כל פעולה משפטית.

---

## 1. סקירה כללית

SafeDoc הוא מערכת SaaS לניהול מסמכי בטיחות בסביבות בנייה.
המערכת מאחסנת מידע אישי רגיש של עובדים (כולל מספרי זהות ודרכונים), מסמכים משפטיים, תמונות, וחתימות דיגיטליות.

- **פלטפורמה:** Vercel (Next.js 16.2.2) + Supabase (PostgreSQL + Storage)
- **מיקום נתונים:** Supabase — אזור ברירת מחדל (לאמת: `app.supabase.com → Settings → Infrastructure`)
- **גישה למערכת:** טלפונים מורשים בלבד; session עם HMAC-SHA256; 7 ימים

---

## 2. קטגוריות נתונים

### 2.1 משתמשי המערכת (System Users)

| שדה | טבלה | רגישות | הערה |
|------|-------|---------|-------|
| מספר טלפון (E.164) | `authorized_phones.phone` | גבוהה | גישה למערכת; לא מוצג בממשק |
| מזהה Supabase Auth | `auth.users.id` | גבוהה | UUID פנימי; לא חשוף לקצה |
| אימייל (internal) | `auth.users.email` | גבוהה | יכול להיות כתובת `@safedoc.local` פיקטיבית |
| שם מלא | `profiles.full_name` | בינונית | שם המנהל/מנהלת |
| שם משתמש | `profiles.username` | בינונית | lowercase, ייחודי |
| אימייל דוחות | `profiles.report_email` | גבוהה | אימייל אמיתי לשליחת דוחות שבועיים |
| תפקיד | `profiles.role` | בינונית | `admin` / `user` |
| כותרת תפקיד | `profiles.job_title` | נמוכה | אופציונלי |
| סטטוס פעיל | `profiles.is_active` | בינונית | שליטה בגישה |
| תאריכי יצירה/עדכון | `profiles.created_at`, `updated_at` | נמוכה | מטא-דאטה |

**רמת רגישות כוללת:** גבוהה — מכיל מידע זיהוי + מנגנון גישה
**בסיס עיבוד (GDPR/חוק הגנת פרטיות):** הסכמה + אינטרס לגיטימי (ניהול הרשאות)
**תקופת שמירה:** משך שירות הלקוח + 1 שנה לאחר סיום
**מי יש לו גישה:** service_role בלבד (API); admin לצפייה ברשימה

---

### 2.2 עובדים — פרטים אישיים (Worker PII)

| שדה | טבלה/עמודה | רגישות | הערה |
|------|------------|---------|-------|
| שם מלא | `workers.full_name` | גבוהה | מידע אישי ישיר |
| תעודת זהות ישראלית | `workers.national_id` | **גבוהה מאוד** | 9 ספרות; מזהה ייחודי חוקי |
| מספר דרכון | `workers.passport_number` | **גבוהה מאוד** | זרים בלבד; מסמך נסיעה |
| id_number (legacy) | `workers.id_number` | **גבוהה מאוד** | שמור לתאימות PDF; NULL בשורות חדשות |
| טלפון | `workers.phone` | גבוהה | אופציונלי |
| שם האב | `workers.father_name` | גבוהה | נדרש למינוי מפעיל |
| שנת לידה | `workers.birth_year` | גבוהה | |
| מקצוע | `workers.profession` | בינונית | |
| כתובת | `workers.address` | גבוהה | |
| הערות | `workers.notes` | גבוהה | תוכן חופשי — עשוי לכלול מידע רפואי |
| סוג עובד | `workers.is_foreign_worker` | בינונית | ישראלי/זר |
| פרויקט | `workers.project_name` | נמוכה | |
| קבלן משנה | `workers.subcontractor_id` | נמוכה | FK |
| מנהל עבודה אחראי | `workers.responsible_manager_id` | נמוכה | FK |
| מפעיל עגורן | `workers.is_crane_operator` | נמוכה | |
| מנהל עבודה | `workers.is_responsible_site_manager` | נמוכה | |
| סטטוס פעיל/ארכיון | `workers.is_active`, `is_archived`, `archived_at`, `archived_by` | נמוכה | |
| תמונת פרופיל | `workers.photo_url` → Storage `worker-files/` | **גבוהה מאוד** | ביומטריה; כפופה לחוקי צילום מיוחדים |
| תאריכי יצירה/עדכון | `workers.created_at`, `updated_at` | נמוכה | |

**רמת רגישות כוללת:** גבוהה מאוד — כולל ביומטריה, מספרי זהות, ופרטים אישיים
**בסיס עיבוד:** חובה חוקית (תקנות בטיחות בעבודה) + הסכמת העובד
**תקופת שמירה:** ⚠️ לא נקבעה — יש לקבוע עם עורך דין (מומלץ: 7 שנים לאחר סיום העסקה)
**מי יש לו גישה:** כל משתמש מורשה במערכת (admin + user)
**סיכון:** העדר הסכמה מפורשת של עובדים לאיסוף מידע; חשיפה בדוחות Excel/PDF

---

### 2.3 מסמכי עובדים (Worker Documents)

| שדה | טבלה/עמודה | רגישות | הערה |
|------|------------|---------|-------|
| סוג מסמך | `documents.doc_type` | בינונית | `id_document`, `height_permit`, `work_visa`, `optional_license` |
| קובץ מסמך | `documents.file_url` → Storage | **גבוהה מאוד** | עשוי לכלול מספר ת"ז/דרכון על גבי הסריקה |
| תאריך תפוגה | `documents.expiry_date` | בינונית | |
| שם רישיון | `documents.license_name` | בינונית | עבור `optional_license` |
| חובת הצגה | `documents.is_required` | נמוכה | |
| תאריך העלאה | `documents.uploaded_at` | נמוכה | |

**רמת רגישות כוללת:** גבוהה מאוד — קבצי מסמכי זהות
**בסיס עיבוד:** חובה חוקית + אינטרס לגיטימי (ציות לדרישות בטיחות)
**תקופת שמירה:** ⚠️ לא נקבעה — יש לקבוע עם עורך דין
**סיכון:** מסמכי זהות מקוריים בענן — יש לוודא הצפנה at-rest ב-Supabase Storage

---

### 2.4 תדריכי בטיחות (Safety Briefings)

| שדה | טבלה/עמודה | רגישות | הערה |
|------|------------|---------|-------|
| עובד | `safety_briefings.worker_id` | גבוהה | FK לעובד |
| שפה | `safety_briefings.language` | נמוכה | עשוי לחשוף מוצא |
| מתדרך | `safety_briefings.conducted_by` | בינונית | שם טקסט חופשי |
| קובץ חתימה | `safety_briefings.signature_url` → Storage | **גבוהה מאוד** | ביומטריה התנהגותית |
| קובץ תדריך | `safety_briefings.file_url` → Storage | גבוהה | |
| תאריכים | `briefed_at`, `expires_at`, `created_at` | נמוכה | |

**רמת רגישות כוללת:** גבוהה — חתימות דיגיטליות הן מידע ביומטרי
**תקופת שמירה:** ⚠️ לא נקבעה — פקודת הבטיחות בעבודה מחייבת שמירה (לאמת עם עורך דין)

---

### 2.5 מינויי מפעיל מכונת הרמה (Lifting Machine Appointments)

| שדה | טבלה/עמודה | רגישות | הערה |
|------|------------|---------|-------|
| עובד-מפעיל | `lifting_machine_appointments.worker_id` | גבוהה | FK |
| שם ממנה | `.appointer_name` | בינונית | |
| טלפון ממנה | `.appointer_phone` | גבוהה | |
| כתובת ממנה | `.appointer_address`, `.appointer_zip` | בינונית | |
| חתימת מפעיל | `.operator_signature_url` → Storage | **גבוהה מאוד** | ביומטריה |
| חתימת ממנה | `.appointer_signature_url` → Storage | **גבוהה מאוד** | ביומטריה |
| PDF | `.pdf_url` → Storage | גבוהה | מסמך ממשלתי-משפטי |

**רמת רגישות כוללת:** גבוהה מאוד — מסמך משפטי + ביומטריה
**תקופת שמירה:** ⚠️ נדרשת בחוק — ממשרד העבודה (לאמת)

---

### 2.6 הגבלות עבודה בגובה (Height Restrictions)

| שדה | טבלה/עמודה | רגישות | הערה |
|------|------------|---------|-------|
| עובד | `height_restrictions.worker_id` | גבוהה | FK |
| שפה | `.language` | נמוכה | |
| מנפיק | `.conducted_by` | בינונית | |
| חתימה | `.signature_url` → Storage | **גבוהה מאוד** | ביומטריה |
| קובץ | `.file_url` → Storage | גבוהה | |
| תאריכים | `issued_at`, `expires_at`, `created_at` | נמוכה | |

**רמת רגישות כוללת:** גבוהה — עשוי לחשוף מצב בריאותי

---

### 2.7 כלי צמ"ה (Heavy Equipment)

| שדה | טבלה/עמודה | רגישות | הערה |
|------|------------|---------|-------|
| תיאור | `heavy_equipment.description` | נמוכה | |
| מספר רישיון | `.license_number` | נמוכה | מספר ציוד ציבורי |
| תמונה | `.image_url` → Storage | נמוכה | תמונת ציוד |
| מסמכי ציוד | `*_file_url` → Storage | נמוכה | רישיון/ביטוח/בדיקה |
| מפיק | `.manufacturer` | נמוכה | |
| מזהה מכונה | `.machine_identifier` | נמוכה | |
| ביטוחים | `heavy_equipment_insurances.*` | נמוכה | |
| קבלן משנה | `.subcontractor_id` | נמוכה | FK |

**רמת רגישות כוללת:** נמוכה — מידע עסקי, לא PII

---

### 2.8 ציוד הרמה (Lifting Equipment)

| שדה | טבלה/עמודה | רגישות | הערה |
|------|------------|---------|-------|
| תיאור | `lifting_equipment.description` | נמוכה | |
| תמונה, מסמכי בדיקה | `image_url`, `inspection_file_url` → Storage | נמוכה | |

**רמת רגישות כוללת:** נמוכה

---

### 2.9 רכבים (Vehicles)

| שדה | טבלה/עמודה | רגישות | הערה |
|------|------------|---------|-------|
| מספר רכב | `vehicles.vehicle_number` | בינונית | לוחית רישוי — ניתן לאיתור |
| דגם, צבע, סוג | `vehicles.*` | נמוכה | |
| מנהל משויך | `vehicles.assigned_manager_id` | בינונית | FK לעובד |
| תמונה, רישיון, ביטוח | `*_file_url` → Storage | נמוכה-בינונית | |

**רמת רגישות כוללת:** בינונית — מספר לוחית כפוף להגנה מסויימת

---

### 2.10 קבלני משנה (Subcontractors)

| שדה | טבלה/עמודה | רגישות | הערה |
|------|------------|---------|-------|
| שם חברה | `subcontractors.name` | בינונית | |
| איש קשר | `.contact_name` | בינונית | |
| טלפון | `.phone` | גבוהה | |
| הערות | `.notes` | גבוהה | תוכן חופשי |
| עובד אחראי | `.responsible_worker_id` | בינונית | FK |

**רמת רגישות כוללת:** בינונית

---

### 2.11 הערות ישויות (Entity Notes)

| שדה | טבלה/עמודה | רגישות | הערה |
|------|------------|---------|-------|
| תוכן | `entity_notes.content` | **גבוהה** | תוכן חופשי — עשוי לכלול מידע רגיש כלשהו |
| יוצר | `.created_by` | בינונית | שם טקסט חופשי |
| ישות קשורה | `entity_type`, `entity_id` | בינונית | |

**סיכון:** שדה `created_by` הוא טקסט חופשי, לא FK — לא ניתן לקשר אוטומטית לפרופיל

---

### 2.12 טלפונים מורשים (Authorized Phones)

| שדה | טבלה | רגישות | הערה |
|------|-------|---------|-------|
| טלפון (E.164) | `authorized_phones.phone` | **גבוהה מאוד** | מנגנון שליטת גישה |
| תאריך יצירה | `authorized_phones.created_at` | נמוכה | |

**סיכון:** אין audit trail של מי הוסיף/הסיר טלפון; אין is_active — למחוק = סיום גישה לצמיתות

---

## 3. מאגר האחסון (Storage Bucket)

**שם bucket:** `worker-files` | **סוג:** Private (signed URLs בלבד)

| תיקיית תוכן | דוגמת נתיב | סוג קבצים | רגישות |
|------------|-----------|-----------|---------|
| `documents/` | `documents/1720000000-abc123.pdf` | PDF, JPG, PNG | גבוהה מאוד |
| `photos/` | `photos/...` | JPG, PNG, WebP | גבוהה מאוד (ביומטריה) |
| `briefings/` | `briefings/...` | PDF, JPG | גבוהה |
| `signatures/` | `signatures/...` | PNG | גבוהה מאוד (ביומטריה) |
| `appointments/` | `appointments/...` | PDF | גבוהה |
| `heavy-equipment/` | `heavy-equipment/...` | JPG, PDF | נמוכה |
| `lifting-equipment/` | `lifting-equipment/...` | JPG, PDF | נמוכה |
| `vehicles/` | `vehicles/...` | JPG, PDF | נמוכה |

**הערה:** קבצים נשמרים עם שם `{תיקייה}/{timestamp}-{random}.{ext}` — ללא שם מקורי.
ה-bucket לא מסורגל לפי לקוח (single-tenant כרגע).

---

## 4. נתוני מייל (Email Processing)

| נתון | שירות | רגישות | הערה |
|------|--------|---------|-------|
| אימייל נמענים | Resend API | גבוהה | `profiles.report_email` |
| תוכן דוח שבועי | Resend API | גבוהה | עשוי לכלול שמות עובדים + סטטוס מסמכים |
| HTML דוח | Resend (logging) | גבוהה | יש לוודא data retention policy אצל Resend |

**סיכון:** Resend הוא sub-processor; יש לוודא DPA עם Resend.

---

## 5. נתוני Vercel (Deployment & Logs)

| נתון | שירות | רגישות | הערה |
|------|--------|---------|-------|
| Vercel Logs | Vercel | גבוהה | עשוי לכלול URL params עם מידע רגיש |
| ENV Variables | Vercel | גבוהה מאוד | SESSION_SECRET, SUPABASE_SERVICE_KEY, RESEND_API_KEY |
| IP addresses | Vercel Edge | בינונית | לוגים אוטומטיים |

**סיכון:** Vercel Logs ברירת מחדל — יש לבדוק אם מסנן sensitive params.

---

## 6. מפת גישה לנתונים

| רכיב | גישה ל | שיטת גישה | הערה |
|------|--------|-----------|-------|
| Middleware | session token | cookie HMAC verify | Edge runtime |
| API Routes (server) | כל DB | `createServiceClient` (service_role key) | עוקף RLS |
| UI (client) | לא ישיר ל-DB | fetch → API routes | |
| Cron (`/api/reports/weekly-status`) | profiles + workers + docs | service_role | CRON_SECRET בלבד |
| Admin Panel (`/admin/*`) | profiles, audit logs (עתידי) | role=admin + middleware | |

---

## 7. RLS — מצב נוכחי (ממצאי ראשוניים)

⚠️ **כל ה-API routes משתמשים ב-`service_role` key — RLS עוקף לחלוטין.**
הגנת גישה מתבצעת ברמת ה-middleware + `requireAuth()` / `requireAdmin()`.

| טבלה | RLS מופעל | Policy | הערה |
|------|----------|--------|-------|
| `authorized_phones` | ✓ | SELECT to authenticated | |
| `workers` | ✓ | ALL to authenticated | |
| `documents` | ✓ | ALL to authenticated | |
| `profiles` | ✓ | SELECT own only | הגנה חלקית |
| `subcontractors` | ✓ | CRUD to authenticated | |
| `entity_notes` | ✓ | ALL to authenticated | |
| `safety_briefings` | ✓ | SELECT authenticated + service_role all | |
| `height_restrictions` | ✓ | ALL to authenticated | |
| `heavy_equipment` | ✓ | ALL to authenticated | |
| `lifting_equipment` | ✓ | ALL to authenticated | |
| `lifting_machine_appointments` | ✓ | ALL to authenticated | |
| `vehicles` | ✓ | לא ידוע — לאמת | |
| `vehicle_licenses` | ✗? | לא ידוע — לאמת | |
| `vehicle_insurances` | ✗? | לא ידוע — לאמת | |
| `heavy_equipment_insurances` | ✗? | לא ידוע — לאמת | |

> כיוון שה-API routes עובדים עם service_role, RLS policies הנוכחיות הן "security in depth" בלבד ולא קו ההגנה הראשי.

---

## 8. סיכוני פרטיות עיקריים

| # | סיכון | חומרה | המלצה |
|---|-------|--------|--------|
| 1 | אין הסכמה מפורשת של עובדים לאיסוף מידע | גבוהה | הודעת פרטיות + הסכמה (ראה שלב ד') |
| 2 | תמונות עובדים = ביומטריה; חוק פרטיות מחמיר | גבוהה | ייעוץ משפטי; בסיס עיבוד מפורש |
| 3 | חתימות דיגיטליות = ביומטריה התנהגותית | גבוהה | כנ"ל |
| 4 | שדה `notes` חופשי — עלול לכלול מידע רפואי | גבוהה | אין ולידציה; מומלץ: הנחיות שימוש |
| 5 | `entity_notes.created_by` — טקסט חופשי ללא FK | בינונית | לשקול להמיר ל-FK בעתיד |
| 6 | Resend API כ-sub-processor ללא DPA מתועד | גבוהה | לחתום DPA עם Resend |
| 7 | Vercel logs עלולים לכלול מידע רגיש (URL params) | בינונית | לבדוק Vercel data settings |
| 8 | אין תקופות שמירה מוגדרות | גבוהה | לקבוע עם עורך דין |
| 9 | כל המשתמשים המורשים רואים את כל הנתונים | בינונית | Single-tenant MVP — מקובל בשלב זה |
| 10 | `authorized_phones` — אין audit של שינויים | בינונית | יוטפל בשלב ו' (audit_logs) |
| 11 | ה-bucket לא מסורגל לפי לקוח | בינונית | Multi-tenant: יש לתכנן ב-Session 2 |
| 12 | Legacy column `id_number` עלול לכלול ת"ז/דרכון | בינונית | לוודא NULL בשורות חדשות |

---

## 9. Sub-Processors

| שירות | מטרה | מיקום | DPA | הערה |
|--------|------|--------|-----|-------|
| Supabase | DB + Storage + Auth | AWS (ברירת מחדל: us-east-1) | ⚠️ לאמת | יש לוודא אזור ולחתום DPA |
| Vercel | Hosting + Edge | Global | ⚠️ לאמת | |
| Resend | Email (דוחות) | US | ❌ אין תיעוד | נדרש DPA |

---

## 10. פעולות נדרשות לפני Production

- [ ] ייעוץ עורך דין ישראלי — בסיסי עיבוד, תקופות שמירה, הסכמת עובדים
- [ ] DPA עם Supabase, Vercel, Resend
- [ ] אימות מיקום נתונים (אזור Supabase)
- [ ] קביעת מדיניות retention + מחיקה אוטומטית
- [ ] הוספת audit trail (שלב ו')
- [ ] יצירת הודעת פרטיות לעובדים (שלב ב')
- [ ] סקירת RLS מלאה (שלב ח')

---

*מסמך זה נוצר על בסיס קריאת קוד ומיגרציות. לא בוצע audit ישיר על ה-DB החי. יש לאמת מול Supabase Table Editor.*
