# סקר אבטחה — SafeDoc
> נוצר: 2026-07-15 | ממצאי ראשוני מקריאת קוד
> **לא תחליף ל-penetration test מקצועי**

---

## 1. מצב כולל

| אזור | ציון | הערה |
|------|------|-------|
| אימות וגישה | ✅ טוב | HMAC session, middleware |
| הרשאות API | ✅ טוב | requireAuth/requireAdmin |
| Storage | ✅ טוב | private bucket, signed URLs |
| Rate limiting | ❌ חסר | אין כלל |
| Audit trail | ⚠️ בפיתוח | lib/audit/log.ts נוצר |
| Input validation | ✅ בינוני | MIME + size בהעלאה; אחרים חלקי |
| Secrets management | ✅ טוב | Vercel ENV |
| HTTPS | ✅ Vercel אוכף | |
| CSP headers | ❌ חסר | |
| Cookie security | ✅ HttpOnly, Secure (prod), SameSite=Lax | |

---

## 2. מיפוי מלא של API Routes

### 2.1 נתיבים ציבוריים (ללא session)

| נתיב | מתודה | auth | הערה |
|------|--------|------|-------|
| `/api/auth/login` | POST | ❌ ציבורי | login endpoint — תקין |
| `/api/auth/logout` | POST | ❌ ציבורי | logout — תקין; אמור להיות מוגן |
| `/api/reports/weekly-status` | GET | CRON_SECRET | ✅ CRON_SECRET; במידה ואין secret חשוף |

### 2.2 נתיבים מוגנים — requireAuth (admin + user)

| נתיב | מתודה | auth | ממצא |
|------|--------|------|-------|
| `/api/workers` | GET, POST | requireAuth/Admin | ✅ |
| `/api/workers/[id]` | GET, PATCH, DELETE | requireAdmin | ✅ |
| `/api/documents` | GET, POST, PATCH | requireAdmin | ✅ |
| `/api/vehicles` | GET, POST | requireAdmin/Auth | ✅ |
| `/api/vehicles/[id]` | GET, PATCH | requireAdmin | ✅ |
| `/api/heavy-equipment` | GET, POST | requireAdmin | ✅ |
| `/api/heavy-equipment/[id]` | GET, PATCH | requireAdmin | ✅ |
| `/api/lifting-equipment` | GET, POST | requireAdmin | ✅ |
| `/api/lifting-equipment/[id]` | GET, PATCH | requireAdmin | ✅ |
| `/api/subcontractors` | GET, POST, PATCH | requireAdmin | ✅ |
| `/api/subcontractors/[id]` | GET, PATCH | requireAdmin | ✅ |
| `/api/signed-url` | GET | requireAuth | ✅ |
| `/api/upload` | POST, DELETE | requireAdmin | ✅ |
| `/api/alerts` | GET | requireAuth | ✅ |
| `/api/safety-briefings` | GET, POST, DELETE | requireAdmin | ✅ |
| `/api/height-restrictions` | GET, POST | requireAdmin | ✅ |
| `/api/entity-notes` | GET, POST | requireAuth | ✅ |
| `/api/entity-notes/[id]` | PATCH, DELETE | requireAuth | ⚠️ לאמת: כל מורשה יכול למחוק? |
| `/api/lifting-machine-appointments` | GET, POST | requireAdmin | ✅ |
| `/api/lifting-machine-appointments/[id]` | GET, PATCH, DELETE | requireAdmin | ✅ |
| `/api/vehicle-licenses` | GET, POST | requireAdmin | ✅ |
| `/api/vehicle-licenses/[id]` | PATCH, DELETE | requireAdmin | ✅ |
| `/api/vehicle-insurances` | GET, POST | requireAdmin | ✅ |
| `/api/vehicle-insurances/[id]` | PATCH, DELETE | requireAdmin | ✅ |
| `/api/heavy-equipment-insurances` | GET, POST | requireAdmin | ✅ |
| `/api/heavy-equipment-insurances/[id]` | PATCH, DELETE | requireAdmin | ✅ |
| `/api/manager-licenses` | GET, POST | requireAdmin | ✅ |
| `/api/manager-licenses/[id]` | PATCH, DELETE | requireAdmin | ✅ |
| `/api/professional-licenses` | GET, POST | requireAdmin | ✅ |
| `/api/professional-licenses/[id]` | PATCH, DELETE | requireAdmin | ✅ |
| `/api/legal-consent` | POST | requireAuth | ✅ |
| `/api/site-feedback` | GET (admin), POST (auth) | ✅ | |
| `/api/site-feedback/[id]` | PATCH, DELETE | requireAdmin | ✅ |

### 2.3 נתיבי Admin

| נתיב | מתודה | auth | ממצא |
|------|--------|------|-------|
| `/api/admin/users` | GET, POST | requireAdmin | ✅ |
| `/api/admin/users/[id]` | GET, PATCH, DELETE | requireAdmin | ✅ |
| `/api/admin/users/[id]/reset-password` | POST | requireAdmin | ✅ |
| `/api/admin/audit` | GET | requireAdmin | ✅ |

### 2.4 ⚠️ נתיבים לבדיקה נוספת

