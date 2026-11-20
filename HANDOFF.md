# HANDOFF — מצב עבודה SafeDoc

עודכן: 2026-11-18 (סוף היום): חיבורים, נעילת טבלאות, פריסה, בדיקת דוח הביקורת מול ה-DB החי, נעילת `authorized_phones`, חסימת החשבון הישן, הפעלת הגבלת קצב, ו"תתקן הכל": סגירת הרשאות DB + בדיקת תקינות יומית, נעילה לפי חשבון, רכבי מנהל, הסרת `offline-app.html`, נגישות העלאות, CI, דילוג על פריסות תיעוד, AUTH_FLOW, טיוטת הערכת חשיפה.
"אומת" = נבדק בפועל בתאריך הזה. "דווח" = נבדק בעבר, לא נבדק מחדש.

## 1. הפעולה הבאה המדויקת
1. ~~לוודא שה-cron `/api/maintenance/daily` רץ לבד~~ — **אומת 2026-11-19:** רץ ב-03:10 UTC (Hobby — בתוך השעה), `rpc/rate_limit_cleanup` ו-`rpc/safedoc_health_check` = 200.
1. **"האפליקציה נתקעת בשטח" — תוקן 2026-11-19 (`3c2d20b`, פורסם, Production = `safety-system-7hxbfgq89`):**
   - סיבות שנמצאו: (א) כל כרטיס ברשימה ביקש `/api/signed-url` לתמונה שלו — ~15 פניות DB לכל תמונה (`authorizeStorageObjectAccess` שולף את כל העובדים/רכבים/ציוד של החברה בכל קריאה); בבוקר 19.11 משתמש אחד הגיע ל-167 בקשות בדקה (מגבלה 200, משותפת לפתיחת מסמכים). (ב) **ה-DB ב-Supabase `ap-northeast-1` (טוקיו) והפונקציות ב-Vercel `iad1` (וושינגטון)** — ~150ms לכל פנייה ל-DB.
   - תיקון: `POST /api/photo-urls` (תמונות בלבד: `workers.photo_url`, `vehicles/heavy_equipment/lifting_equipment.image_url`; שאילתה אחת לכל טבלה לפי חברה; אירוע הגבלת קצב אחד; עד 100). לקוח `lib/storage/photo-url-client.ts` — מאגד בקשות באותו tick, מטמון 50 דק', מתנקה עם `clearAllSnapshots`. `vercel.json` → `"regions": ["hnd1"]`. מסמכים/חתימות עדיין דרך `/api/signed-url` (לחיצה בודדת).
   - בדיקות: `lib/storage/__tests__/photo-urls.test.ts` (6 נכשלות על הקוד הישן); 1144 יחידה; build מבודד 69/69 + דפדפן 30/30.
   - אומת חי: SHA תואם; `x-vercel-id: fra1::hnd1`; `/api/photo-urls` בלי session → 401. מדידה מהדפדפן: `/api/health` (בלי DB) 230→~380ms (המרחק לטוקיו), התחברות שגויה (עם DB) ~900→~495ms. **לא נבדק עם התחברות:** טעינת רשימה בפועל — לבדוק ב-`rate_limit_events` (צפוי: מעט `signed-url`, בקשות `/api/photo-urls`) אחרי שימוש של הבעלים.
   - שיפור גדול יותר אפשרי (לא בוצע, דורש החלטה): העברת פרויקט Supabase לאירופה (`eu-central-1`) + Vercel `fra1` — כל בקשה מהירה בעוד ~150–250ms. מחייב הגירת DB+Storage+Auth לפרויקט חדש.
