# רשימת בדיקות הקמת Supabase — SafeDoc
> לביצוע בעת הקמת פרויקט Supabase ללקוח חדש

## 1. יצירת פרויקט

- [ ] כנס ל-https://supabase.com/dashboard
- [ ] New Project
- [ ] שם: `safedoc-[שם-לקוח]` (אנגלית, ללא רווחים)
- [ ] Region: **ap-northeast-1 (Tokyo)** ← חשוב!
- [ ] רשום את ה-URL, anon key, service role key
- [ ] שמור את ה-database password במקום מאובטח

## 2. הרצת Migrations

הרץ SQL לפי הסדר המפורט ב-`SQL_EXECUTION_ORDER_HE.md`:

- [ ] migration ראשון: יצירת טבלאות בסיס
- [ ] migration שני: RLS policies
- [ ] migration שלישי: legal_acceptances + privacy_version
- [ ] ואלה הבאים לפי הסדר...

## 3. הגדרות Storage

- [ ] כנס ל-Storage
- [ ] New Bucket: שם `worker-files`
- [ ] **Public: OFF** (הכרחי!)
- [ ] אפשר upload לפחות 10MB per file
- [ ] הגדר MIME types: image/jpeg, image/png, image/webp, application/pdf

## 4. Auth הגדרות

- [ ] Authentication → Settings
- [ ] Site URL: URL הפרויקט שלך (Vercel)
- [ ] Email Confirm: **OFF** (המערכת משתמשת בסיסמה, לא confirmation)
- [ ] כבה OTP/Phone auth

## 5. RLS

ודא ש-RLS מופעל על כל הטבלאות העסקיות (ראה FINAL_RLS_MATRIX.md)

## 6. יצירת משתמש Admin ראשוני

```sql
-- הרץ ב-Supabase SQL Editor
-- 1. צור auth user ידנית דרך Supabase Dashboard → Auth → Users → Add User
-- 2. עדכן profile:
UPDATE profiles
SET role = 'admin', full_name = 'שם המנהל', is_active = true
WHERE email = 'admin@example.com';
```

## 7. שדרוג Pro (מומלץ לפני production)

- [ ] Supabase Dashboard → Settings → Billing → Upgrade to Pro
- [ ] Enable Point-in-Time Recovery
- [ ] ראה SUPABASE_PRO_UPGRADE_TRIGGER_HE.md

## 8. אימות

- [ ] `GET /api/admin/system-health` → database: ok, storage: ok
- [ ] כניסה עם admin ✓
- [ ] יצירת עובד ניסיון ✓