| נתיב | בעיה | חומרה |
|------|-------|--------|
| `/api/auth/check-phone` | מוגן ע"י middleware אך לא קורא requireAuth פנימית (no defense-in-depth) | נמוכה |
| `/api/auth/phone-login` | ייתכן שצריך להיות ב-PUBLIC (למשתמשים לפני login) — לאמת | בינונית |
| `/api/ai/extract-worker-identity` | ✅ requireAdmin; אך חשיפת ANTHROPIC_API_KEY בשרת — לוודא לא מוחזר ל-client | נמוכה |

---

## 3. ממצאי אבטחה

### 3.1 קריטי — אין

### 3.2 גבוה

| # | ממצא | קובץ | המלצה |
|---|------|------|--------|
| S-01 | **אין rate limiting** — ניסיונות login ללא הגבלה | `app/api/auth/login/route.ts` | יוטפל שלב יא׳ |
| S-02 | **אין rate limiting** — העלאת קבצים ללא הגבלה | `app/api/upload/route.ts` | יוטפל שלב יא׳ |

### 3.3 בינוני

| # | ממצא | קובץ | המלצה |
|---|------|------|--------|
| S-03 | **IDOR בסינגד URL** — כל משתמש מורשה יכול לבקש signed URL לכל path שהוא יודע | `app/api/signed-url/route.ts` | לשקול: ולידציה שה-path שייך לישות שהמשתמש מורשה לגשת אליה |
| S-04 | **entity_notes מחיקה** — כל user יכול למחוק הערה של אחר (אם יודע את ה-ID) | `app/api/entity-notes/[id]/route.ts` | לאמת; לשקול: requireAdmin לDELETE |
| S-05 | **Cookie Secure** — הגדרת `secure: isProd` תלויה ב-NODE_ENV; אם production לא מוגדר כראוי, cookies לא מאובטחים | `app/api/auth/login/route.ts` | לאמת production environment |
| S-06 | **אין CSP headers** | `next.config.ts` | להוסיף Content-Security-Policy |
| S-07 | **ROLE_COOKIE_NAME** — role cookie אינו HttpOnly ועלול להיקרא ע"י JS | `lib/auth/session.ts` | role מאוחסן ב-client לנוחות UI בלבד; לא משמש לאכיפה (middleware + API מאמתים session) — OK, אך לתעד |
| S-08 | **Session timeout** — אין אבטחת idle timeout (רק max-age 7 ימים) | `lib/auth/session.ts` | לשקול idle timeout לפעולות רגישות |

### 3.4 נמוך

| # | ממצא | קובץ | המלצה |
|---|------|------|--------|
| S-09 | **ANTHROPIC_API_KEY** — לוגים עשויים לחשוף את ה-key בשגיאות | `app/api/ai/...` | לוודא לא מוצג ב-response |
| S-10 | **console.log** ב-upload route עם שם קובץ ותוכן | `app/api/upload/route.ts` | לשקול הסרת logs רגישים ב-production |
| S-11 | **Storage path predictable structure** — נתיב `folder/timestamp-random.ext` צפוי אך לא ניחשאי | | OK להרוולת אבטחה (signed URLs); אין חשיפה ישירה |
| S-12 | **Audit trail חסר** | כל ה-API routes | מטופל בשלב ו׳ |

---

## 4. תיקונים מיידיים (ללא migration)

### 4.1 S-07 — תיעוד role cookie

התנהגות נוכחית תקינה — ROLE_COOKIE_NAME משמש UI בלבד, לא לאכיפת הרשאות. **אין שינוי נדרש**, רק תיעוד:

> `ROLE_COOKIE_NAME` הוא `httpOnly: false` בכוונה — ה-client מסתמך עליו להצגת UI מותאמת. הרשאות אמיתיות מאכפות אך ורק דרך `verifySession()` ב-middleware ו-`requireAdmin()` ב-API routes.

### 4.2 S-05 — cookie Secure

לאמת שב-Vercel production, `NODE_ENV === 'production'` מוגדר.
**פעולה:** בדוק Vercel → Settings → Environment Variables → NODE_ENV = 'production' (בד"כ מוגדר אוטומטית).

---

## 5. פעולות בהמשך

| עדיפות | פעולה | שלב |
|--------|--------|-----|
| גבוהה | Rate limiting (login, upload, export) | שלב יא׳ |
| גבוהה | Audit log בנתיבים מרכזיים | שלב ו׳ (lib/audit/log.ts מוכן) |
| בינונית | CSP headers ב-next.config.ts | שלב ז׳ (להלן) |
| בינונית | IDOR signed-url — ולידציה | לדיון |
| בינונית | entity_notes DELETE — requireAdmin | לדיון |
| נמוכה | הסרת console.log רגישים | שלב טו׳ |

---

## 6. CSP Headers — להוסיף ל-next.config.ts

```typescript
// בתוך next.config.ts headers():
{
  key: 'Content-Security-Policy',
  value: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // Next.js דורש
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co",
    "frame-ancestors 'none'",
  ].join('; '),
},
{
  key: 'X-Frame-Options',
  value: 'DENY',
},
{
  key: 'X-Content-Type-Options',
  value: 'nosniff',
},
{
  key: 'Referrer-Policy',
  value: 'strict-origin-when-cross-origin',
},
```

**⚠️ לא להוסיף headers אלה ללא בדיקה שאינם שוברים את ה-app (בעיקר ה-`unsafe-eval` ב-Next.js dev mode).**