1. **סקירת "מה עוד לא נבדק" (2026-11-20, קריאה בלבד, לא שונה דבר) — ממתין לבחירת הבעלים:**
   - ~~**גיבוי**~~ — **בוצע 2026-11-20:** `npm run backup` (`scripts/backup-local.ts`, רץ ב-Node 24 עם type stripping) → `C:\Users\itayv\SafeDoc-Backups` (מחוץ לפרויקט ול-OneDrive; הסקריפט מסרב לתיקייה בתוך הפרויקט). משתמש במפתח השרת מ-`.env.local` — **בלי סיסמת DB ובלי כלי Postgres**. מגבה: כל טבלאות `public` כ-JSON (חוץ מ-`rate_limit_events`), תיאור עמודות (OpenAPI), משתמשי Auth (**בלי hash סיסמאות** — לא חשוף ב-API; בשחזור כל משתמש קובע סיסמה), וכל `worker-files` כמראה מצטברת (קובץ שנמחק ב-Supabase נשאר בגיבוי). **אומת:** 30/30 טבלאות עם ספירה זהה ל-DB, 8 משתמשים, 879/879 קבצים ו-413,345,337 בתים זהים ל-`storage.objects`, כל הקבצים PDF/JPG/PNG תקינים. ראשון ~7 דק', הבאים ~20 ש'. בדיקות: `lib/backup/__tests__/backup-local.test.ts` (נתיב קובץ לא יכול לצאת מתיקיית הגיבוי, הורדה רק של חדש/שונה). Runbook נכתב מחדש: `docs/operations/BACKUP_AND_RECOVERY_RUNBOOK_HE.md` (גרסה 1.0 טענה ל-Supabase Pro/PITR ולסקריפט שלא קיים). תוקנה אותה טענה שגויה ב-`DATA_RETENTION_REGISTER_HE.md`, `DATABASE_DEFINITION_DOCUMENT_HE.md`, `INFORMATION_SECURITY_APPENDIX.md`. **לא נבדק:** שחזור מקצה לקצה (אין סביבת בדיקות). **הרצה שבועית — הוגדרה באישור הבעלים (2026-11-20):** משימת Task Scheduler `SafeDoc weekly backup`, ראשון 09:00, `StartWhenAvailable`, משתמש רגיל בלי הרשאות מנהל → `scripts/run-backup.ps1` (לוג ל-`SafeDoc-Backups\backup.log`, הודעה קופצת רק בכשל). אומת: הופעלה ידנית פעמיים מתוך Task Scheduler → `LastTaskResult 0`, לוג קריא בעברית. ההודעה הקופצת בכשל לא נבדקה (כדי לא להקפיץ חלון למשתמש). **פתוח:** עותק מחוץ למחשב (דיסק חיצוני) — החלטת בעלים. ממצא אגב: `lifting_machine_appointments` = 0 שורות, אבל ב-Storage יש `appointment-pdfs` (3) ו-`appointment-signatures` (6) — כנראה קבצים יתומים (מדיניות שמירה פתוחה, החלטה 2).
   - ~~**חולשות בתלויות**~~ — **תוקן ופורסם 2026-11-20 (`04b0648`, Production = `safety-system-h4z2y22vg`):** `next` 16.2.2 → **16.4.6** (16.2.2 היה בטווח של כל ההתראות עד 16.4.4, כולל RCE קריטי ב-Image Optimization ועקיפות middleware — שער ה-auth הראשון שלנו). `npm audit fix` לתלויות הייצור בלבד: `ws`, `nanoid`, `dompurify`, `fflate`, `source-map-js`, `baseline-browser-mapping`, `sharp` 0.35.5, `postcss` 8.5.23. **כלי הפיתוח לא שונו בכוונה:** `eslint-config-next` נשאר 16.2.2 ו-`eslint-plugin-react-hooks` 7.0.1 — ב-16.4/7.1.1 נוספים כללי React Compiler שמסמנים 10 שגיאות בקוד קיים (`set-state-in-effect`, `preserve-manual-memoization`); לשדרג רק עם תיקון הקוד. **אזהרה:** `npm audit fix --omit=dev` מוחק את חבילות הפיתוח מ-`node_modules` — להריץ `npm install` אחריו. `middleware.ts` נשאר (השם `proxy` מומלץ ב-16, לא חובה). נשאר: `xlsx` — אין תיקון upstream; משמש רק ליצירת ייצוא (`lib/export/generateExcel.ts`), לא לקריאת קבצים → סיכון נמוך. בדיקה: `app/__tests__/next-version-security.test.ts` (נכשלת על 16.2.2). מקומי: 1146 יחידה, tsc נקי, lint 0 שגיאות, build מבודד 69/69 + דפדפן 30/30. **אומת חי:** הכתובת מצביעה על הפריסה החדשה, בלוג ה-build `Next.js 16.4.6`; `/api/health` ו-`/login` 200; `/api/workers`, `/api/photo-urls` (GET+POST), `/api/maintenance/daily` בלי session/סוד → 401; `/workers` → 307 גם עם כותרות segment-prefetch; `x-vercel-id: fra1::hnd1`. **לא נבדק עם משתמש מחובר** — אין שימוש מאז הפריסה.
   - **ראיה לתקיעות:** ב-19.11 ‏06:02–06:04 UTC ה-DB החזיר 503 על שאילתות רגילות (עומס מסערת בקשות התמונות) ו-500 ב-`rate_limit_check`. אין שגיאות 5xx מאז ועד 20.11 ‏04:24 UTC — אבל גם לא היה שימוש מאז התיקון (רק 2 ניסיונות התחברות של Claude).
   - **אין התראה על שגיאות בזמן אמת:** את ה-503 מצאתי רק בקריאת לוגים. הבדיקה היומית בודקת הגדרות DB, לא שגיאות של משתמשים.
   - **Vercel Hobby** מיועד לשימוש אישי לא-מסחרי; המערכת משמשת חברה. לידיעת הבעלים (Pro = 20$/חודש) — לא נדחף.
   - נבדק ותקין/לא דחוף: נפח קבצים 394MB מ-1GB (קצב נובמבר ~8MB, אוקטובר ~17MB → שנים); ה-cron היומי מונע השהיית פרויקט חינמי; אזהרות ביצועים של Supabase (אינדקסים, RLS initplan) לא רלוונטיות בגודל הנוכחי והשרת עוקף RLS.
