# ספר נהלי גיבוי ושחזור — SafeDoc
> עודכן: 2026-11-20 | גרסה: 2.0 | סיווג: פנימי
> גרסה 1.0 (2026-07-18) תיארה גיבוי Supabase Pro / PITR וסקריפט `backup-storage.ps1`. **שניהם לא קיימים:** הארגון ב-Supabase בתוכנית החינמית (אין גיבויים להורדה ואין PITR), והסקריפט לא נכתב מעולם.

## 1. מה מגובה, איפה ואיך

| שכבה | כלי | תדירות | אחסון |
|------|-----|---------|-------|
| **DB + משתמשים + קבצים** | `npm run backup` (`scripts/backup-local.ts`) | שבועי (מומלץ), ידני | `C:\Users\itayv\SafeDoc-Backups` במחשב הבעלים |
| **ייצוא לקוח** | `/admin/export` | לפי בקשה | מורד |
| **קוד** | GitHub `itayvm-debug/safety-system` | כל push | GitHub |

**אין גיבוי אוטומטי ב-Supabase.** אם לא מריצים את הגיבוי המקומי — אין עותק של הנתונים.

### 1.1 הרצה
מתיקיית הפרויקט (שבה נמצא `.env.local`):
```
npm run backup
```
- קורא את `NEXT_PUBLIC_SUPABASE_URL` ו-`SUPABASE_SERVICE_ROLE_KEY` מ-`.env.local` ולא מדפיס אותם.
- תיקייה אחרת: משתנה סביבה `SAFEDOC_BACKUP_DIR`. הסקריפט מסרב לתיקייה בתוך הפרויקט (Git/OneDrive).
- הרצה ראשונה: ~7 דקות (394MB). הרצות הבאות: ~20 שניות + קבצים חדשים בלבד.
- קוד יציאה 0 = הצליח; 1 = היו כשלים (מפורטים ב-`manifest.json`); 2 = חסרים משתני סביבה / תיקייה אסורה.

### 1.1א הרצה שבועית אוטומטית (הוגדרה 2026-11-20)
- משימה ב-Windows Task Scheduler: **`SafeDoc weekly backup`** — כל יום ראשון 09:00. אם המחשב היה כבוי, רצה כשהוא נדלק (`StartWhenAvailable`); רק עם רשת; עד שעה.
- רצה כמשתמש המחובר, בלי הרשאות מנהל, בחלון מוסתר: `powershell.exe -File scripts\run-backup.ps1`.
- הפלט נשמר ב-`SafeDoc-Backups\backup.log`. **בכשל קופצת הודעה על המסך** עם נתיב הלוג.
- בדיקת מצב: `Get-ScheduledTask -TaskName 'SafeDoc weekly backup' | Get-ScheduledTaskInfo` (‏`LastTaskResult` 0 = הצליח).
- הפעלה מיידית: `Start-ScheduledTask -TaskName 'SafeDoc weekly backup'`.
- הסרה: `Unregister-ScheduledTask -TaskName 'SafeDoc weekly backup' -Confirm:$false`.
- אם תיקיית הפרויקט זזה — לרשום את המשימה מחדש (הנתיב לסקריפט שמור בה).

### 1.2 מבנה התיקייה
```
SafeDoc-Backups\
  files\<נתיב ב-Storage>          ← מראה מצטברת של bucket worker-files (קובץ שנמחק ב-Supabase נשאר כאן)
  snapshots\<YYYY-MM-DD_HHmm>\
    db\<טבלה>.json                ← כל השורות של כל טבלה ב-public
    db\_columns.openapi.json      ← שמות וסוגי עמודות (לא אילוצים/RLS/פונקציות)
    auth-users.json               ← מזהים, מיילים, metadata — **בלי hash של סיסמאות**
    files-index.json              ← רשימת הקבצים ב-Storage ברגע הגיבוי
    manifest.json                 ← ספירות, גדלים, כשלים
```
- לא מגובה: `rate_limit_events` (מונים זמניים עם IP).
- אין מחיקה אוטומטית של snapshots ישנים (כל אחד ~1MB).

