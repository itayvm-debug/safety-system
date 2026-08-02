# SafeDoc — Phase 2 Final Hardening

**תאריך:** 2026-08-02  
**גרסה:** 1.0  
**סטטוס:** הושלם — ממתין לאישור

---

## סקירה כללית

בתום ביצוע 6 batches של מיגרציית multi-tenant (Phase 2), בוצע Audit מלא של 47 נתיבי API ו-22 טבלאות DB. האודיט זיהה 8 ממצאים (F-01 עד F-08). מסמך זה מתאר את כל הממצאים, החלטות האדריכלות, והתיקונים שבוצעו.

---

## F-01 — Critical: נתיב AI יוצר Signed URL ללא הרשאת Storage

| שדה | ערך |
|-----|-----|
| **חומרה** | Critical |
| **קובץ** | `app/api/ai/extract-worker-identity/route.ts` |
| **סטטוס** | תוקן |

### הבעיה
הנתיב השתמש ב-`requireAdmin()` (בדיקת פלטפורמה בלבד) ויצר Signed URL ישירות מהנתיב שהתקבל מה-Browser — ללא קריאה ל-`authorizeStorageObjectAccess()`. כל Admin של פלטפורמה יכל לבקש קובץ של חברה אחרת על-ידי שינוי ה-path בבקשה.

### התיקון
1. `requireAdmin()` הוחלף ב-`requireCompanyAdmin()` — שולף `companyId` מ-Session מאומת, לא מה-Browser
2. נוסף `normalizeStoragePath()` לפני כל שימוש ב-path (דחיית traversal, double-encoding, תווי-בקרה)
3. נוסף `authorizeStorageObjectAccess({ companyId, path, supabase })` לפני יצירת ה-Signed URL
4. על דחייה — מוחזר `404 file_not_found` גנרי (לא `403` — כדי שלא לחשוף שקובץ של tenant אחר קיים)
5. סיבת הדחייה נרשמת ל-log פנימי בלבד (לא נחשפת ללקוח)

### בדיקות
`app/api/ai/__tests__/extract-worker-identity.isolation.test.ts` — 6 תרחישים:
- Auth failure → 404 ללא גישה ל-Storage
- Traversal path → 404 ללא קריאה ל-`authorizeStorageObjectAccess`
- Cross-tenant denial → 404, `createSignedUrl` לא נקרא
- Company B לא יכול לגשת לקובץ Company A
- `authorizeStorageObjectAccess` נקרא עם `companyId` מה-Session (לא מה-Body)
- `createSignedUrl` נקרא רק אחרי שהרשאה עברה

---

## F-02 — High: vehicle-licenses / vehicle-insurances TOCTOU gap

| שדה | ערך |
|-----|-----|
| **חומרה** | High |
| **קבצים** | `app/api/vehicle-licenses/[id]/route.ts`, `app/api/vehicle-insurances/[id]/route.ts` |
| **סטטוס** | תוקן |

### הבעיה
ה-Pre-check כלל `.eq('company_id', companyId)` — אבל ה-Mutation עצמו (PATCH update, DELETE delete) כלל רק `.eq('id', id)`. ה-Service Client עוקף RLS, כך שבחלון TOCTOU תיאורטי יכול שינוי ב-company_id של הרשומה (בין ה-pre-check למוטציה) לאפשר כתיבה חוצת-tenant.

### התיקון
נוסף `.eq('company_id', companyId)` גם לשרשרת ה-update וגם לשרשרת ה-delete בשני הנתיבים.

### בדיקות
- `app/api/vehicle-licenses/__tests__/route.isolation.test.ts`
- `app/api/vehicle-insurances/__tests__/route.isolation.test.ts`
כל אחד: 4 בדיקות — cross-tenant PATCH/DELETE → 404, own-company PATCH/DELETE → 200 + אימות שיש 2+ קריאות `company_id` ב-eq()

---

## F-03 — High: professional-licenses / manager-licenses TOCTOU gap

| שדה | ערך |
|-----|-----|
| **חומרה** | High |
| **קבצים** | `app/api/professional-licenses/[id]/route.ts`, `app/api/manager-licenses/[id]/route.ts` |
| **סטטוס** | תוקן |

### הבעיה
ה-Pre-check אימת שהרישיון שייך ל-worker ושה-worker שייך ל-company הנכונה (שרשרת 2-hop נכונה). אבל המוטציה עצמה כללה רק `.eq('id', id)` ללא `.eq('worker_id', license.worker_id)`.