1. דוח המייל השבועי מגיע רק ל-1 מ-3 אדמינים (לשניים אין `report_email`) — החלטת בעלים.
2. ~~בדיקת אימות דו-שלבי מקצה לקצה~~ — בוצעה 2026-11-18 על `qa-bot`. **אימות דו-שלבי הוחלט כרשות** (ראה החלטה 22).
3. סביבת בדיקות מקומית — חסום: אין WSL/Docker במחשב (ראה החלטה 21).
4. להחלטות שנשארו (סעיף 10): 1, 2, 3, 5–8, 10, 11, 13, 15, 18, 21, 23.
4. אפליקציה ייעודית (2026-11-19): **הבעלים בחר קודם לנסות בשטח** את ה-PWA עם הצפייה והחתימה החדשות. אם עדיין חסר — מסלול מומלץ: Capacitor (Apple 99$/שנה + Google 25$ חד-פעמי, חשבונות ע"ש הבעלים); חלופה לאנדרואיד בלבד: TWA. לחכות למשוב מהשטח.
4. אופציונלי: `gh auth login` (לא חוסם — push עובד דרך GCM, Vercel דרך CLI).

## 2. מצב Git (אומת)
- תיקייה: `C:\Users\itayv\OneDrive\שולחן העבודה\תוכנות\CLAUDE\safety`, ענף `main`.
- `origin/main` = `main` (נדחף 2026-11-18). ענף העזר `deploy/2026-11-18` נמחק. Production = הקומיט האחרון ב-`main` (`d6f3923` ואילך).
- שרשרת: `cd6cb91` (הייתה ב-Production) → `a15e2c3` תיקוני הביקורת → `10d6b40` מעבר → `671434b` → `fb00f08` תוצאות SQL → `cc01a57` תיקון build → `7cd92c1`/`cb2757a`/`35c28fd` תיעוד וסטטוס דוח → `d6f3923` הגבלת קצב + cron ניקוי.
- נקודת שחזור: tag מקומי `restore/2026-11-18-pre-handoff` → `a15e2c3` (לא נדחף).
- קבצים מקומיים שאינם ב-Git (ignored): `.env.local`, `.claude/settings.local.json`, `playwright/`, `test-results/`, `playwright-report/`, `.next/`, `SafeDoc LOGO/`.

## 3. מה הושלם, נבדק, פורסם ואומת

| נושא | מצב | ראיה |
|---|---|---|
| דוח ביקורת / תיאור ליועץ | הושלם | https://claude.ai/artifact/CjYzhJJ5LbyobLdaysy2t6 · https://claude.ai/artifact/F3HNepctF1by6NaBD2t6vj |
| תיקוני הביקורת (סעיף 4) + תקלת התדריך (סעיף 5) | **פורסם ב-Production 2026-11-18** | פריסה `dpl_ChHg819yucAwFYu3SUTRgNUrG2X9` = `cc01a57` (`vercel ls --meta githubCommitSha=...`) |
| כשל build ב-Vercel (Tailwind) | אובחן, תוקן, נבדק, פורסם | סעיף 5א |
| נעילת `site_feedback`, `manager_insurances`, `legal_acceptances_dedup_backup` | **בוצע בסביבה החיה ואומת** | סעיף 7 |
| בדיקות יחידה | אומת: 72 קבצים, 999 בדיקות | `npm test` |
| TypeScript | אומת: רק שגיאות ידועות (`tests/s11` ×10, `.next/*/validator.ts`) | `npx tsc --noEmit -p .` |
| Build מבודד + בדיקת דפדפן (תדריך) | אומת: build עובר (עם HANDOFF.md בעותק), 30/30 | `tests/isolated/briefing-persistence.e2e.mjs` |
| Build ב-Vercel | אומת: Preview ו-Production — 65/65 דפים | `vercel inspect <dpl> --logs` |

### אימות באתר החי (2026-11-18, ללא התחברות)
- הכתובת `safety-system-henna.vercel.app` מצביעה על `dpl_ChHg819…` = `cc01a57`.
- `/api/health` = 200, `/login` = 200.
- טבלת הנתיבים ב-build של Production: רק `/api/auth/login` ו-`/api/auth/logout` — `phone-login`/`check-phone` הוסרו. (בלי session כל `/api/*` מחזיר 401 מה-middleware, גם נתיב לא קיים — לכן 404 לא נראה מבחוץ.)
- cron בלי סוד → 401.
- לוגי Supabase אחרי הפריסה: כל בקשות השרת (`sb_secret_`) = 200, כולל `site_feedback` מה-Dashboard. Vercel runtime: 0 שגיאות ב-20 הדקות שאחרי הפריסה.
- **אומת ע"י המשתמש באייפון (2026-11-18):** תדריך חדש → כניסה חוזרת לכרטיס העובד מציגה את המצב המעודכן (SW v8 פעיל).
- **אומת ע"י Claude עם התחברות, בחברת Internal QA (2026-11-18):** SW v8, Dashboard = `/issues`, תדריך → כניסה חוזרת, העלאה, קישור חתום (+403 לנתיב זר), ייצוא (רק נתוני QA), רישום הגבלת קצב. פירוט: `docs/qa/2026-11-18-live-qa-verification.md`. המשתמש מתחבר בדפדפן המובנה; Claude לא מקליד סיסמאות. להבא — להתחבר כ-`qa bot` (חבר ב-QA בלבד), לא כמנהל מערכת.
- נקודת חזרה ל-Production: `vercel rollback` / promote ל-`dpl_HkHX8Wv1GRAQo4XmoG1PhkD5Pk64` (`cd6cb91`).

### אימות הגבלת קצב (2026-11-18, פריסה `dpl_8aCBzmGbm4TyV3Uwdi8JMxCX8T6s` = `d6f3923`)
- ניסיון התחברות אחד עם פרטים לא קיימים → 401 גנרי, ונרשמה שורת `login` ב-`rate_limit_events` (`rpc/rate_limit_check` = 200 מהשרת; קודם 404).
- `vercel crons ls` מציג את `/api/maintenance/rate-limit-cleanup` (`30 2 * * *`). הפעלה ידנית (`vercel crons run`) → `rpc/rate_limit_cleanup` = 200 מהשרת. בלי סוד / סוד שגוי → 401.
- מבחוץ עם המפתח הציבורי: `rate_limit_events`, `rpc/rate_limit_check`, `rpc/rate_limit_cleanup` → 401.
- בדיקות: 1007 יחידה; build מבודד 66 דפים + דפדפן 30/30.
- הערה: `vercel logs` (CLI) החזיר 0 רשומות גם כשהיו בקשות — לאמת התנהגות דרך לוגי Supabase (`query_logs`). ב-Git Bash להריץ פקודות עם נתיב (`vercel crons run /api/...`) עם `MSYS_NO_PATHCONV=1`.

## 4. תיקוני הביקורת (`a15e2c3`, פורסמו)
- **P0-2:** הוסרו `api/auth/phone-login` ו-`api/auth/check-phone`.
- **P0-4:** אשרת עבודה לעובד זר תמיד חובה במנוע (`getWorkerRequiredDocStatus`); מעבר עובד ל"זר" מסמן `is_required=true`.
- **P0-5 / P1·7:** loader משותף `lib/documents/issue-data.ts` ל-Dashboard ול-`/issues` (כולל ביטוחי צמ"ה), התראה כשהנתונים חלקיים.
- **P1·1:** נתיבי העלאה חתומים לחברה + `validateFileFields` בכל route שמצרף קובץ.
- **P1·2:** דפי admin ו-`/feedback` בודקים אדמין פלטפורמה ב-DB.
- **P1·3:** cron עם `CRON_SECRET` בהשוואה בטוחה; נדחה אם הסוד חסר.
- **P1·6:** שער שמירת קבצים `AUTO_REMOVE_ON` — אין מחיקה אוטומטית חדשה; רק 3 המחיקות שהיו קיימות, עם בדיקת הפניות.
- **B-05:** חילוץ זהות AI — הרשאת קובץ מתוקנת; **כבוי כברירת מחדל** (`AI_IDENTITY_EXTRACTION_ENABLED`).
- **Session:** תוקף 7 ימים נאכף בשרת (משתמשים עם session ישן יתבקשו להתחבר — צפוי). matcher של middleware מעוגן לסיומות (`$`).
- **5 דפי שרת** (עריכת עובד, צמ"ה, ציוד הרמה) מסוננים לפי חברה.
- **ביקורות עובדים:** רק המעריך עורך/מוחק; ולידציית ציונים.
- **ייצוא/כרטיסים (C-07):** ייצוא משתמש במנוע; ישויות לא פעילות לא נספרות.
- **מטמון לא-מקוון:** `clearAllSnapshots` בכניסה/יציאה/החלפת חברה.
- **Service Worker v8:** ראה סעיף 5.

## 5. תקלת התדריך — הסיבה שהוכחה
`public/sw.js` v7 שמר cache-first כל GET שאינו API/`_next`, כולל payload של ניווט פנימי (`/workers/<id>?_rsc=<hash>`). ה-hash דטרמיניסטי → כניסה חוזרת לכרטיס מהרשימה הציגה את הביקור הראשון במכשיר. הרשימה (`/api/workers`) הייתה עדכנית. התדריך נשמר כראוי.
תיקון: v8 שומר רק קבצים סטטיים ללא query ומוחק את מטמון v7 בהפעלה. בדיקות: `lib/offline/__tests__/service-worker-cache.test.ts`, `tests/isolated/briefing-persistence.e2e.mjs`.
`sw.js` עובר דרך ה-middleware: מכשיר יקבל v8 בכניסה הבאה עם session תקף.

### 5א. כשל build ב-Vercel (2026-11-18)
- תסמין: `Invalid code point 10646139` ב-Tailwind על `app/globals.css`.
- סיבה (הוכחה): Tailwind v4 סורק כל קובץ שאינו ignored. נתיב Windows ב-HANDOFF.md (`CLAUDE\a2727b09-…`) נקרא כ-escape של CSS: `\a2727b` = 0xA2727B = 10646139, מעבר ל-Unicode. HANDOFF.md נוסף ב-`10d6b40`, לכן ה-build המבודד של 17.11 עבר.
- תיקון (`cc01a57`): `@source not "../**/*.md"; @source not "../supabase";` ב-`app/globals.css`. ה-CSS של הממשק זהה; נשמטו רק `ring` ו-`focus:not-sr-only`, שהופיעו רק ב-`docs/accessibility/ACCESSIBILITY_AUDIT.md`.
- בדיקת רגרסיה: `app/__tests__/globals-css-source-scan.test.ts` — נכשלת על הקוד הישן, עוברת עכשיו.

## 6. רשימת בדיקה לפני פריסה — סטטוס
- [x] `CRON_SECRET` מוגדר ב-Vercel Production+Preview.
- [x] אין תלות במיגרציות: אין קבצי migration חדשים; כל העמודות שהקוד החדש משתמש בהן קיימות ב-DB (נבדק מול `information_schema`).
- [x] `AI_IDENTITY_EXTRACTION_ENABLED` לא מוגדר (= כבוי). `ANTHROPIC_API_KEY`/`COOKIE_SECRET` לא מוגדרים — לא נדרשים (fallback ל-`SESSION_SECRET`).
- [x] SHA בפריסה = SHA שנדחף.
- [x] מסלולי הטלפון הוסרו (טבלת נתיבים).
- [x] כרטיס עובד מתעדכן בכניסה חוזרת — אומת ע"י המשתמש באייפון.

## 7. SQL — מצב
קבצים ב-`supabase/proposed/2026-11-17-audit-remediation/`, תוצאות ב-`results/`.

| קובץ | סוג | מצב |
|---|---|---|
| 01_verify_live_state.sql | קריאה | הורץ ע"י המשתמש (חלקית, 17.11) |
| 02_orphan_candidates_report.sql | קריאה | לא הורץ |
| 03_fix_foreign_worker_visa_required.sql | שינוי | לא הורץ — הקוד כבר מכסה את הכלל |
| 04_legacy_phone_accounts_plan.sql | קריאה | לא הורץ |
| 05_storage_policies_proposed.sql | שינוי | לא הורץ — כנראה לא נדרש (bucket פרטי) |
| 06_service_only_tables_preflight.sql | קריאה | **הורץ 2026-11-18** → `results/2026-11-18_06_preflight_results.md`, rollback מדויק → `results/2026-11-18_06_section15_rollback.sql` |
| 07_service_only_tables_lockdown.sql | שינוי | **הורץ 2026-11-18:** dry run (עבר, לא השאיר שינוי) → COMMIT |
| 08_service_only_tables_verify.sql | קריאה | **הורץ: 17/17 ok** → `results/2026-11-18_07_applied_08_verify.md` |
| 09_service_only_tables_rollback.sql | שינוי | לא הורץ (אין צורך). רמה B עודכנה לפי סעיף 15 (כולל MAINTAIN) |

ממצאים (אומת):
- לפני 07: RLS כבוי והרשאות מלאות ל-anon/authenticated (כולל TRUNCATE ו-MAINTAIN). בדיקה מבחוץ עם המפתח הציבורי: 200, ו-`legal_acceptances_dedup_backup` החזירה ספירה של 9 שורות. `site_feedback`/`manager_insurances` ריקות.
- אחרי 07: RLS פעיל, 0 הרשאות לקליינט, השרת שומר גישה. מבחוץ: 401 לשלוש הטבלאות, בשני המפתחות הציבוריים. האפליקציה ממשיכה לגשת ל-`site_feedback` (200 בלוגים).
- **גישה בפועל (להחלטה 13):** הלוגים זמינים רק מ-17.11 11:02 UTC. בחלון הזה — רק בקשות השרת (`HEAD` ספירה ל-`site_feedback`), אף בקשה מקליינט. לפני כן — לא ניתן לבדוק.
- **ברירת מחדל (להחלטה 12):** כל טבלה חדשה ב-`public` נוצרת עם הרשאות מלאות ל-anon/authenticated. כל migration של טבלה חדשה חייבת RLS/REVOKE עד החלטה.

## 8. חיבורים — מצב (אומת 2026-11-18)
| חיבור | מצב |
|---|---|
| Git push/fetch | עובד (Git Credential Manager) — push ל-`main` בוצע |
| GitHub CLI `gh` | **לא מחובר** (3 קודי device פגו). לא חוסם: push דרך GCM; סטטוסי פריסה דרך Vercel CLI. ה-API הציבורי של GitHub מוגבל ל-60 בקשות/שעה — לא לעשות polling עליו |
| Supabase | **מחובר דרך ה-connector של claude.ai** ("Supabase", כלים `mcp__509ac4c2-…__*`: `execute_sql`, `query_logs`, `list_tables`, `get_advisors`). רואה את כל הפרויקטים בחשבון — לעבוד רק על `rwpahefpexizaicrrxoc`. שרת `supabase` ב-`.mcp.json` נכשל בחיבור מהאפליקציה (`InvalidHTTPResponse`) |
| Vercel CLI | **מחובר:** 66.1.0 גלובלי, `itayvm-debug`, צוות `itayvm-debugs-projects` (hobby). פריסות, inspect, logs, env (שמות). אימות SHA: `vercel ls safety-system --environment production --meta githubCommitSha=<sha>` |
| Vercel MCP | `.mcp.json` — לא מאומת (`/mcp` → vercel → Authenticate). לא נדרש |
| Vercel plugin | הותקן (user scope, `vercel-plugin@vercel`). טלמטריית שימוש ל-`telemetry.vercel.com` (שמות skills + מזהה התקנה); כיבוי: `VERCEL_PLUGIN_TELEMETRY=off` |
| דפדפן | Playwright + Chromium מותקנים; הרנר המבודד עובד |

**אזהרות:**
- `vercel link` / `vercel env pull` כותבים סודות ל-`.env.local`. לא להריץ בתוך הפרויקט. קיים link בתיקייה זמנית: `%TEMP%\vlink` (ה-`.env.local` שנוצר שם נמחק).
- Preview מוגן ב-Vercel Authentication (302). `vercel curl` עוקף, אבל עלול ליצור סוד bypass בפרויקט — לא נעשה שימוש.
- לא להתחבר לאתר החי עם סיסמאות (גם QA) מתוך Claude.

הרשאות Claude Code: `.claude/settings.json` (מצב auto — אומת שפעיל בפועל בסשן; allow ל-git/npm/npx/node/gh/vercel/supabase ול-MCP; deny לקריאת `.env*`, force-push, `reset --hard`, `git clean`, מחיקת פרויקטים).

## 9. החלטות שהתקבלו
- עבודה עצמאית מלאה במסגרת CLAUDE.md (2026-11-18).
- שמירת קבצים: אין מחיקה אוטומטית חדשה עד החלטה (`AUTO_REMOVE_ON`).
- חילוץ זהות AI: כבוי עד החלטה, הקוד נשאר.
- תוקף session: 7 הימים הקיימים נאכפים.
- שלוש הטבלאות: ננעלו לשרת בלבד (בוצע 2026-11-18).
- הגבלת ניסיונות התחברות בסיסמה — **fail-open** כשפונקציית ההגבלה לא זמינה (החלטת בעלים 2026-11-19: זמינות בשטח קודמת; התראה ב-console + בדיקת התקינות היומית במייל). קוד האימות הדו-שלבי נשאר fail-closed.

## 10. החלטות עסקיות פתוחות
1. משך session וביטול מיידי ביציאה (מחייב טבלת sessions).
2. מדיניות שמירת קבצים שהוחלפו/של רשומות שנמחקו (בפרט תדריכים ומסמכים חתומים) ותקופת שמירה.
3. הפעלת חילוץ זהות AI (Anthropic כמעבד מידע).
4. ~~רכבי מנהל~~ — **בוצע 2026-11-18:** כל הרכבים הפעילים שאינם בארכיון נספרים, החמור קובע (`getActiveManagerVehicles`). בנתונים החיים אין שינוי (לכל 5 המנהלים רכב פעיל אחד).
5. תוקף דרכון לעובד זר; "לא נדרש" לעבודה בגובה; "היום" לפי שעון ישראל.
6. סינון קבלן ב-`/issues` לפי קבלן המנהל.
7. גישת member ל-API של ציוד לצורך ייצוא.
8. הכללת הערות "דורש טיפול" בייצוא הליקויים.
9. ~~`public/offline-app.html`~~ — **הוסר 2026-11-18.**
10. `legal_acceptances_dedup_backup` (9 שורות, מיילים ו-IP; נעולה עכשיו) — כמה זמן לשמור.
11. `manager_insurances` (deprecated, 0 שורות; נעולה) — לשמור או למחוק את הטבלה.
12. ~~ברירת המחדל להרשאות~~ — **בוצע 2026-11-18:** כל הרשאות anon/authenticated ב-`public` בוטלו וברירת המחדל נסגרה. `supabase/proposed/2026-11-18-db-hardening/`.
13. הערכת אירוע פרטיות — **טיוטה עובדתית מוכנה:** `docs/compliance/2026-11-18-exposure-assessment-draft.md`. ממצא מרכזי: המפתח הציבורי נשלח לדפדפן רק ב-24–25.4.2026; הטבלה נוצרה ב-17.7. ההחלטה (דיווח/תיעוד) — של בעל המערכת.
14. UX: רשימות מציגות snapshot ישן בשקט כשהשליפה נכשלת — להוסיף חיווי?
15. משתני סביבה ישנים ב-Vercel (`ADMIN_PHONE/ADMIN_PASSWORD/VIEWER_PHONE/VIEWER_PASSWORD`) — הקוד לא קורא אותם; להסיר?
16. ~~חשבון Auth ישן `@safedoc.internal`~~ — **הוחלט ובוצע 2026-11-18:** נחסם (`banned_until` 2999) ו-refresh token 17 בוטל. לא נמחק. נשאר לשקול מחיקה בעתיד.
17. ~~`authorized_phones`~~ — **הוחלט ובוצע 2026-11-18:** המדיניות הוסרה והרשאות anon/authenticated בוטלו. הטבלה (שורה אחת) נשמרה. קבצים: `supabase/proposed/2026-11-18-authorized-phones-legacy-user/`.
18. Leaked Password Protection ב-Supabase Auth — להפעיל? (בתוכנית החינמית לא זמין; דורש שדרוג = התחייבות כספית.)
19. ~~`AUTH_FLOW.md`~~ — **עודכן 2026-11-18.**
20. ~~הגבלת קצב לא פועלת~~ — **בוצע 2026-11-18:** המיגרציה `durable-rate-limiting.sql` הורצה; ניקוי יומי דרך `/api/maintenance/daily` (Vercel Cron 02:30 UTC); בנוסף נעילה לפי חשבון (10/15 דק'). `supabase/proposed/2026-11-18-rate-limiting/`.
21. **סביבת בדיקות — הוחלט: Supabase מקומי (Docker), 2026-11-18. חסום אצל המשתמש:** במחשב אין WSL ואין Docker (נבדק: `wsl --status` = לא מותקן, `VirtualizationFirmwareEnabled=False` — ייתכן שצריך להפעיל וירטואליזציה ב-BIOS). נדרש: `wsl --install` (מנהל + אתחול), ואז Docker Desktop **או** Rancher Desktop (חינמי). **רישוי:** Docker Desktop חינמי רק לארגון עד 250 עובדים ו-$10M — אם החברה מעל, Rancher Desktop. אחרי ההתקנה: `supabase login` (אישור בדפדפן) — השאר Claude: שכפול סכמה בלי נתונים, seed, Playwright מול הסביבה, חיבור ל-CI.
22. ~~**אימות דו-שלבי לאדמינים**~~ — **עדכון אחרון 2026-11-18: הבעלים החליט שאימות דו-שלבי הוא רשות ולא חובה** — `MFA_REQUIRED_ROLES = []`, אין באנר, אין מועד, אין הגבלת כניסה. היכולת נשארת ב"אבטחת חשבון" למי שרוצה; כרגע לאף חשבון לא הופעל. — היסטוריה: **בוצע ופורסם 2026-11-18** (`aeac993`, פריסה `dpl_3DRgLReqLpXDHwb7gdXyPdHJSkkA`). TOTP במימוש פנימי (לא Supabase MFA — כדי לא להחזיק טוקנים של Supabase בין השלבים ולאפשר בדיקה בלי Docker). במקור חובה לאדמיני פלטפורמה מ-2.12.2026 — **בוטל**. שחזור: אדמין אחר. `supabase/proposed/2026-11-18-mfa/`. אומת חי: באנר לאדמין (14 ימים), `/account/security` 200, סטטוס API, שלב קוד בלי טוקן → 401, הבדיקה היומית עוברת (כולל המפתח). **אומת חי מקצה לקצה (2026-11-18, חשבון הבדיקות `qa-bot`, Internal QA בלבד):** הפעלה דרך `/account/security` (QR + קוד ראשון) → ב-DB הסוד מוצפן (`v1:`), לא בטקסט גלוי; התנתקות → סיסמה → מסך קוד; לפני הקוד `/api/session/companies` ו-`/api/workers` = 401; קוד שגוי → 401 "קוד שגוי"; קוד נכון → `/dashboard`, session תקין, נתונים 200; שליחה חוזרת אחרי הכניסה → 401; איפוס עצמי → 409; audit: `mfa_enrolled`, `logout`, `login`. בסוף: ה-factor של `qa-bot` נמחק (כניסה בסיסמה בלבד) והמפתח נמחק מהמחשב.
23. **מפתחות ה-JWT הישנים (legacy):** אומת בלוגים (2026-11-18) שהאפליקציה **כבר** משתמשת רק ב-`sb_publishable_…` (התחברות) וב-`sb_secret_…` (DB/Storage); ללא שימוש אחר במפתחות הישנים חוץ מבדיקות שלי. **נשאר רק קליק של המשתמש:** Supabase Dashboard → Project Settings → API Keys → Legacy API keys → Disable. לא נדרש שינוי קוד או Vercel.

24. **העברת Supabase לאירופה — נדחה ע"י הבעלים (2026-11-20):** לא משהים את `field-quotes` ולא משדרגים ל-Pro כרגע; נשארים בטוקיו + Vercel `hnd1`. לחזור לזה רק ביוזמת הבעלים. פרטי התכנון נשמרו למטה. — **(היסטוריה) הבעלים מעוניין (2026-11-19), חסום על מקום לפרויקט:** בתוכנית החינמית מותרים 2 פרויקטים פעילים, ושניהם תפוסים (`SafeDoc`, `field-quotes` ב-`ap-southeast-2`). אפשרויות: להשהות את `field-quotes` (החלטת בעלים — פרויקט אחר) או לשדרג ל-Pro (25$/חודש — התחייבות כספית). היקף: DB ‏18MB, 8 משתמשי Auth, 879 קבצים (394MB) ב-`worker-files`. נדרש מהבעלים: מפתח secret של הפרויקט החדש ישירות ל-Vercel, וסיסמת DB לשני הפרויקטים בקובץ מקומי שלא נכנס ל-Git (ל-`pg_dump` כולל `auth.users` — כך הסיסמאות ומזהי המשתמשים נשמרים). חלון הקפאת כתיבה ~30 דק'. הפרויקט הישן נשאר כגיבוי ולא נמחק. רווח צפוי: ~0.2–0.25 ש' לכל פעולה (מדידה: Vercel ‏fra1↔hnd1 ≈230ms), ותמונות/מסמכים נטענים מאירופה.

אפשרויות מוכנות לבחירה (סביבת בדיקות, MFA): `docs/decisions/2026-11-18-test-environment-and-mfa.md`.

מצב מלא של ממצאי דוח הביקורת: `docs/qa/2026-11-18-audit-report-status.md`.

## 11. חסמים
- התחברות לאתר החי — רק המשתמש מקליד סיסמה (בדפדפן המובנה); Claude מבצע את הבדיקות אחר כך. לבדיקות — `qa bot` (חבר ב-Internal QA בלבד).
- אין סביבת Supabase לבדיקות (החלטה 21); Playwright הקיים טוען Production — אסור להריץ. בדיקות דפדפן רק ברנר המבודד או ב-Internal QA.

## 11א. מה בוצע ב"תתקן הכל" (2026-11-18)
| נושא | מה | ראיה |
|---|---|---|
| קובץ בדיקה שצורף בטעות | נמחק (QA) | `DELETE /api/documents` 200, 0 שורות ב-DB |
| הרשאות DB | ביטול anon/authenticated ב-`public`, ברירת מחדל סגורה, `search_path` ל-9 פונקציות | `supabase/proposed/2026-11-18-db-hardening/`, health check 10/10, מבחוץ 401, האפליקציה 200 |
| בדיקת תקינות יומית | `safedoc_health_check()` + `/api/maintenance/daily` (ניקוי + בדיקות + מייל לאדמינים, 500 בכשל) | בדיקה שלילית: מזהה את המצב הישן |
| כשל שקט בהגבלת קצב | `console.error` | `lib/rate-limit/__tests__/db.test.ts` |
| נעילה לפי חשבון | 10/15 דק' לפי מזהה (hash), בנוסף ל-IP | אותו קובץ בדיקות |
| רכבי מנהל (P1·5) | כל הפעילים, החמור קובע | `lib/documents/__tests__/manager-vehicles.test.ts` |
| `offline-app.html` | הוסר | `lib/offline/__tests__/no-legacy-offline-app.test.ts` |
| נגישות העלאות | `role=button`, מקלדת, `aria-label` מתאר לכל אזור | `lib/offline/__tests__/file-upload-zone-a11y.test.ts` |
| CI | `.github/workflows/ci.yml`; שגיאות ה-TS ב-`tests/s11` תוקנו | — |
| פריסות תיעוד | `ignoreCommand` מול `VERCEL_GIT_PREVIOUS_SHA` | סימולציה על commits קיימים + בדיקה |
| מסמכים | `AUTH_FLOW.md`, טיוטת הערכת חשיפה, CLAUDE.md | — |
| בדיקות | 1027 יחידה; build מבודד 66/66 + דפדפן 30/30 | — |

**אימות באתר החי** (פריסה `dpl_CQim6AQpexQm5FLhrmGvnYQzAoQa` = `7240860`):
- CI ראשון ב-GitHub Actions: success (בדיקות, טיפוסים, lint, build) — run `44286310924`.
- `vercel crons ls`: `/api/maintenance/daily 30 2 * * *` (במקום rate-limit-cleanup). הפעלה ידנית → `rpc/rate_limit_cleanup` 200 + `rpc/safedoc_health_check` 200, ללא שאילתת אדמינים (= אין התראה, כל הבדיקות עברו). בלי סוד → 401.
- עם התחברות (QA): `/offline-app.html` 404, `/api/maintenance/rate-limit-cleanup` 404, `/api/workers` 200.
- ניסיון התחברות שגוי אחד → 401 גנרי; נרשמו `login` (עם IP) ו-`login-account` (בלי IP ובלי משתמש).
- הערת היגיינה: מחיקת `public/offline-app.html` נכנסה בפועל ל-commit `2c2f35b` (הייתה כבר ב-stage) ולא ל-`a1aa51e`.

**סבב "לפי סדר עדיפויות" (2026-11-18, פריסה `dpl_AX2mDKSQ9W6sGpjHcNqcFVN16iqY` = `d301646`):**
- הרשאת קבצים (Mode B) — inner join במקום רשימת מזהי עובדים ב-URL (`2039daa`). חי: קובץ תדריך של QA 200 (PDF), נתיב זר 403, בלוגים השאילתה `workers!inner(company_id)` + סינון חברה. בדיקה חוצת-חברות חיה דולגה (קריאת נתיב של ולדמן נחסמה — נכון); מכוסה בבדיקת יחידה.
- ממצאי P2 שלא נבדקו: הערה על ישות לא פעילה — תוקן כבר (C-06, יש בדיקה); תג רישיון — משתמש במנוע (`getProfessionalLicenseStatus`).
- `docs/security/FINAL_RLS_MATRIX.md` נכתב מחדש מהמצב החי.
- מפתחות legacy — לא בשימוש (החלטה 23).
- 1030 בדיקות יחידה.

**סבב בדיקות מקיף כ-qa-bot ב-Internal QA (2026-11-18, Production = `ab210f4`, אומת באתר):**
- נבדקו: עובד זר (אשף, אשרה, גובה, תדריך חתום, עריכה, שיוך מנהל), רכב, כלי צמ"ה (רישיון, ביטוח חובה/מקיף, הערת "דורש טיפול", סמן כלא פעיל/פעיל), ציוד הרמה (תמונה, תסקיר פג תוקף), קבלן משנה (יצירה, עריכה, ארכיון), Dashboard מול `/issues` (21 = 19+2), משוב (שליחה, טופל, מחיקה), ביצועי עובדים (יצירת הקצאות), דפי ניהול (200), מובייל 375px (ללא גלישה אופקית).
- תוקנו (כל אחד עם בדיקת רגרסיה שנכשלת על הקוד הישן):
  - `4b76c3d` — `/sw.js`, `/manifest.json`, `/offline.html` נגישים בלי session (התאמה מדויקת). חי: 200; `/sw.jsx` → 307.
  - `5ff3509` — תבניות PDF של תדריך/איסור גובה ניתנות למסגור עצמי. חי: `frame-ancestors 'self'` + `SAMEORIGIN`.
  - `3b7e996` — "דרכון" במקום "תעודת זהות" לעובד זר; aria-label ל-63 שדות. חי: אומת בכרטיס עובד.
  - `7e27a97` — עמודות תמונה (`photo_url`/`image_url`) דוחות קובץ שאינו JPG/PNG/WEBP. חי: PDF → 400.
  - `02ee25a` — ולידציית טלפון/טקסט בקבלני משנה, עובדים ומינוי מפעיל (`lib/validation/fields.ts`; ערך ישן ללא שינוי עובר). חי: "abc" → 400, שם מספרי → 400.
  - `ab210f4` — בדף ביצועי עובדים שורת "ללא מנהל אתר" (הקצאות בלי מעריך נעלמו). חי: 5 + 2 = 7.
- תצפיות שלא שונו (החלטה/UX): מסמך אופציונלי עם קובץ מוצג "לא נדרש" (כלל מנוע מתועד); הערת "דורש טיפול" נספרת כ"חסר" ב-Dashboard אך לא בכותרת הישות; מתג "סמן כלא פעיל" — טקסט הפעולה ליד מתג ירוק עלול לבלבל; ב-QA יש 14 קבלני "QA Archive Sub" ישנים מבדיקות קודמות.
- נתוני בדיקה הועברו לארכיון (לא נמחקו, היסטוריית תדריך נשמרה): עובד `e020ecef…`, רכב `788da9bd…`, צמ"ה `f08f8cca…`, ציוד הרמה `8e371d53…`, קבלן `QA-סבב קבלן בדיקה`. נשארו: הקצאות ביצועים לשבוע 15.11 ב-QA, קבצי PDF יתומים (מדיניות שמירה פתוחה).
- בדיקות: 1087 יחידה.

**משוב בעלים 2026-11-19 (Production = `c8f5ff5`, אומת באתר):**
- ביטוחים: חובה = "ביטוח חובה"; "מקיף" ו"צד ג" אופציונליים — כך מוגדר כבר במנוע (`status.ts`, `issues.ts`). מתג "סמן כלא פעיל" — הבעלים אישר שתקין.
- `d98ce28` — צפייה בתבנית תדריך/איסור גובה **בתוך האפליקציה** (ב-PWA באייפון PDF בלשונית חדשה = אין חזרה): תמונות עמודים `public/*-templates/pages/*.webp` (נוצרות ע"י `python -I scripts/render-template-pages.py` — להריץ מחדש כשתבנית משתנה; בדיקה נכשלת אם לא), מסך מלא עם "סגור". תבנית חברה מותאמת → iframe בתוך האפליקציה. רכיב: `components/documents/TemplateViewer.tsx`.
- `d98ce28` + `c8f5ff5` — לוח חתימה משותף `components/documents/SignaturePad.tsx`: 200–260px (איסור גובה היה 110px), מצב מסך מלא, ייצוא רק אזור הדיו; בכותרת ה-PDF החתימה נכנסת בשמירת יחס (`lib/documents/signature-fit.ts`).
- אומת חי (מובייל 375px): 4 עמודי תדריך נטענים בתוך האפליקציה, 0 לשוניות חדשות; חתימה בשורה ובמסך מלא; הופק איסור גובה אמיתי לעובד הבדיקה `e020ecef…` (שוחזר זמנית והוחזר לארכיון) — החתימה ב-PDF מלאה ולא מעוותת. האיסור נשאר (מסמך חתום — לא נמחק).
- `8d45705` — דיווח מהשטח (אייפון, אפליקציה מותקנת): נראה רק עמוד 1. עמודים 2+ היו `loading="lazy"` בתוך תיבת גלילה פנימית ולא נטענו. עכשיו כולם נטענים מיד. אומת חי: 6/6 עמודים (רוסית) נטענו בלי גלילה. הוחלף ע"י `7f2f14b`.
- `7f2f14b` — **הסיבה האמיתית ל"רק עמוד 1"**: לחברת נתן ולדמן יש תבניות משלה (`public/briefing-templates/overrides/natan-valdman/`, נקבע בהגדרות החברה). לא היו להן תמונות עמודים → הצופה נפל ל-iframe של PDF → באייפון רק עמוד 1. עכשיו הסקריפט מרנדר **כל** PDF תחת `public/*-templates/**` (כולל overrides), והמפה `TEMPLATE_PAGE_COUNTS` לפי נתיב. בדיקה נכשלת אם PDF כלשהו בתיקיות האלה בלי תמונות. אומת חי: 24/24 תמונות עמודים של ולדמן = 200 webp. **אושר ע"י המשתמש באייפון (2026-11-19): כל העמודים מוצגים.**
- `7f2f14b` — צילום עובד: נפתחה רק מצלמה קדמית. ברירת מחדל = מצלמה אחורית, כפתור החלפה עם טקסט ("סלפי" / "מצלמה אחורית"), טקסט המסגרת "מקם את פני העובד". **אושר ע"י המשתמש באייפון (2026-11-19).**
- לא שונה: מינוי מפעיל מכונת הרמה (לוח 120px נפרד ב-`LiftingMachineAppointmentCard`); צפייה בקבצים חתומים נפתחת בקישור Supabase (בדומיין אחר — באייפון נפתח בחלון Safari עם "סיום").

**/code-review + /simplify על `a15e2c3..HEAD` (2026-11-19, Production = `572db7a`, אומת חי ב-QA):**
- `83f0f1a` — תיקוני code-review: מגבלת קוד האימות הדו-שלבי **fail-closed** (`checkRateLimitDb(..., { failClosed: true })`); הפעלת אימות דו-שלבי רק עד 15 דק' אחרי התחברות (`isRecentLogin` ב-`mfa-policy.ts`) — חי: session ישן → 403 `REAUTH_REQUIRED`; לוח חתימה עם `ResizeObserver` (סיבוב לא מעוות; סיבוב עם דיו מנקה); IP ביומן דרך `getClientIp`; ת"ז מספרית נדחית; `responsible_worker_id` שגוי → 400.
- `572db7a` — ניקוי (/simplify, ללא שינוי התנהגות): `clientIpOrNull`, `setSessionCookie`, `getHmacKey(purpose)`; 429 אחד בהתחברות; קריאות DB מקבילות (התחברות, דף אבטחה, דף משתמשים); לוח חתימה פשוט יותר. **בנוסף:** עדכון מינוי מפעיל ויצירה/עדכון חברה (ניהול) בודקים טלפון (חי: "abc" → 400).
- בדיקות: 1123 יחידה, build מבודד + דפדפן 30/30, התחברות שגויה חי → 401 גנרי.
- **הוחלט:** מגבלת ההתחברות בסיסמה נשארת fail-open (סעיף 9). **לא תוקן:** (2) תבנית חברה חדשה דורשת הרצת `scripts/render-template-pages.py` (אין רינדור בזמן ריצה). (3) ~80 `aria-label` ידניים במקום `<Field>` עם `htmlFor`. (4) ~~נתיבי API נופלים ב-500 על קלט לא תקין~~ — **תוקן `0a4bf37`** (ראה למטה). (5) מדיניות חובת MFA בקוד (`MFA_REQUIRED_ROLES`, תאריך 2.12.2026) — להחזרה יידרש תאריך חדש.

**קריאת גוף בקשה בטוחה בכל ה-API (2026-11-19, Production = `0a4bf37`, אומת חי ב-QA):**
- `lib/http/json-body.ts` → `readJsonObject(request, textFields)`: JSON שבור / גוף שאינו אובייקט → 400; שדה טקסט שאינו מחרוזת → 400. 40 נתיבים + manager-mappings + reset-password. בקשות תקינות — ללא שינוי.
- בדיקה (`lib/http/__tests__/json-body.test.ts`) נכשלת אם נתיב חוזר ל-`await request.json()` חשוף (חריג: `ai/extract-worker-identity`, כבוי, עם try/catch משלו).
- חי: JSON שבור / מערך / מספר בשדה טקסט → 400 עם הודעה; יצירת משוב ועדכון עובד תקינים → 201/200; התחברות עם JSON שבור → 400 (היה 500).
- **הערה סביבתית:** ה-build המבודד המקומי נכשל בשלב יצירת הדפים (31 workers, קוד 0xC0000409) — זיכרון וירטואלי (commit) במחשב כמעט מלא (2.4GB פנויים מ-34.5GB). הקוד עבר קומפילציה ו-TypeScript מקומית, וה-build ב-Vercel הצליח. **נפתר 2026-11-19:** המשתמש העביר את קובץ הדפדוף לניהול אוטומטי (היה 2GB ידני ב-D:) — build מבודד 68/68 + דפדפן 30/30 ו-1128 בדיקות יחידה עוברים מקומית בלי הגבלה.

## 12. היסטוריה מפורטת
- תמליל סשן VS Code: `%USERPROFILE%/.claude/projects/` (תיקיית הפרויקט `c--Users-itayv-OneDrive-…-CLAUDE`, סשן `a2727b09-4a5e-441b-82ef-2913c790058e`).
- סשן לשונית Code (2026-11-18): `local_22382344-543e-4c99-bc2d-2cc2d3172176`.
