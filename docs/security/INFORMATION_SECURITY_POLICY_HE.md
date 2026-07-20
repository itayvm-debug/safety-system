# מדיניות אבטחת מידע — SafeDoc
> תאריך: 2026-07-18 | גרסה: 1.0 | סיווג: פנימי

## 1. מטרה ותחולה

מסמך זה מגדיר את מדיניות אבטחת המידע של SafeDoc ותשתיתה. הוא חל על כל גורם שמפתח, מפעיל, או ניגש למערכת.

---

## 2. עקרונות יסוד

1. **מינימום הרשאות**: כל משתמש ותהליך מקבלים את ההרשאות המינימליות הנדרשות בלבד.
2. **הגנה בעומק (Defense in depth)**: שכבות הגנה מרובות — middleware, API auth, RLS, הצפנה.
3. **ניטור ותיעוד**: כל פעולה מהותית נרשמת ב-audit_logs.
4. **כשל בטוח (Fail safe)**: ספקי API מחזירים 401/403 בכל ספק ב-auth — לא 500.
5. **אפס אמון ברשת (Zero trust)**: כל בקשת API דורשת אימות מחדש — אין "trusted internal requests".

---

## 3. ניהול גישה

### 3.1 משתמשים
| רמה | גישה | הרשאת DB |
|-----|------|----------|
| admin | כל המערכת | createServiceClient |
| user | ממשק מוגבל | createServiceClient (דרך API) |

### 3.2 מדיניות סיסמאות
- אורך מינימלי: 8 תווים
- אין אילוץ על סיבוכיות (MVP) — מומלץ להעלות ל-12 תווים לפני מסחור רחב
- אין תפוגת סיסמא אוטומטית (Supabase Auth מנהל)
- אחסון: bcrypt דרך Supabase Auth

### 3.3 Sessions
- טיפוס: HMAC-SHA256 cookie (httpOnly, SameSite=lax)
- תוקף: 7 ימים
- ביטול: logout מוחק את ה-cookie וניתן לשחרר session ב-DB

---

## 4. אבטחת תשתית

### 4.1 Headers אבטחה (next.config.ts)
- Content-Security-Policy (CSP)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=(), geolocation=()
- HSTS: max-age=63072000 (production בלבד)

### 4.2 הצפנה
- תעבורה: TLS 1.2+ (Vercel CDN)
- אחסון DB: AES-256 (AWS/Supabase)
- אחסון קבצים: AES-256 (AWS S3)

### 4.3 Rate Limiting
- מצב נוכחי: in-memory, per-Vercel-instance
- ידוע כ-limitation: אינו גלובלי בפריסה multi-instance
- מתוכנן: שדרוג ל-Supabase-based rate limiting

---

## 5. אבטחת קוד

### 5.1 ספריות
- עדכוני אבטחה: `npm audit` כחלק מ-CI
- ניהול תלויות: package-lock.json מוגן

### 5.2 Secrets
- אין secrets בקוד מקור
- כל ה-secrets בסביבת Vercel (env vars)
- SUPABASE_SERVICE_ROLE_KEY — שרת בלבד, לעולם לא `NEXT_PUBLIC_`

### 5.3 SQL Injection
- כל שאילתות DB דרך Supabase client עם parameterized queries
- אין query building ידני מ-user input

---

## 6. ניטור ותגובה לאירועים

- **audit_logs**: כל פעולה מהותית נרשמת
- **Vercel logs**: logs סביבת runtime
- **תגובה לאירוע**: ראה INCIDENT_RESPONSE_PROCEDURE_HE.md (docs/legal-drafts/)

---

## 7. בדיקות אבטחה

| בדיקה | תדירות | אחראי | סטטוס |
|-------|--------|-------|--------|
| npm audit | כל build | CI | פעיל |
| בדיקת RLS | כל מיגרציה | Dev | פעיל |
| Penetration test | לפני מסחור מלא | חיצוני | **טרם בוצע** |
| בדיקת headers | כל deploy | Dev | פעיל |

**חשוב:** penetration test חיצוני טרם בוצע. אין להצהיר על אישור אבטחה חיצוני.

---

## 8. סטטוס MFA

MFA אינו מיושם בשלב MVP. ראה פרטים ב-MFA_IMPLEMENTATION_STATUS_HE.md.

---

## 9. ניהול מפתחות ו-Secrets

ראה: KEY_AND_SECRET_ROTATION_PROCEDURE_HE.md

---

*מסמך זה ייבדק ויעודכן לפחות אחת לשנה ובכל שינוי ארכיטקטורלי מהותי.*
