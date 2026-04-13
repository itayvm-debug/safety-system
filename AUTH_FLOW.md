# AUTH_FLOW.md — זרימת ההתחברות

## סקירה

המערכת **אינה** משתמשת ב-Supabase Phone Auth, OTP, או SMS.
ההתחברות מבוססת על רשימת מספרי טלפון מורשים בלבד.

---

## זרימה מלאה

```
משתמש מזין מספר טלפון
        │
        ▼
POST /api/auth/phone-login
        │
        ├── נרמול מספר לפורמט E.164 (+972...)
        │
        ├── בדיקה מול authorized_phones (service role — עוקף RLS)
        │       ├── לא קיים → 403 "מספר הטלפון אינו מורשה"
        │       └── קיים → ממשיך
        │
        ├── חיפוש auth user לפי email פנימי (user-972...@safedoc.internal)
        │       ├── לא קיים → admin.createUser(email, password, email_confirm: true)
        │       └── קיים → ממשיך
        │
        └── מחזיר { email, password } ללקוח
                │
                ▼
        supabase.auth.signInWithPassword(email, password)
                │
                ▼
        session JWT נשמר בדפדפן → redirect ל-/workers
```

---

## הקשר בין `authorized_phones` ל-`auth.users`

| טבלה | תפקיד | מנוהל |
|------|--------|--------|
| `authorized_phones` | רשימת מספרים מורשים (whitelist) | ידנית ב-Supabase Dashboard |
| `auth.users` | משתמשי Supabase עם session | אוטומטית בכניסה ראשונה |

**חשוב:** רשומה ב-`authorized_phones` לבדה אינה מספיקה.
בכניסה הראשונה של מספר חדש, השרת יוצר `auth user` אוטומטית.
ב-Supabase Dashboard ניתן לראות את המשתמשים תחת Authentication → Users.

---

## credentials פנימיים

לכל מספר טלפון נוצר זוג credentials קבועים ונגזרים:

```
email:    user-{digits}@safedoc.internal
password: safedoc_{digits}_auth
```

דוגמה למספר `+972538000993`:
```
email:    user-972538000993@safedoc.internal
password: safedoc_972538000993_auth
```

ה-credentials האלה **אינם נחשפים ל-UI** — הם מועברים בתשובת ה-API ומשמשים מיד לקריאת `signInWithPassword`.

---

## מגבלות ידועות (MVP)

1. **אין אימות דו-שלבי** — מי שיודע מספר טלפון מורשה יכול להתחבר.
2. **credentials נגזרים מהטלפון** — אם מספר דולף, ניתן לחשב את ה-password. יש לשנות אם המערכת תיחשף לאינטרנט הציבורי.
3. **אין ביטול session** — יציאה מהמערכת מנקה את הcookies בדפדפן, אך ה-token עדיין תקף עד פקיעתו.
4. **`listUsers` בכניסה** — כרגע הקוד קורא לכל רשימת המשתמשים כדי לבדוק קיום. בסביבה עם משתמשים רבים יש לשנות לחיפוש ישיר.

---

## שיפורים מומלצים לגרסה הבאה

- החלף credentials קבועים ב-`admin.generateLink` עם מגיע signed magic link
- הוסף rate limiting על `/api/auth/phone-login`
- שמור `auth_user_id` ב-`authorized_phones` לקישור ישיר במקום `listUsers`