### התיקון
נוסף `.eq('worker_id', license.worker_id)` גם לשרשרת ה-update וגם לשרשרת ה-delete. `license.worker_id` נמצא בסקופ מה-Pre-check.

### בדיקות
- `app/api/professional-licenses/__tests__/route.isolation.test.ts`
- `app/api/manager-licenses/__tests__/route.isolation.test.ts`
כל אחד: 4 בדיקות — worker מחברה אחרת → 404, worker מחברה נכונה → 200 + אימות שיש קריאת `worker_id` ב-eq()

---

## F-04 — High: Export שולח טבלאות גלובליות ללא סינון

| שדה | ערך |
|-----|-----|
| **חומרה** | High |
| **קובץ** | `lib/export/exportTables.ts` |
| **סטטוס** | תוקן |

### הבעיה
ה-`GLOBAL_TABLES` כלל שלוש טבלאות שיצאו ללא סינון לפי חברה:
- `authorized_phones` — טבלת פלטפורמה (כל מספרי הטלפון המורשים בכל המערכת)
- `profiles` — פרופילים של כל המשתמשים
- `legal_acceptances` — אישורי תנאים של כל המשתמשים

### החלטות

| טבלה | החלטה | נימוק |
|------|--------|-------|
| `authorized_phones` | **הוצאה מה-Export לחלוטין** | טבלת פלטפורמה; רשימת כל מספרי הטלפון המורשים אינה שייכת ל-Export של חברה |
| `profiles` | **סינון לפי `company_members`** | הוחלפה ב-`.in('id', memberUserIds)` לפי חברי החברה |
| `legal_acceptances` | **סינון לפי `company_members`** | הוחלפה ב-`.in('user_id', memberUserIds)` לפי חברי החברה |

### התיקון
- `GLOBAL_TABLES` הוחלף ב-`MEMBER_SCOPED_TABLES`
- נוספת שליפת `company_members` לקבלת `memberUserIds`
- `profiles` ו-`legal_acceptances` נשלפות עם `.in()` לפי ה-memberUserIds
- כשאין חברים — מוחזרים ריקים (ללא שליפה מ-DB)

### בדיקות
`lib/export/__tests__/exportTables.isolation.test.ts` — 4 תרחישים:
- `authorized_phones` לא נשלפת ולא מופיעה בתוצאות
- `profiles` נשלפת עם `.in('id', memberUserIds)` (לא כולל non-members)
- `legal_acceptances` נשלפת עם `.in('user_id', memberUserIds)`
- כשאין חברים — profiles ו-legal_acceptances מוחזרות ריקות ללא שליפה מ-DB

---

## F-05 — audit_logs: החלטת בעלות

| שדה | ערך |
|-----|-----|
| **חומרה** | Informational |
| **קובץ** | אין שינוי קוד |
| **סטטוס** | הוחלט — PLATFORM AUDIT |

### החלטה
`audit_logs` היא טבלת פלטפורמה. היא נכתבת לאירועים חוצי-חברות (כולל כניסות כושלות לפני שיש הקשר חברה). כבר מוגבלת ל-`requireAdmin()`. לא נמצאת ב-Export. אין צורך בשינוי קוד.

---

## F-06 — High: יצירת משתמש ללא שורת company_members

| שדה | ערך |
|-----|-----|
| **חומרה** | High |
| **קובץ** | `app/api/admin/users/route.ts` |
| **סטטוס** | תוקן |

### הבעיה
ה-POST `/api/admin/users` יצר Auth User ו-Profile אבל לא הכניס שורה ל-`company_members`. משתמשים שנוצרו לא היו שייכים לשום חברה, מה שמשבש את כל ה-multi-tenant middleware.

### התיקון
1. נוסף `company_id` לגוף הבקשה (שדה חובה)
2. **אימות server-side**: `.from('companies').select('id').eq('id', company_id).eq('is_active', true).maybeSingle()` — לא מסתמכים על ה-company_id מה-Browser
3. לאחר יצירת ה-Profile — מוכנסת שורת `company_members`:
   - `company_id`: ה-ID שאומת
   - `user_id`: ID של המשתמש החדש
   - `role`: `'admin'` אם `role === 'admin'`, אחרת `'member'`
   - `is_active: true`
4. **Compensating cleanup**: אם הכנסת `company_members` נכשלת — נמחקים ה-Profile וה-Auth User

