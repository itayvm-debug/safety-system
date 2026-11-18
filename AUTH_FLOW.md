# AUTH_FLOW.md — זרימת ההתחברות

עודכן: 2026-11-18. מקור האמת הוא הקוד: `app/api/auth/login/route.ts`, `lib/auth/session.ts`, `middleware.ts`, `lib/auth/company-context.ts`.

## סקירה

- התחברות בשם משתמש **או** מייל + סיסמה. אין התחברות בטלפון, OTP או SMS.
- הסיסמה נבדקת מול Supabase Auth בצד השרת בלבד. הדפדפן לא מקבל טוקן של Supabase.
- אחרי הבדיקה השרת מנפיק cookie חתום משלו (`safedoc_session`), וכל גישה לנתונים עוברת בשרת עם service role.
- מסלולי הטלפון הישנים (`/api/auth/phone-login`, `/api/auth/check-phone`) **הוסרו** (2026-11-18). הטבלה `authorized_phones` נעולה לשרת בלבד ואינה חלק מההתחברות. החשבון הישן היחיד מסוג `@safedoc.internal` נחסם.

## זרימה

```
POST /api/auth/login  { identifier, password }
  │
  ├─ הגבלת קצב לפי IP: 10 ניסיונות / 15 דק'           → 429
  ├─ שדות ריקים                                         → 401 (הודעה גנרית)
  ├─ הגבלת קצב לפי חשבון: 10 ניסיונות / 15 דק'          → 429
  │    (מפתח = hash של המזהה; נבדק גם למזהה לא קיים, כדי לא לחשוף אילו חשבונות קיימים)
  │
  ├─ מזהה בלי @ → חיפוש username ב-profiles (service role) → מייל
  │    לא נמצא                                           → 401 (הודעה גנרית, השהיה 500ms)
  │
  ├─ supabase.auth.signInWithPassword(email, password)   ← anon key, בשרת בלבד
  │    נכשל                                              → 401 (הודעה גנרית, השהיה 500ms)
  │
  ├─ profiles: role + is_active
  │    חסר → 401 ;  is_active=false                      → 403 "המשתמש הושבת"
  │
  └─ תשובה + cookies:
       safedoc_session   HMAC, httpOnly, 7 ימים — תוקף נאכף גם בשרת (loginAt)
       role cookie       לתצוגה בלבד; השרת לא סומך עליו
       consent cookie    רק אם קיימת הסכמה לגרסת התנאים הנוכחית ב-DB
       active company    נקבע אוטומטית אם יש חברות פעילה אחת; אחרת נמחק → /select-company
       audit_logs        action = login
```

## אחרי ההתחברות

- **middleware** — כל נתיב שאינו ברשימת `PUBLIC` דורש session תקף. API בלי session → 401, דף → הפניה ל-`/login`.
- **הקשר חברה** — `getCurrentCompanyContext()` / `requireCompanyAdminRole()` בודקים ב-DB בכל בקשה: profile פעיל, membership פעיל, חברה פעילה. `company_id` נלקח מה-session, אף פעם לא מהלקוח.
- **אדמין פלטפורמה** — `requirePlatformAdmin` בודק את `profiles.role` ב-DB, לא את ה-cookie.
- **Cron** — נתיבי cron ברשימת `PUBLIC` ומאומתים ב-`CRON_SECRET` (Bearer, השוואה בזמן קבוע; נדחה אם הסוד חסר).

## שכבת ה-DB

- ל-`anon` ול-`authenticated` אין אף הרשאה על טבלאות, sequences או פונקציות ב-`public`, וגם ברירת המחדל לאובייקטים חדשים סגורה (2026-11-18).
- ה-anon key משמש רק ל-`signInWithPassword` (Auth API). גם מי שמשיג בעצמו טוקן של Supabase עם הסיסמה שלו לא יכול לקרוא טבלאות.
- `safedoc_health_check()` בודק את זה כל יום (`/api/maintenance/daily`) ושולח מייל לאדמיני הפלטפורמה אם משהו נפתח.

## מגבלות ידועות

1. **אין אימות דו-שלבי** — החלטה פתוחה (HANDOFF).
2. **אין ביטול session מיידי ביציאה** — היציאה מוחקת את ה-cookie בדפדפן, אבל עותק שלו תקף עד 7 ימים מההתחברות. מחייב טבלת sessions — החלטה פתוחה 1.
3. **הגבלת הקצב נכשלת פתוח** אם ה-DB לא זמין: הבקשה מאושרת, נכתב `console.error`, והבדיקה היומית מתריעה אם הפונקציה חסרה.
4. **הגבלה לפי חשבון ניתנת לניצול לחסימה זמנית** של משתמש (10 ניסיונות כושלים בשמו) — עד 15 דקות. חלון מכוון.
5. **Leaked Password Protection** של Supabase כבוי (זמין בתוכנית בתשלום) — החלטה פתוחה.
