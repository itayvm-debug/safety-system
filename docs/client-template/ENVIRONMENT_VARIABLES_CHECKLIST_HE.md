# רשימת ENV Variables — SafeDoc
> לשימוש בהגדרת Vercel Environment Variables

## משתנים חובה (required)

| שם | סביבה | תיאור | דוגמה |
|----|-------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | production + preview | URL פרויקט Supabase | https://xxx.supabase.co |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | production + preview | Anon key (ציבורי) | eyJhbGci... |
| `SUPABASE_SERVICE_ROLE_KEY` | production + preview | Service role key (סודי!) | eyJhbGci... |
| `COOKIE_SECRET` | production + preview | Secret ל-HMAC session | openssl rand -base64 64 |

## משתנים מומלצים

| שם | סביבה | תיאור |
|----|-------|-------|
| `RESEND_API_KEY` | production | שליחת דוחות שבועיים |
| `REPORT_TO_EMAIL` | production | אימייל קבלת דוחות |
| `NEXT_PUBLIC_APP_URL` | production | URL האפליקציה (ללא / בסוף) |
| `ANTHROPIC_API_KEY` | production | AI לזיהוי מסמכים |

## משתנים ספציפיים ללקוח

| שם | תיאור |
|----|-------|
| `NEXT_PUBLIC_CUSTOMER_NAME` | שם הארגון בעברית |
| `NEXT_PUBLIC_CUSTOMER_NAME_EN` | שם הארגון באנגלית |
| `NEXT_PUBLIC_CUSTOMER_REG` | ח.פ. / ע.מ. |
| `NEXT_PUBLIC_CUSTOMER_ADDRESS` | כתובת |
| `NEXT_PUBLIC_CUSTOMER_PHONE` | טלפון |
| `NEXT_PUBLIC_CUSTOMER_EMAIL` | אימייל ראשי |
| `NEXT_PUBLIC_CUSTOMER_SAFETY_EMAIL` | אימייל בטיחות |

## בדיקת ENV vars

לאחר הגדרה, אמת ב:
```
GET /api/admin/system-health
```
צפה ב: `checks.database: ok`, `checks.storage: ok`

---

## אזהרות אבטחה

- ⚠️ `SUPABASE_SERVICE_ROLE_KEY` — **לעולם לא** כ-`NEXT_PUBLIC_`
- ⚠️ `COOKIE_SECRET` — ייחודי לכל פריסה
- ⚠️ לעולם אל תכניס secrets לקוד מקור (/git)
- ⚠️ הגדר כ-"Secret" ב-Vercel (לא plain text)