### בדיקות
`app/api/admin/__tests__/users.isolation.test.ts` — 5 בדיקות:
- חסר `company_id` → 400
- `company_id` לא קיים ב-DB → 400
- יצירה תקינה → 201 + שורת `company_members` נוצרת
- `role=admin` ממופה ל-`company_members.role='admin'`
- `role=user` ממופה ל-`company_members.role='member'`
- כשל ב-membership → Auth User + Profile נמחקים (cleanup)

---

## F-07 — site_feedback: החלטת בעלות

| שדה | ערך |
|-----|-----|
| **חומרה** | Informational |
| **קובץ** | אין שינוי קוד |
| **סטטוס** | הוחלט — PLATFORM FEEDBACK |

### החלטה
`site_feedback` היא משוב על המוצר עצמו, לא על נתוני חברה. קריאות כבר מוגבלות ל-Admin של פלטפורמה. לא נמצאת ב-Export. הוספת `company_id` דורשת SQL על Production. אין צורך בשינוי קוד.

---

## F-08 — worker identity isolation: סטטוס מיגרציית Production

| שדה | ערך |
|-----|-----|
| **חומרה** | Medium |
| **קובץ** | `supabase/verify_worker_identity_isolation.sql` (חדש) |
| **סטטוס** | Read-only SQL נוצר |

### הבעיה
לא ידוע אם מיגרציית בידוד זהות העובדים (unique indexes על national_id, passport_number) הורצה ב-Production.

### הפתרון
נוצר `supabase/verify_worker_identity_isolation.sql` — שאילתת קריאה בלבד שמחזירה שורה אחת עם:
- `migration_state`: `'APPLIED' | 'NOT APPLIED' | 'PARTIAL' | 'BLOCKED'`
- בדיקת נוכחות indexes (`workers_national_id_unique`, `workers_passport_number_unique`)
- ספירת כפילויות חוצות-חברות (אם > 0 → `BLOCKED`)

**לא בוצעה הרצה על Production** — בהתאם להנחיית "אין לבצע SQL על Supabase Production".

---

## סיכום שינויים

| קובץ | סוג שינוי |
|------|-----------|
| `app/api/ai/extract-worker-identity/route.ts` | תיקון אבטחה Critical |
| `app/api/vehicle-licenses/[id]/route.ts` | הוספת `eq('company_id')` למוטציות |
| `app/api/vehicle-insurances/[id]/route.ts` | הוספת `eq('company_id')` למוטציות |
| `app/api/professional-licenses/[id]/route.ts` | הוספת `eq('worker_id')` למוטציות |
| `app/api/manager-licenses/[id]/route.ts` | הוספת `eq('worker_id')` למוטציות |
| `lib/export/exportTables.ts` | הוצאת `authorized_phones`, סינון `profiles`/`legal_acceptances` |
| `app/api/admin/users/route.ts` | הוספת `company_members` לתהליך יצירת משתמש |
| `supabase/verify_worker_identity_isolation.sql` | SQL אימות חדש (קריאה בלבד) |
| `vitest.config.ts` | הרחבת include ל-`app/api/**/__tests__/**` |
| `app/api/ai/__tests__/extract-worker-identity.isolation.test.ts` | בדיקות חדשות F-01 |
| `app/api/vehicle-licenses/__tests__/route.isolation.test.ts` | בדיקות חדשות F-02 |
| `app/api/vehicle-insurances/__tests__/route.isolation.test.ts` | בדיקות חדשות F-02 |
| `app/api/professional-licenses/__tests__/route.isolation.test.ts` | בדיקות חדשות F-03 |
| `app/api/manager-licenses/__tests__/route.isolation.test.ts` | בדיקות חדשות F-03 |
| `lib/export/__tests__/exportTables.isolation.test.ts` | בדיקות חדשות F-04 |
| `app/api/admin/__tests__/users.isolation.test.ts` | בדיקות חדשות F-06 |

---

## מגבלות שנותרו

1. **F-08 Production status**: לא ידוע אם indexes על workers.national_id / passport_number קיימים ב-Production. יש להריץ `verify_worker_identity_isolation.sql` על Supabase SQL Editor לפני launch.

2. **site_feedback + audit_logs**: הוחלטו כ-Platform-level. אם הדרישות יפצלו את הנתונים לפי חברה בעתיד — יידרש SQL Migration נוסף.

3. **TOCTOU gap — defense in depth בלבד**: ה-TOCTOU הוא תיאורטי בלבד בסביבה single-tenant; ב-multi-tenant ה-pre-check הוא קו ההגנה הראשי. ה-mutation filter הנוסף הוא defense-in-depth.
