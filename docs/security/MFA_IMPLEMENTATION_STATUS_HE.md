# סטטוס יישום MFA — SafeDoc
> תאריך: 2026-07-18 | גרסה: 1.0 | סיווג: פנימי

## 1. סטטוס נוכחי

**MFA אינו מיושם ב-SafeDoc MVP.**

גרסה נוכחית: 1.0.0
תאריך הערכה: 2026-07-18

---

## 2. ניתוח טכני — מדוע לא יושם

### 2.1 ארכיטקטורת Authentication הנוכחית

```
POST /api/auth/login
  ↓
supabase.auth.signInWithPassword(username, password)
  ↓
[תגובה מיידית: session token]
  ↓
יצירת HMAC session cookie
  ↓
redirect → /dashboard
```

### 2.2 בעיית MFA עם ארכיטקטורה נוכחית

ב-Supabase, כאשר MFA מופעל ומשתמש עבר שלב ראשון בלבד, הפונקציה `signInWithPassword` מחזירה:
```json
{ "session": null, "data": { "session": null, "user": null }, "error": { "code": "MFA_REQUIRED" } }
```

הקוד הנוכחי מטפל ב-"session מיידית" ולא ב-"session חלקית" (pending MFA).
נדרש:
- מצב session ביניים ("MFA_PENDING")
- דף TOTP נפרד (`/login/mfa`)
- supabase.auth.mfa.challenge() + supabase.auth.mfa.verify()
- עדכון middleware לטיפול ב-session חלקית

### 2.3 סיכון מיישום חלקי

יישום חלקי של MFA (ללא handling מלא) עלול ליצור:
- bypass של MFA
- session ב-state לא מוגדר
- נזק לחוויית המשתמש

---

## 3. תכנון יישום עתידי

### 3.1 דרישות עיצוב

1. **TOTP** (Authenticator App — Google Authenticator, Authy)
2. עמוד `GET /login/mfa` — הזנת קוד TOTP
3. Session state machine: `LOGIN_PENDING → MFA_VERIFIED → AUTHENTICATED`
4. Enrollment flow: `/admin/profile/mfa-setup`
5. Recovery codes: מחוץ לתחום ה-MVP

### 3.2 תלויות נדרשות

- `@supabase/supabase-js` 2.x (כבר קיים) — תומך ב-MFA API
- ממשק משתמש חדש — 1-2 ימי עבודה

### 3.3 הערכת זמן

- 3-5 ימי עבודה עבור יישום, בדיקה ו-UI מלאים

---

## 4. אמצעי פיצוי בהיעדר MFA

| אמצעי | סטטוס | אפקטיביות |
|-------|-------|----------|
| HMAC session cookies (httpOnly) | פעיל | גבוהה |
| SameSite=lax (CSRF mitigation) | פעיל | בינונית |
| Rate limiting על login | פעיל (in-memory) | נמוכה-בינונית |
| Audit log לכל login/logout | פעיל | ניטור בלבד |
| הגבלת גישה למורשים בלבד | פעיל | גבוהה |
| Security headers (HSTS, CSP) | פעיל | בינונית |

---

## 5. החלטה

**החלטה**: לא ליישם MFA ב-MVP בשל מורכבות הארכיטקטורה.
**המלצה**: ליישם MFA לפני הרחבה לפרויקטים קריטיים או דרישת לקוח.
**שינוי גדול אחראי ל-MFA**: itayvm@gmail.com

---

*מסמך זה יעודכן בעת השלמת יישום MFA.*
