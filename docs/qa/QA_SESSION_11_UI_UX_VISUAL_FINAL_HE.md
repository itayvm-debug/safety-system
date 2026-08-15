# QA SESSION 11 — ביקורת ממשק משתמש / חוויית משתמש / ויזואל E2E מלאה

**תאריך:** 2026-08-14  
**סביבה:** localhost:3000 (Next.js 14 + Supabase), Chromium  
**משתמש בדיקה:** qa.bot@safedoc.local (Admin)  
**חברה פעילה בבדיקות:** Internal QA (Company B)  
**סטטוס סיום:** **99/99 passed — 0 כשלים**

---

## תוצאות אימות שלב C — שערי וולידציה

| שלב | תוצאה | פרטים |
|-----|--------|--------|
| `npm run lint` | ✅ ללא שגיאות | 15 אזהרות (unused vars בטסטים) — ידועות |
| `npx tsc --noEmit` | ✅ נקי | 0 שגיאות |
| `npx vitest run` | ✅ נקי | 34 קבצים, 465 בדיקות |
| `npx next build` | ✅ מהדר בהצלחה | "Compiled successfully in 4.9s" |
| `tests/navbar/navbar.spec.ts` | ✅ 5/5 | 1280–1920px |
| `tests/s11/ui-audit.spec.ts` | ✅ 99/99 | כל 20 בלוקים |

---

## תקציר ביקורת שלב A

### דפים שנבדקו
| נתיב | תוצאה |
|------|--------|
| `/dashboard` | ✅ |
| `/workers`, `/workers/new` | ✅ |
| `/vehicles`, `/vehicles/new` | ✅ |
| `/heavy-equipment`, `/heavy-equipment/new` | ✅ |
| `/lifting-equipment`, `/lifting-equipment/new` | ✅ |
| `/subcontractors` | ✅ |
| `/issues` | ✅ |
| `/site-managers` | ✅ |
| `/archive` | ✅ |
| `/company/members` | ✅ |
| `/submit-feedback`, `/feedback` | ✅ |
| `/admin/users` | ✅ |
| `/admin/companies` | ✅ |
| `/admin/audit` | ✅ |
| `/select-company` | ✅ |
| `/login` | ✅ |

### רזולוציות שנבדקו
- דסקטופ: 1920, 1600, 1440, 1366, 1280px
- טאבלט: 1024, 768px
- מובייל: 430, 390, 375px

---

## ממצאי באגים ותיקונים — שלב B

### באג 1: לוגו חברה — 404 על כל דף (APPLICATION BUG)

**חומרה:** גבוהה — 2 שגיאות console בכל דף בכל ביקור  
**שורש הבעיה:**  
`app/api/admin/upload-logo/route.ts` החזיר נתיב יחסי (`company-logos/{filename}`) שנשמר ב-DB כ-`logo_url`. ה-NavBar רנדר `<img src="company-logos/...">` (ללא `/` מוביל). הדפדפן פירש את הנתיב כ-URL יחסי לנתיב הדף הנוכחי — למשל `/vehicles/new` → `/vehicles/company-logos/...` → 404. לא הייתה route handler בנתיב זה.

**תיקונים:**
1. **חדש** `app/company-logos/[...path]/route.ts` — proxy route שמגיש לוגואות חברה מ-Supabase Storage (bucket: `worker-files`, prefix: `company-logos/`) עם `Cache-Control: public, max-age=3600`.
2. **NavBar.tsx** — נרמול ה-URL לפני הרנדור: `logo_url.startsWith('/') || logo_url.startsWith('http') ? logo_url : '/' + logo_url`. מונע פרשנות כ-URL יחסי.
3. **CompaniesClient.tsx** (`/admin/companies`) — אותו נרמול לרנדור לוגואות בטבלת החברות.
4. **UserManagementClient.tsx** (`/admin/users`) — אותו נרמול ב-`CompanyAvatar` component.

**נדחה לעתיד:** עדכון `upload-logo/route.ts` לשמור URL עם `/` מוביל עבור העלאות חדשות. נתוני המקור הקיימים מטופלים ע"י הנרמול בצד ה-render.

---

### באג 2: NavBar — חפיפה ויזואלית ב-1366px ו-1600px (APPLICATION BUG — Session קודמת)

**חומרה:** גבוהה  
**שורש הבעיה:** "קבלני משנה" (קישור ניווט אחרון) חפף עם כפתור "יצוא" ב-admin user.

