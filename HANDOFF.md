# HANDOFF — מצב עבודה SafeDoc

עודכן: 2026-11-18, בסיום המעבר מ-VS Code ללשונית Code באפליקציית Claude.
כל מה שכתוב כאן "אומת" נבדק בפועל בתאריך הזה. "דווח" = נבדק בעבר, לא נבדק מחדש.

## 1. הפעולה הבאה המדויקת
1. **אימות חיבורים** (אחרי שהמשתמש השלים הזדהות — ראה סעיף 8):
   `gh auth status`; ב-MCP: `supabase` → רשימת טבלאות; `vercel` → רשימת פריסות של הפרויקט.
2. **לזהות את הגרסה החיה בפועל** דרך Vercel (commit SHA של הפריסה הפעילה ב-Production). לא להניח ש-`origin/main` (`cd6cb91`) הוא מה שרץ.
3. **הבדיקה המקדימה לשלוש הטבלאות** — להריץ `supabase/proposed/2026-11-17-audit-remediation/06_service_only_tables_preflight.sql` (קריאה בלבד) דרך Supabase MCP, לשמור את התוצאה (בפרט סעיף 15 = rollback) ב-`supabase/proposed/2026-11-17-audit-remediation/results/`, ולהציג למשתמש. המשתמש ביקש להמשיך כרגע **רק** לבדיקה המקדימה.
4. אחרי כן, לפי החלטה/המשך: 07 (הרצת ניסיון → COMMIT) → 08 → בדיקת האפליקציה.
5. **פריסת התיקונים המקומיים** (`a15e2c3` + commit המעבר): רשימת בדיקות לפני פריסה בסעיף 6.

