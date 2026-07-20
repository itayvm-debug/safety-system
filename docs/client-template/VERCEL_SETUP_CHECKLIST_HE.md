# רשימת בדיקות הקמת Vercel — SafeDoc
> לביצוע בעת הקמת פרויקט Vercel ללקוח חדש

## 1. יצירת פרויקט

- [ ] כנס ל-https://vercel.com/dashboard
- [ ] Import Git Repository
- [ ] בחר `safety` repository (או fork ייחודי)
- [ ] שם הפרויקט: `safedoc-[שם-לקוח]`
- [ ] Framework: Next.js (זיהוי אוטומטי)
- [ ] Root Directory: `safety/` (אם נדרש)

## 2. הגדרת ENV Variables

הגדר את כל המשתנים מ-`ENVIRONMENT_VARIABLES_CHECKLIST_HE.md`:

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` (סמן כ-Secret)
- [ ] `COOKIE_SECRET` (סמן כ-Secret)
- [ ] `RESEND_API_KEY` (אם נדרש)
- [ ] `REPORT_TO_EMAIL`
- [ ] `NEXT_PUBLIC_APP_URL`
- [ ] כל משתני `NEXT_PUBLIC_CUSTOMER_*`

## 3. Deploy ראשון

- [ ] Trigger manual deploy מ-main branch
- [ ] בדוק Build Logs — אין שגיאות
- [ ] בדוק `GET /api/health` → 200

## 4. הגדרות Domain

**אם ל-subdomain:**
- [ ] Vercel → Settings → Domains → Add
- [ ] הוסף CNAME ב-DNS של הדומיין הראשי

**אם ל-custom domain:**
- [ ] הוסף A record לכתובת Vercel
- [ ] המתן להפצת DNS (עד 24 שעות)

## 5. Cron Jobs

Vercel יפעיל אוטומטית את הCron מ-`vercel.json`:
- Sunday 07:00 UTC → `/api/reports/weekly-status`
- [ ] ודא שה-Cron מופיע ב-Vercel Dashboard → Settings → Cron Jobs

## 6. Auth URL ב-Supabase

- [ ] חזור ל-Supabase → Auth → URL Configuration
- [ ] עדכן Site URL ל-URL החדש של Vercel
- [ ] הוסף לרשימת Allowed Redirect URLs

## 7. אימות סופי

- [ ] `GET /api/health` → ok
- [ ] `GET /api/admin/system-health` → כל checks: ok
- [ ] Login עם admin
- [ ] HTTPS פעיל ✓
- [ ] Headers אבטחה פעילים (בדוק ב-securityheaders.com)
