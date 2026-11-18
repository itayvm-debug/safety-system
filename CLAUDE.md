# CLAUDE.md

> **בתחילת כל סשן:** קרא את [HANDOFF.md](HANDOFF.md) (מצב עבודה, פעולה הבאה, חסמים) ואת [AGENTS.md](AGENTS.md) (Next.js 16 — לקרוא את התיעוד שב-`node_modules/next/dist/docs/` לפני כתיבת קוד).
> בסיום כל משימה: עדכן את HANDOFF.md.

## מטרת הפרויקט
SafeDoc — אפליקציית ווב מאובטחת לניהול מסמכי בטיחות של עובדים, מנהלי עבודה, רכבים, כלי צמ"ה וציוד הרמה באתרי בנייה. רב-חברתית (multi-tenant): כל חברה רואה רק את הנתונים שלה.

## שפת עבודה
- כל התקשורת עם המשתמש בעברית: הסברים, דוחות, טקסטים בממשק והודעות שגיאה.
- שמות משתנים, פונקציות, קבצים, טבלאות ועמודות באנגלית.
- תמיכה מלאה ב-RTL.

## מדיניות עבודה עצמאית (הוגדרה ע"י בעל הפרויקט, 2026-11-18)
המשתמש עובד מולך מממשק אחד (לשונית Code באפליקציית Claude). הוא מתאר בעיה בעברית; אתה מבצע את כל המחזור:
**קבלת בעיה → איסוף ראיות → אבחון → תיקון → בדיקות → commit ו-push → פריסה → אימות באתר → עדכון HANDOFF.md.**

מאושר מראש, במסגרת משימות SafeDoc, בלי לבקש אישור לכל פעולה:
- קריאה ועריכה של קוד והגדרות; הרצת פקודות, התקנת תלויות נחוצות, הרצת בדיקות.
- שימוש ב-MCP (Supabase, Vercel), ב-CLI (git, gh, npm/npx) ובדפדפן (Playwright).
- קריאת לוגים, הגדרות, סכמות ונתונים הנחוצים למשימה.
- ענפים, commit, push, PR ומיזוג; פריסה ל-Preview ול-Production ומעקב אחריה.
- SQL, מיגרציות ותיקוני נתונים/הרשאות גם בסביבה החיה — **רק** כשהם נחוצים ישירות למשימה, ההיקף נבדק (שאילתה מקדימה בקריאה בלבד), ויש דרך חזרה מוגדרת (סקריפט rollback או גיבוי נקודתי של השורות המושפעות).

