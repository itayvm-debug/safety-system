# HANDOFF — מצב עבודה SafeDoc

עודכן: 2026-11-18, בסיום סשן לשונית Code: חיבורים, נעילת שלוש הטבלאות, פריסה ל-Production.
"אומת" = נבדק בפועל בתאריך הזה. "דווח" = נבדק בעבר, לא נבדק מחדש.

## 1. הפעולה הבאה המדויקת
1. **אימות עם התחברות (דורש את המשתמש):** באייפון (PWA) — להתחבר, לפתוח כרטיס עובד, לשנות משהו (למשל תדריך), לחזור לרשימה ולהיכנס שוב לכרטיס → אמור להציג את המצב החדש (SW v8). Claude לא מתחבר לאתר החי עם סיסמה.
2. לבחור מהחלטות פתוחות (סעיף 10) — בפרט 10–13, שקיבלו נתונים חדשים בסעיף 7.
3. SQL שנותר (סעיף 7): 02 ו-04 (קריאה בלבד) כשיידרש; 03 ו-05 — לא נחוצים כרגע.
4. אופציונלי: `gh auth login` (לא חוסם — push עובד דרך GCM, Vercel דרך CLI).

## 2. מצב Git (אומת)
- תיקייה: `C:\Users\itayv\OneDrive\שולחן העבודה\תוכנות\CLAUDE\safety`, ענף `main`.
- `origin/main` = `main` = **`cc01a57`** (נדחף 2026-11-18). ענף העזר `deploy/2026-11-18` נמחק.
- שרשרת: `cd6cb91` (הייתה ב-Production) → `a15e2c3` תיקוני הביקורת → `10d6b40` מעבר → `671434b` → `fb00f08` תוצאות SQL → `cc01a57` תיקון build.
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
- נקודת חזרה ל-Production: `vercel rollback` / promote ל-`dpl_HkHX8Wv1GRAQo4XmoG1PhkD5Pk64` (`cd6cb91`).

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

## 10. החלטות עסקיות פתוחות
1. משך session וביטול מיידי ביציאה (מחייב טבלת sessions).
2. מדיניות שמירת קבצים שהוחלפו/של רשומות שנמחקו (בפרט תדריכים ומסמכים חתומים) ותקופת שמירה.
3. הפעלת חילוץ זהות AI (Anthropic כמעבד מידע).
4. רכבי מנהל: האם כל הרכבים הפעילים נספרים לסטטוס.
5. תוקף דרכון לעובד זר; "לא נדרש" לעבודה בגובה; "היום" לפי שעון ישראל.
6. סינון קבלן ב-`/issues` לפי קבלן המנהל.
7. גישת member ל-API של ציוד לצורך ייצוא.
8. הכללת הערות "דורש טיפול" בייצוא הליקויים.
9. `public/offline-app.html` (לא מקושר, מנוע ישן) — להסיר?
10. `legal_acceptances_dedup_backup` (9 שורות, מיילים ו-IP; נעולה עכשיו) — כמה זמן לשמור.
11. `manager_insurances` (deprecated, 0 שורות; נעולה) — לשמור או למחוק את הטבלה.
12. ברירת המחדל להרשאות טבלאות חדשות ב-`public` — **אומת שפתוחות ל-anon/authenticated**. לשנות?
13. הטבלה עם 9 השורות הייתה נגישה עם המפתח הציבורי עד 2026-11-18; אין עדות לגישה בחלון הלוגים (~21 שעות), ואין לוגים לפני כן — האם לבצע הערכת אירוע פרטיות?
14. UX: רשימות מציגות snapshot ישן בשקט כשהשליפה נכשלת — להוסיף חיווי?
15. משתני סביבה ישנים ב-Vercel (`ADMIN_PHONE/ADMIN_PASSWORD/VIEWER_PHONE/VIEWER_PASSWORD`) — הקוד לא קורא אותם; להסיר?
16. ~~חשבון Auth ישן `@safedoc.internal`~~ — **הוחלט ובוצע 2026-11-18:** נחסם (`banned_until` 2999) ו-refresh token 17 בוטל. לא נמחק. נשאר לשקול מחיקה בעתיד.
17. ~~`authorized_phones`~~ — **הוחלט ובוצע 2026-11-18:** המדיניות הוסרה והרשאות anon/authenticated בוטלו. הטבלה (שורה אחת) נשמרה. קבצים: `supabase/proposed/2026-11-18-authorized-phones-legacy-user/`.
20. **הגבלת קצב לא פועלת ב-Production (נמצא 2026-11-18):** המיגרציה `supabase/migrations/durable-rate-limiting.sql` מעולם לא הורצה — אין `rate_limit_events` ואין `rate_limit_check()`. כל קריאה מחזירה 404 (מאות ביום, גם ב-17.11) והקוד מאפשר (fail-open). כלומר אין הגבלה על ניסיונות התחברות (מתוכנן: 10 ל-15 דק' לכל IP), העלאות, ייצוא וקישורים חתומים. להחלטה: להריץ את המיגרציה (תוספתית, rollback מתועד בקובץ). שיקולים: עמודת `ip` שומרת IP גולמי (מידע אישי) ו-`rate_limit_cleanup()` לא מחובר ל-cron — צריך לחבר כדי שה-IP יימחק אחרי 24 שעות.
18. Leaked Password Protection ב-Supabase Auth — להפעיל (ייתכן שדורש תוכנית בתשלום)?
19. `AUTH_FLOW.md` מתאר התחברות בטלפון — לעדכן.

מצב מלא של ממצאי דוח הביקורת: `docs/qa/2026-11-18-audit-report-status.md`.

## 11. חסמים
- אימות עם התחברות (SW v8 / כרטיס עובד) — רק המשתמש.
- אין סביבת Supabase לבדיקות; Playwright הקיים טוען Production — אסור להריץ. בדיקות דפדפן רק ברנר המבודד.

## 12. היסטוריה מפורטת
- תמליל סשן VS Code: `%USERPROFILE%/.claude/projects/` (תיקיית הפרויקט `c--Users-itayv-OneDrive-…-CLAUDE`, סשן `a2727b09-4a5e-441b-82ef-2913c790058e`).
- סשן לשונית Code (2026-11-18): `local_22382344-543e-4c99-bc2d-2cc2d3172176`.