**תיקונים (Session קודמת):**
- לוגו טקסט: `hidden 2xl:block` (נסתר מתחת 1536px)
- שם חברה: `max-w-[80px] 2xl:max-w-[150px] truncate hidden xl:inline`
- קישורים שניוניים (פניות, ארכיון, משתמשים, חברות) — תמיד ב-dropdown ···

---

### באג 3: תיקוני טסטים — `waitSettled()` לא תאים למובייל

**שורש הבעיה:** הפונקציה `waitSettled()` המתינה לכפתור `[aria-label="עוד אפשרויות"]` אשר נמצא בתוך `hidden lg:flex` — CSS-hidden בפחות מ-1024px. `waitFor({ state: 'visible' })` של Playwright תמיד timeout.

**תיקון:** בדיקה של `page.viewportSize().width >= 1024` לפני ההמתנה לכפתור ···.

---

### באג 4: תיקוני טסטים — Safety check race condition ב-Fixture

**שורש הבעיה:** `page.locator('header, nav').first().textContent()` עשוי להחזיר `<nav>` פנימי (לא `<header>`) אם ה-DOM שינה בין ה-`waitForFunction` לבין ה-textContent read. גרם ל-SAFETY ABORT ב-NAVBAR 1920px.

**תיקון:** שימוש ב-`page.evaluate(() => document.querySelector('header')?.textContent ?? '')` — אותה שאילתה כמו ה-`waitForFunction`, מבטיח עקביות.

---

### באג 5: תיקוני טסטים — S11-SELECT-COMPANY timeout

**שורש הבעיה:** `/select-company` מנתב redirect ל-`/dashboard`. ה-dashboard כולל polling שמונע `networkidle`. `waitForLoadState('networkidle')` ה-timeout של 60s.

**תיקון:** שימוש ב-`waitUntil: 'domcontentloaded'` + `waitForLoadState('load')` + `try/catch` לטיפול ב-redirect gracefully.

---

## בדיקות ממשק — ממצאים ויזואליים (אין רגרסיות)

| קטגוריה | סטטוס | הערות |
|---------|--------|-------|
| RTL Layout | ✅ | כל הדפים מרושתים נכון בעברית |
| גלישה אופקית | ✅ 0 | כל 9 viewports × 6 דפים |
| NavBar — אין חפיפות | ✅ | 5 רוחבי דסקטופ |
| NavBar מובייל — burger | ✅ | 768, 430, 375px |
| Dashboard | ✅ | 4 רוחבים, כולל מובייל |
| טפסים | ✅ | workers/new (wizard), vehicles/new, heavy/lifting equipment |
| Export wizard | ✅ | נפתח ומציג Internal QA ב-branding |
| Company switcher | ✅ | Dropdown לא חורג מ-viewport |
| Login | ✅ | 3 viewports, RTL form |
| שגיאות console | ✅ 0 | כל 14 דפי CONSOLE (לאחר תיקון proxy) |
| Z-index modals/dropdowns | ✅ | לא נחתכים בקצות viewport |
| Company members | ✅ | ללא overflow |
| Admin pages | ✅ | companies, users, audit |

---

## קבצים שהשתנו

### תיקוני Application (production code)
| קובץ | שינוי |
|------|-------|
| `app/company-logos/[...path]/route.ts` | **חדש** — proxy route למגישת לוגואות מ-Supabase Storage |
| `components/NavBar.tsx` | logo URL נרמול (leading slash) + שינויי Session קודמת |
| `app/admin/companies/CompaniesClient.tsx` | logo URL נרמול |
| `app/admin/users/UserManagementClient.tsx` | logo URL נרמול ב-CompanyAvatar |

### תיקוני טסטים
| קובץ | שינוי |
|------|-------|
| `tests/s11/ui-audit.spec.ts` | **חדש** — 99 בדיקות E2E מקיפות |
| `tests/navbar/navbar.spec.ts` | atomic boundingBox measurements |
| `tests/fixtures/workers-auth.ts` | waitForFunction-based safety check |
| `tests/archive/archive.spec.ts` | תיקון waitForFunction |

---

## אי-הכללות מודעות (Out of scope)

- בדיקות צד שרת (API routes) — מכוסות ב-Vitest
- בדיקות accessibility (WCAG) — מחוץ לסקופ Session 11
- בדיקות ביצועים / Lighthouse — מחוץ לסקופ
- עדכון schema DB לשמירת logo_url עם `/` מוביל — נדחה
