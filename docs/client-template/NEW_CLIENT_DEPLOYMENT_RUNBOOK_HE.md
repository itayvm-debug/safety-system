# ספר נהלי פריסה ללקוח חדש — SafeDoc
> תאריך: 2026-07-18 | גרסה: 1.0 | סיווג: פנימי

## סקירה כללית

כל לקוח של SafeDoc מקבל פריסה נפרדת לחלוטין:
- **פרויקט Supabase נפרד** (DB + Storage + Auth)
- **פרויקט Vercel נפרד** (Frontend + API)
- **Domain/URL ייחודי** (או subdomain)
- **ENV vars ייחודיים**

זמן הקמה ממוצע: 2-4 שעות

---

## שלב 1: איסוף מידע לקוח

מלא את `CLIENT_INFORMATION_FORM_HE.md` לפני תחילת ההקמה.

---

## שלב 2: הקמת Supabase

פרט ב-`SUPABASE_SETUP_CHECKLIST_HE.md`.

**סיכום:**
1. צור פרויקט Supabase חדש (region: ap-northeast-1 Tokyo)
2. שמור את `SUPABASE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`
3. הרץ migrations לפי `SQL_EXECUTION_ORDER_HE.md`
4. צור bucket `worker-files` (private)
5. צור משתמש admin ראשוני

---

## שלב 3: הקמת Vercel

פרט ב-`VERCEL_SETUP_CHECKLIST_HE.md`.

**סיכום:**
1. Fork / Deploy מ-repository
2. הגדר ENV vars (ראה `ENVIRONMENT_VARIABLES_CHECKLIST_HE.md`)
3. הגדר domain

---

## שלב 4: אימות Post-Deployment

פרט ב-`POST_DEPLOYMENT_TESTS_HE.md`.

**בדיקות מינימום:**
- [ ] `GET /api/health` → 200 ok
- [ ] `GET /api/admin/system-health` → database: ok, storage: ok
- [ ] כניסה עם משתמש admin
- [ ] יצירת עובד ניסיון
- [ ] העלאת קובץ ניסיון

---

## שלב 5: מסירה ללקוח

פרט ב-`CLIENT_HANDOVER_CHECKLIST_HE.md`.

---

## שלב 6: תיעוד

לאחר ההקמה, תעד:
- URL המערכת
- תאריך הקמה
- פרטי התקשרות לתמיכה
- גרסת SafeDoc שהותקנה
- שם פרויקט Supabase + Vercel

---

## אנשי קשר ותמיכה

| נושא | קשר |
|------|-----|
| בעיות טכניות | itayvm@gmail.com |
| Supabase Support | https://supabase.com/support |
| Vercel Support | https://vercel.com/support |