מחוץ להרשאה — לעצור ולשאול:
- מחיקת מידע עסקי או היסטוריה ללא אפשרות שחזור; מחיקת פרויקט או חשבון.
- התחייבות כספית חדשה (שדרוג תוכנית וכו').
- חשיפת סודות (בפלט, ב-Git, בלוגים).
- שינוי מהותי בכלל עסקי שלא הוכרע (ראה "החלטות פתוחות" ב-HANDOFF.md).
- הזדהות אישית (OAuth/login) — לרכז בפנייה אחת קצרה.

מדיניות זו מחליפה הוראות קודמות כגון AUDIT ONLY / NO COMMIT / NO PUSH / NO DEPLOY, במסגרת העבודה המורשית.
כשכלי נכשל — לבדוק חלופה סבירה לפני שפונים למשתמש. לא לסיים ב"הקוד מוכן, תדחוף בעצמך".
**לא לטעון "תוקן באתר" כשאומת רק הקוד המקומי.** אימות באתר = הגרסה הפרוסה (commit) נבדקה + התנהגות נבדקה בכתובת החיה.

## סביבות וחיבורים (ללא סודות)
| מה | זיהוי |
|---|---|
| תיקייה | `C:\Users\itayv\OneDrive\שולחן העבודה\תוכנות\CLAUDE\safety` (גם שורש ה-Git) |
| GitHub | `itayvm-debug/safety-system`, ענף ראשי `main` |
| Vercel | פריסה אוטומטית מ-Git: push ל-`main` = Production, push לענף אחר = Preview (לאמת ב-MCP). כתובת חיה: `https://safety-system-henna.vercel.app` |
| Supabase | פרויקט `rwpahefpexizaicrrxoc` = **Production** (אין פרויקט בדיקות). Bucket פרטי `worker-files` |
| MCP | `.mcp.json`: `supabase` (מוגבל לפרויקט הזה), `vercel`. הזדהות OAuth דרך `/mcp` |
| GitHub CLI | `gh` 2.104 (winget, ב-PATH של המשתמש; נתיב מלא: `%LOCALAPPDATA%\Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin\gh.exe`) — מצב פריסת Vercel נראה גם ב-commit statuses של GitHub |

**`.env.local` מצביע ל-Production** (כולל service role וסיסמאות). אין להדפיס אותו. כל פקודה שטוענת אותו (`next dev`, `next build`, `npx playwright test`) עובדת מול הנתונים החיים.

## פקודות
| פעולה | פקודה | הערה |
|---|---|---|
| בדיקות יחידה | `npm test` (vitest) | לא נוגע ב-DB. אם worker קורס: `npx vitest run --pool=threads` |
| טיפוסים | `npx tsc --noEmit -p .` | אמור להיות נקי. שגיאות ב-`.next/*/validator.ts` = תיקיית build ישנה מקומית (לא קיימת ב-CI) |
| Lint | `npx eslint app lib components hooks middleware.ts` | קוד האפליקציה בלי שגיאות (אזהרות בלבד). שגיאות ידועות רק ב-`promo/` ובחלק מ-`tests/**/*.spec.ts` |
| CI | `.github/workflows/ci.yml` | בכל push: בדיקות, טיפוסים, lint, build — בלי סודות ובלי DB |
| בדיקת דפדפן מבודדת | `node tests/isolated/briefing-persistence.e2e.mjs --workdir <תיקייה מחוץ לפרויקט>` | מעתיק בלי `.env*`, Supabase מדומה בזיכרון, Chromium + Service Worker אמיתי |
| Playwright הקיים (`tests/**/*.spec.ts`) | **לא להריץ** | `playwright.config.ts` טוען `.env.local` = Production. רק אחרי שתוקם סביבת בדיקות |
| Build | `npm run build` | טוען `.env.local`. ל-build מבודד — להשתמש ברנר המבודד |
| פריסה | `git push origin main` → Vercel | לעקוב: `vercel ls safety-system --environment production --meta githubCommitSha=<sha>` (Vercel CLI מחובר). לאמת באתר. commit של תיעוד/SQL/בדיקות בלבד לא נפרס (`ignoreCommand` ב-`vercel.json`) |

## ארכיטקטורה — כללים שאסור לשבור
- **Auth:** שם משתמש + סיסמה (Supabase `signInWithPassword` בשרת) → cookie חתום `safedoc_session` (HMAC, 7 ימים, נאכף בשרת). מסלולי ההתחברות בטלפון (`phone-login`, `check-phone`) **הוסרו**. `authorized_phones` אינה מנגנון ההתחברות.
- **הקשר חברה:** כל קריאה/כתיבה עוברת `getCurrentCompanyContext()` / `requireCompanyAdminRole()` (בודקים DB: profile פעיל, membership פעיל, חברה פעילה) ומסננת `company_id`. לעולם לא לסמוך על companyId מהלקוח.
- **DB:** כל הגישה מהשרת עם `createServiceClient()` (service role). אין שימוש ב-client של הדפדפן מול טבלאות. אדמין פלטפורמה נבדק ב-DB (`requirePlatformAdmin`), לא מה-cookie.
- **הרשאות DB (2026-11-18):** ל-`anon`/`authenticated` אין הרשאות ב-`public`, וברירת המחדל לאובייקטים חדשים סגורה. טבלה/פונקציה חדשה — RLS פעיל, בלי GRANT ללקוח. `safedoc_health_check()` רצה כל יום (`/api/maintenance/daily`) ומתריעה במייל לאדמיני הפלטפורמה. מיגרציה שהקוד תלוי בה — להוסיף לה בדיקה ב-health check.
- **קבצים:** נתיבי העלאה חתומים (`issueUploadPath`), צירוף קובץ רק דרך `validateFileFields`. מחיקה אוטומטית מ-Storage רק לפי `AUTO_REMOVE_ON` ב-`lib/storage/file-paths.ts` (תמיד עם בדיקת הפניות). **לא למחוק היסטוריית תדריכים או מסמכים חתומים.**
- **מנוע סטטוס משותף:** `lib/documents/status.ts` + `lib/documents/issues.ts` + `lib/documents/issue-data.ts`. Dashboard, `/issues`, התראות, דפי ישויות וייצוא חייבים להשתמש בהם. לא לשכפל לוגיקת סטטוס.
- **Service Worker** (`public/sw.js`): שומר במטמון רק קבצים סטטיים ללא query. לעולם לא דפים/RSC/API. שינוי ב-SW = העלאת `CACHE_VERSION`.
- **מטמון לא-מקוון** (`lib/offline/cache.ts`): מפתחות גלובליים, מנוקים בכניסה/יציאה/החלפת חברה (`clearAllSnapshots`).
- **AI לחילוץ זהות:** כבוי אלא אם `AI_IDENTITY_EXTRACTION_ENABLED=true` (החלטה עסקית פתוחה).
- **Cron:** `lib/auth/cron.ts` — דורש `CRON_SECRET` (Bearer) מוגדר ב-Vercel. נתיב cron חדש — להוסיף גם ל-`PUBLIC` ב-`middleware.ts` (אחרת 401).
- **אימות דו-שלבי (TOTP):** `lib/auth/totp.ts`, `mfa-store.ts`, `mfa-policy.ts`, `login-response.ts`. **רשות לכולם** (החלטת בעלים 2026-11-18 — אין חובה, אין באנר, אין מועד; להחזרת חובה: `MFA_REQUIRED_ROLES` ב-`mfa-policy.ts`). מי שהפעיל — תמיד נדרש קוד. סוד מוצפן ב-`user_mfa_factors` עם `MFA_ENCRYPTION_KEY` (Vercel, Sensitive) — **אסור להחליף/למחוק את המפתח** (נועל את כל מי שהפעיל). session מונפק רק דרך `buildLoginResponse`. לא להפעיל אימות דו-שלבי על חשבון של המשתמש בבדיקות.
- **הגבלת קצב:** `lib/rate-limit/db.ts` (פונקציה `rate_limit_check` ב-DB). התחברות: 10/15 דק' לפי IP **ו**-10/15 דק' לפי חשבון. נכשל פתוח עם `console.error`.

## כללים עסקיים קיימים
- סטטוסים: valid / expiring_soon (≤14 יום) / expired / missing / not_required. סטטוס ישות = החמור ביותר.
- עובד זר: אשרת עבודה חובה תמיד (גם אם נשמרה בעבר "לא נדרש").
- תעודת זהות: קיום קובץ מספיק (ללא תוקף).
- עבודה בגובה: הטוב מבין אישור עבודה בגובה ואיסור עבודה בגובה.
- תדריך בטיחות: נקבע לפי התדריך האחרון שהושלם (`getLatestCompletedSafetyBriefing`), תוקף שנה קלנדרית (29.2 → 28.2).
- רישיון מקצועי: קובץ חובה; תוקף נבדק רק אם הוזן.
- רשומות לא פעילות/בארכיון לא נספרות בליקויים ובייצוא.

## אבטחה ופרטיות
- המערכת מכילה מידע אישי רגיש (ת"ז, דרכונים, אשרות). כל קובץ = פרטי.
- אין לחשוף קבצים או נתונים ללא אימות והרשאה תקינים; אין להחליש הרשאה כדי שבדיקה תעבור.
- שמירה על הפרדת חברות. בדיקות הרסניות רק על חברת QA פנימית (`4f3d08b0-6317-40bf-8f69-1702c39f9f05`), לעולם לא על SafeDoc/Company A (`00000000-0000-0000-0000-000000000001`).
- לא לשים סיסמאות QA ב-URL, בלוגים או בהודעות.

## הנחיות הנדסיות
- לא להוסיף פיצ'רים שלא התבקשו; להעדיף פשטות, תחזוקתיות ואבטחה.
- לעבוד בשלבים קטנים; ולידציה בלקוח ובשרת.
- כל תיקון באג — עם בדיקת רגרסיה שנכשלת על הקוד הישן ועוברת אחרי התיקון.
- דפוס תקלה חוזר: `[id]/route.ts` שהועתק מ-route האוסף — לבדוק בכל מודול חדש.
- SQL מוצע נשמר ב-`supabase/proposed/<תאריך>-<נושא>/` עם בדיקה מקדימה, אימות ו-rollback.