### 1.3 אבטחה ופרטיות
- הגיבוי מכיל ת"ז, דרכונים, אשרות וחתימות. **לא להעלות ל-GitHub, לא לשים בתוך תיקיית הפרויקט.**
- התיקייה מחוץ ל-OneDrive בכוונה. עותק נוסף מחוץ למחשב (דיסק חיצוני מוצפן) — החלטת בעלים.
- מומלץ שהמחשב יהיה עם הצפנת דיסק (BitLocker / Device Encryption).

### 1.4 אימות (בוצע 2026-11-20)
- 30/30 טבלאות, ספירת שורות זהה ל-DB (`count(*)` לכל טבלה); 8 משתמשים.
- 879/879 קבצים, 413,345,337 בתים — זהה ל-`storage.objects`; כל הקבצים PDF/JPG/PNG תקינים (בדיקת חתימת קובץ).

---

## 2. שחזור

⚠️ **השחזור לא נבדק מקצה לקצה** — אין סביבת בדיקות (HANDOFF, החלטה 21). לא לשחזר ישירות לתוך Production בלי גיבוי נקודתי של השורות שיוחלפו.

### 2.1 קובץ בודד שנמחק / הוחלף
1. למצוא אותו ב-`SafeDoc-Backups\files\<נתיב>` (הנתיב כפי שמופיע בעמודה `file_url` / `photo_url` ב-snapshot).
2. Supabase Dashboard → Storage → `worker-files` → להעלות לאותו נתיב בדיוק.

### 2.2 שורות שנמחקו / נדרסו
1. למצוא את השורה ב-`snapshots\<תאריך>\db\<טבלה>.json`.
2. לבדוק קודם (קריאה בלבד) מה יש עכשיו ב-DB לאותו `id`.
3. `insert` (שורה שנמחקה) או `update` (שורה שנדרסה) עם אותו `id`, דרך SQL Editor, עם תיעוד ב-`supabase/proposed/<תאריך>-restore/` (בדיקה מקדימה + rollback).

### 2.3 אובדן מלא של הפרויקט
1. פרויקט Supabase חדש (דורש מקום פנוי בתוכנית — ראה HANDOFF החלטה 24).
2. סכמה: `supabase/schema.sql` + קבצי `supabase/migration_*.sql`, `supabase/migrations/`, והקבצים שהורצו ב-`supabase/proposed/` (לפי HANDOFF סעיף 7). להשוות מול `_columns.openapi.json`.
3. משתמשים: ליצור מחדש לפי `auth-users.json` **עם אותם מזהים** (Admin API `createUser` עם `id`), סיסמה זמנית — כל משתמש קובע סיסמה חדשה. אימות דו-שלבי יופעל מחדש ע"י מי שרוצה.
4. נתונים: לייבא את קבצי ה-JSON לפי סדר תלויות (companies → profiles/company_members → subcontractors → workers → שאר הטבלאות).
5. קבצים: להעלות את `files\` כולה ל-bucket פרטי `worker-files` באותם נתיבים.
6. Vercel: לעדכן `NEXT_PUBLIC_SUPABASE_URL`, המפתח הציבורי והמפתח הסודי; `regions` ב-`vercel.json` לפי אזור הפרויקט החדש.
7. אימות: `/api/health`, התחברות, דף עובד עם תמונה ומסמך, `/api/maintenance/daily` (בדיקת התקינות).

---

## 3. ייצוא נתונים לחברה
`/admin/export` → "הורד ייצוא ZIP" (manifest + JSONL לכל טבלה עסקית של החברה). מיועד להעברת נתונים ללקוח, לא כגיבוי של המערכת.

---

## 4. לוח זמנים מומלץ

| פעולה | תדירות | אחראי |
|-------|---------|-------|
| `npm run backup` | שבועי — אוטומטי (ראשון 09:00) | Task Scheduler |
| בדיקה ש-`manifest.json` האחרון בלי כשלים | שבועי | בעלים |
| עותק לדיסק חיצוני | חודשי (המלצה) | בעלים |
| שחזור לבדיקה | כשתוקם סביבת בדיקות | — |

## 5. RPO / RTO (מצב אמיתי)

| מטריקה | ערך |
|--------|-----|
| **RPO** | עד הגיבוי המקומי האחרון (שבוע בהרצה שבועית) |
| **RTO** | לא נמדד (שחזור לא נבדק); הערכה: יום עבודה לאובדן מלא |
