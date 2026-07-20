# Environment Variables — SafeDoc 1.0.0

**עדכון אחרון:** 2026-07-20  
**מחבר:** סשן סגירה סופי

> ⚠️  אל תציג ערכים אמיתיים של Secrets בשום מקום.  
> ⚠️  `.env.local` חייב להיות ב-.gitignore — לעולם אל תעלה ל-git.

---

## משתנים נדרשים (Required)

| שם | קובץ/שימוש | Server/Client | Required | Env | Secret | ברירת מחדל אם חסר |
|----|------------|---------------|----------|-----|--------|--------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase/server.ts`, `lib/supabase/client.ts`, login route | Client+Server | Required | Production+Dev | לא | ❌ crash בהפעלה |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | login route (Supabase Auth), client | Client+Server | Required | Production+Dev | לא (public) | ❌ crash בהפעלה |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/server.ts` → `createServiceClient()` | Server only | Required | Production+Dev | **כן** | ❌ crash — כל API routes כושלים |
| `SESSION_SECRET` | `lib/auth/session.ts` → HMAC-SHA256 signing | Server only | Required | Production+Dev | **כן** | ❌ crash — sessions לא ניתנים לחתימה |
| `NEXT_PUBLIC_APP_URL` | CSRF check (`middleware.ts`), `lib/legal/config.ts` | Client+Server | Required | Production | לא | דילוג בדיקת origin — CSRF פחות מדויק |

---

## משתנים אופציונליים — פיצ'רים

| שם | קובץ/שימוש | Server/Client | Required | Env | Secret | ברירת מחדל אם חסר |
|----|------------|---------------|----------|-----|--------|--------------------|
| `RESEND_API_KEY` | `app/api/cron/weekly-report/route.ts` | Server only | Optional | Production | **כן** | שליחת מיילים כושלת בשקט, אין 500 |
| `REPORT_FROM_EMAIL` | weekly-report cron | Server only | Optional | Production | לא | fallback ל-`noreply@resend.dev` |
| `REPORT_TO_EMAIL` | weekly-report cron | Server only | Optional | Production | לא | דוח לא נשלח |
| `CRON_SECRET` | `app/api/cron/weekly-report/route.ts` — Bearer token auth | Server only | Optional | Production | **כן** | cron לא מוגן (Vercel Cron בלבד = סביר) |
| `ANTHROPIC_API_KEY` | AI worker identity feature | Server only | Optional | Production | **כן** | AI feature כבוי |

---

## משתנים ציבוריים — זיהוי לקוח

| שם | קובץ/שימוש | Server/Client | Required | Env | Secret | ברירת מחדל אם חסר |
|----|------------|---------------|----------|-----|--------|--------------------|
| `NEXT_PUBLIC_CUSTOMER_NAME` | `config/customer.ts`, legal pages | Client | Required | Production | לא | שם החברה לא מוצג |
| `NEXT_PUBLIC_CUSTOMER_NAME_EN` | `config/customer.ts` | Client | Optional | Production | לא | שדה ריק |
| `NEXT_PUBLIC_CUSTOMER_REG` | `config/customer.ts`, legal pages (ח.פ.) | Client | Optional | Production | לא | שדה ריק |
| `NEXT_PUBLIC_CUSTOMER_ADDRESS` | `config/customer.ts`, legal pages | Client | Optional | Production | לא | שדה ריק |
| `NEXT_PUBLIC_CUSTOMER_PHONE` | `config/customer.ts`, legal pages | Client | Optional | Production | לא | שדה ריק |
| `NEXT_PUBLIC_CUSTOMER_EMAIL` | `config/customer.ts`, legal pages | Client | Optional | Production | לא | שדה ריק |
| `NEXT_PUBLIC_CUSTOMER_SAFETY_EMAIL` | `config/customer.ts` | Client | Optional | Production | לא | שדה ריק |

---

## משתנים לסביבת פיתוח/בדיקות

| שם | קובץ/שימוש | Server/Client | Required | Env | Secret | ברירת מחדל אם חסר |
|----|------------|---------------|----------|-----|--------|--------------------|
| `PLAYWRIGHT_BASE_URL` | `playwright.config.ts` | Test only | Optional | Dev/CI | לא | `http://localhost:3000` |
| `NEXT_PUBLIC_BUILD_DATE` | `lib/system/version.ts` → `/about` | Client | Optional | Production | לא | מוצג `לא הוגדר` ב-about page |
| `NODE_ENV` | `app/about/page.tsx`, login cookie secure flag | Server | Automatic | כל | לא | Next.js מגדיר אוטומטית |
| `CI` | `playwright.config.ts` — reuseExistingServer | Test | Automatic | CI | לא | `false` (reuse server) |

---

## שמות ישנים — DEPRECATED

| שם ישן | מצב | הערה |
|---------|------|------|
| `COOKIE_SECRET` | **DEPRECATED — אין שימוש** | שם שגוי שהופיע ב-.env.local.example ישן. הקוד משתמש ב-`SESSION_SECRET`. `lib/csrf.ts` מכיל fallback ל-`COOKIE_SECRET` כ-legacy אך לא נקרא מ-login. **אל תשתמש.** |
| `SECRET_COOKIE_PASSWORD` | **לא קיים בקוד** | לא נמצא בשום קובץ `.ts`/`.tsx`. |

---

## הערות אבטחה

- `SUPABASE_SERVICE_ROLE_KEY` — עוקף RLS לחלוטין. Server-side only. אסור בפלאגין client.
- `SESSION_SECRET` — חתימת HMAC-SHA256. פחות מ-32 תווים = חולשה. מינימום 32 תווים, מומלץ 64.
- `CRON_SECRET` — מגן על endpoint weekly-report. ב-Vercel Cron, מוגדר כ-Authorization: Bearer.
- `ANTHROPIC_API_KEY` — אופציונלי לחלוטין; AI feature מאופשר ב-`FEATURES.aiWorkerIdentity`.
- כל `NEXT_PUBLIC_*` — חשוף ל-browser. אסור לשים secrets.

---

## הגדרת Vercel

ב-Vercel Dashboard → Project → Settings → Environment Variables:

```
Production  → SESSION_SECRET, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
              ANTHROPIC_API_KEY, CRON_SECRET
All envs    → NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
              NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_CUSTOMER_*
Preview     → אפשר לשתף עם Production או ערכים נפרדים לבדיקה
```