## 2. מצב Git (אומת)
- תיקייה: `C:\Users\itayv\OneDrive\שולחן העבודה\תוכנות\CLAUDE\safety` (שורש המאגר).
- ענף: `main`. `origin/main` = `cd6cb91`.
- `a15e2c3` "Apply SafeDoc fixes" — commit מקומי (נוצר ע"י המשתמש) עם כל עבודת התיקונים: 101 קבצים (39 חדשים, 60 שונו, 2 נמחקו). **לא נדחף.** נסרק: אין סודות, אין קובצי `.env` (רק `.env.local.example` עם placeholders).
- נקודת שחזור: tag מקומי `restore/2026-11-18-pre-handoff` → `a15e2c3`.
- commit המעבר (אחרי a15e2c3): CLAUDE.md, HANDOFF.md, `.mcp.json`, `.claude/settings.json`, `.gitignore`. לא נדחף.
- לא בוצע push בכוונה: push ל-`main` מפעיל פריסת Production, ולא התבקש פרסום בשלב המעבר.
- קבצים מקומיים שאינם ב-Git (ignored): `.env.local`, `.claude/settings.local.json`, `playwright/` (כולל `.auth`), `test-results/`, `playwright-report/`, `.next/`, `SafeDoc LOGO/`.

## 3. מה הושלם, נבדק, פורסם ואומת

| נושא | מצב | ראיה |
|---|---|---|
| דוח ביקורת (read-only) | הושלם | https://claude.ai/artifact/CjYzhJJ5LbyobLdaysy2t6 (commit `cd6cb91`) |
| תיאור מערכת ליועץ | הושלם | https://claude.ai/artifact/F3HNepctF1by6NaBD2t6vj |
| תיקוני הביקורת בקוד (P0/P1/B/C) | מקומי בלבד (`a15e2c3`), **לא פורסם** | פירוט בסעיף 4 |
| תקלת "תדריך נשמר אבל כרטיס העובד מציג מצב ישן" | אובחן, תוקן, נבדק — מקומי בלבד, **לא פורסם** | סעיף 5 |
| בדיקות יחידה | אומת היום: 71 קבצים, 998 בדיקות עוברות | `npm test` |
| TypeScript | אומת היום: רק שגיאות קיימות (`tests/s11` ×10, `.next` ישן) | `npx tsc --noEmit -p .` |
| ESLint | אומת היום: 23 שגיאות, כולן ב-`promo/` ו-`tests/**/*.spec.ts` שלא שונו; קבצי `app/`/`lib/` — אזהרות בלבד | `npx eslint .` |
| Build מבודד (Turbopack + webpack) | דווח (2026-11-17): עובר, 65/65 דפים | עותק בלי `.env*` |
| בדיקת דפדפן מבודדת (תדריך) | דווח (2026-11-17): 30/30 על התיקון; 3 כשלים על `cd6cb91` | `tests/isolated/` |
| האתר החי | אומת היום: `/api/health` = ok. **הגרסה הפרוסה לא אומתה** (`sw.js` מפנה ל-login ללא session) | סעיף 1.2 |

## 4. תיקוני הביקורת שב-`a15e2c3` (מקומי)
- **P0-2:** הוסרו `api/auth/phone-login` ו-`api/auth/check-phone`.
- **P0-4:** אשרת עבודה לעובד זר תמיד חובה במנוע (`getWorkerRequiredDocStatus`); מעבר עובד ל"זר" מסמן `is_required=true`.
- **P0-5 / P1·7:** loader משותף `lib/documents/issue-data.ts` ל-Dashboard ול-`/issues` (כולל ביטוחי צמ"ה), התראה כשהנתונים חלקיים.
- **P1·1:** נתיבי העלאה חתומים לחברה + `validateFileFields` בכל route שמצרף קובץ.
- **P1·2:** דפי admin ו-`/feedback` בודקים אדמין פלטפורמה ב-DB.
- **P1·3:** cron עם `CRON_SECRET` בהשוואה בטוחה; נדחה אם הסוד חסר.
- **P1·6:** שער שמירת קבצים `AUTO_REMOVE_ON` — אין מחיקה אוטומטית חדשה; רק 3 המחיקות שהיו קיימות, עם בדיקת הפניות.
- **B-05:** חילוץ זהות AI — הרשאת קובץ מתוקנת; **כבוי כברירת מחדל** (`AI_IDENTITY_EXTRACTION_ENABLED`).
- **Session:** תוקף 7 ימים נאכף בשרת. matcher של middleware מעוגן לסיומות (`$`).
- **5 דפי שרת** (עריכת עובד, צמ"ה, ציוד הרמה) מסוננים לפי חברה.
- **ביקורות עובדים:** רק המעריך עורך/מוחק; ולידציית ציונים.
- **ייצוא/כרטיסים (C-07):** ייצוא משתמש במנוע; ישויות לא פעילות לא נספרות.
- **מטמון לא-מקוון:** `clearAllSnapshots` בכניסה/יציאה/החלפת חברה.
- **Service Worker v8:** ראה סעיף 5.

## 5. תקלת התדריך — הסיבה שהוכחה
`public/sw.js` v7 שמר cache-first כל GET שאינו API/`_next`, כולל payload של ניווט פנימי (`/workers/<id>?_rsc=<hash>`). ה-hash דטרמיניסטי → כניסה חוזרת לכרטיס מהרשימה הציגה את הביקור הראשון במכשיר. הרשימה (`/api/workers`) הייתה עדכנית. התדריך נשמר כראוי.
תיקון: v8 שומר רק קבצים סטטיים ללא query ומוחק את מטמון v7 בהפעלה. בדיקות: `lib/offline/__tests__/service-worker-cache.test.ts`, `tests/isolated/briefing-persistence.e2e.mjs`.
לאמת אחרי פריסה: באייפון (PWA) — כניסה חוזרת לכרטיס עובד אחרי שינוי. עד אז עקיפה: פתיחת הכרטיס בכתובת ישירה.
השלכה סבירה שלא נבדקה בדפדפן: אחרי החלפת חברה באותו מכשיר, דפי שרת (Dashboard) יכלו להציג נתוני החברה הקודמת עד רענון מלא. v8 סוגר זאת.

## 6. לפני פריסה ל-Production (רשימת בדיקה)
- [ ] `CRON_SECRET` מוגדר ב-Vercel Production (אחרת שלושת ה-cron יחזירו 401).
- [ ] לוודא שאין תלות של הקוד במיגרציות שלא הורצו (03/05/07 אינם תנאי לקוד).
- [ ] `AI_IDENTITY_EXTRACTION_ENABLED` לא מוגדר (= כבוי) עד החלטה.
- [ ] משתמשים פעילים עם session ישן מ-7 ימים יתבקשו להתחבר מחדש — צפוי.
- [ ] אחרי פריסה: SHA בפריסה = SHA שנדחף; `/sw.js` (עם session) = v8; `/api/auth/phone-login` = 404; כרטיס עובד מתעדכן בכניסה חוזרת.

## 7. SQL — מצב
כל הקבצים ב-`supabase/proposed/2026-11-17-audit-remediation/`. **אף קובץ שינוי לא הורץ בסביבה החיה.**

| קובץ | סוג | מצב |
|---|---|---|
| 01_verify_live_state.sql | קריאה | הורץ ע"י המשתמש (חלקית). דווח: `worker-files` פרטי; RLS על `storage.objects` בלי מדיניות; `legal_acceptances_dedup_backup`, `manager_insurances`, `site_feedback` — RLS כבוי, ל-anon/authenticated הרשאות SELECT/INSERT/UPDATE/DELETE |
| 02_orphan_candidates_report.sql | קריאה | הוכן, לא הורץ |
| 03_fix_foreign_worker_visa_required.sql | שינוי (UPDATE) | הוכן, לא הורץ. הקוד כבר מכסה את הכלל |
| 04_legacy_phone_accounts_plan.sql | קריאה | הוכן, לא הורץ |
| 05_storage_policies_proposed.sql | שינוי | הוכן, לא הורץ. לפי 01 ה-bucket כבר פרטי ואין מדיניות — כנראה לא נדרש |
| 06_service_only_tables_preflight.sql | קריאה | הוכן, נבדק מקומית (PGlite). **הבא בתור** |
| 07_service_only_tables_lockdown.sql | שינוי | הוכן, נבדק מקומית 45/45 (כולל rollback ומקרי עצירה). מסתיים ב-ROLLBACK כברירת מחדל |
| 08_service_only_tables_verify.sql | קריאה | הוכן, נבדק מקומית |
| 09_service_only_tables_rollback.sql | שינוי | הוכן; רמה B תוחלף בפלט סעיף 15 של 06 |

ממצא קוד (אומת): שלוש הטבלאות נגישות לאפליקציה רק דרך `createServiceClient()`; `manager_insurances` ו-`legal_acceptances_dedup_backup` אינן בשימוש בקוד. בדיקת שמירה: `lib/supabase/__tests__/service-only-tables.test.ts`.

## 8. חיבורים — מצב (אומת היום)
| חיבור | מצב |
|---|---|
| Git (push/fetch) | עובד — Git Credential Manager |
| GitHub CLI `gh` | הותקן (winget). **לא מחובר** — דורש `gh auth login` של המשתמש (העתקת הטוקן מ-GCM נחסמה ע"י בדיקת ההרשאות האוטומטית) |
| Supabase MCP | מוגדר ב-`.mcp.json` (פרויקט `rwpahefpexizaicrrxoc`). השרת עונה 401 = דורש OAuth של המשתמש |
| Vercel MCP | מוגדר ב-`.mcp.json`. השרת עונה 401 = דורש OAuth של המשתמש |
| דפדפן | Playwright + Chromium 1228 מותקנים; הרנר המבודד עובד |
| Supabase/Vercel CLI | לא מותקנים (MCP מספק את הצורך) |

הרשאות Claude Code: `.claude/settings.json` (משותף: מצב auto, allow ל-git/npm/npx/node/gh/vercel/supabase ול-MCP, deny לקריאת `.env*`, force-push, `reset --hard`, `git clean`, מחיקת פרויקטים). `.claude/settings.local.json` (אישי, ignored): הפעלת שרתי ה-MCP של הפרויקט.

## 9. החלטות שהתקבלו
- עבודה עצמאית מלאה במסגרת CLAUDE.md (2026-11-18).
- שמירת קבצים: אין מחיקה אוטומטית חדשה עד החלטה (`AUTO_REMOVE_ON`).
- חילוץ זהות AI: כבוי עד החלטה, הקוד נשאר.
- תוקף session: 7 הימים הקיימים נאכפים.
- שלוש הטבלאות: לנעול לשרת בלבד (07), אחרי בדיקה מקדימה.

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
10. `legal_acceptances_dedup_backup` — כמה זמן לשמור (מכילה מיילים ו-IP).
11. `manager_insurances` (deprecated) — לשמור כהיסטוריה או לייצא ולמחוק.
12. ברירת המחדל להרשאות טבלאות חדשות ב-`public` (כנראה פתוחות ל-anon) — לשנות?
13. אם יתברר שהייתה גישה בפועל לשלוש הטבלאות — הערכת אירוע פרטיות?
14. UX: רשימות מציגות snapshot ישן בשקט כשהשליפה נכשלת — להוסיף חיווי?

## 11. חסמים
- הזדהות המשתמש: `gh auth login`, OAuth ל-Supabase MCP ול-Vercel MCP.
- אין סביבת Supabase לבדיקות; Playwright הקיים טוען Production — אסור להריץ. בדיקות דפדפן רק ברנר המבודד.
- הגרסה החיה לא אומתה (תלוי Vercel MCP).
- `sw.js` עובר דרך ה-middleware: משתמש עם session שפג יקבל את v8 רק אחרי התחברות.

## 12. היסטוריה מפורטת
תמליל הסשן הקודם (VS Code): `C:\Users\itayv\.claude\projects\c--Users-itayv-OneDrive---------------------CLAUDE\a2727b09-4a5e-441b-82ef-2913c790058e.jsonl`
קבצי עבודה זמניים (לא בפרויקט): `C:\Users\itayv\AppData\Local\Temp\claude\5c1728dbb4d9df72\a2727b09-4a5e-441b-82ef-2913c790058e\scratchpad`
