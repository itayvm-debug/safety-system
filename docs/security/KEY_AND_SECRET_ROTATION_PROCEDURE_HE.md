# נוהל רוטציית מפתחות וסודות — SafeDoc
> תאריך: 2026-07-18 | גרסה: 1.0 | סיווג: פנימי — סודי

## 1. רשימת Secrets המנוהלים

| מפתח | מיקום | תדירות רוטציה | אחראי |
|------|-------|--------------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel Env | שנתית / חשד לחשיפה | מנהל |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel Env + קוד | שנתית | מנהל |
| `COOKIE_SECRET` / `SESSION_SECRET` | Vercel Env | שנתית / כל breach | מנהל |
| `RESEND_API_KEY` | Vercel Env | שנתית | מנהל |
| `ANTHROPIC_API_KEY` | Vercel Env | שנתית | מנהל |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel Env + קוד | רק בהעברת פרויקט | מנהל |

---

## 2. נוהל רוטציה — SUPABASE_SERVICE_ROLE_KEY

⚠️ מפתח זה מאפשר גישה מלאה ל-DB ועוקף RLS. חשיפתו = חשיפת כל הנתונים.

1. כנס לפרויקט ב-Supabase Dashboard → Settings → API
2. לחץ "Rotate service role key"
3. העתק את המפתח החדש (מוצג פעם אחת בלבד)
4. עדכן ב-Vercel Dashboard → Environment Variables
5. Redeploy (הפונקציות ה-serverless יטענו את המפתח החדש)
6. ודא שהמערכת פועלת: `GET /api/health` + `GET /api/admin/system-health`
7. תעד ב-לוג הרוטציה (סעיף 4)

---

## 3. נוהל רוטציה — COOKIE_SECRET

שינוי ה-COOKIE_SECRET מנתק את **כל** הסשנים הפעילים (כל המשתמשים יתנתקו).

1. צור secret חדש: `openssl rand -base64 64`
2. עדכן ב-Vercel → Environment Variables
3. Redeploy
4. הודע למשתמשים שעליהם להתחבר מחדש (אם מתוכנן)
5. תעד

---

## 4. נוהל רוטציה — RESEND_API_KEY

1. כנס ל-Resend Dashboard → API Keys
2. צור מפתח חדש
3. עדכן ב-Vercel
4. Redeploy
5. בדוק שאי-מייל נשלח (`GET /api/reports/weekly-status` ב-staging)
6. מחק את המפתח הישן ב-Resend

---

## 5. נוהל רוטציה דחופה (חשד לחשיפה)

1. **מיד**: בטל את המפתח הנוכחי (Supabase/Resend/Anthropic Dashboard)
2. **תוך 15 דקות**: צור מפתח חדש ועדכן ב-Vercel
3. **Redeploy מיידי** (production)
4. **בדוק audit_logs** לפעולות חשודות בתקופת החשיפה הפוטנציאלית
5. **תעד אירוע** ב-INCIDENT_RESPONSE_PROCEDURE_HE.md

---

## 6. לוג רוטציות

| תאריך | מפתח | סיבה | אחראי |
|-------|------|------|-------|
| 2026-07-18 | ראשון — setup | הקמת מערכת | itayvm |

---

## 7. אחסון ושיתוף Secrets

- **אסור**: שמירה ב-git, Slack, אימייל, קבצי .env שנכנסים ל-git
- **מותר**: Vercel Dashboard (encrypted at rest), Password Manager מוצפן
- **.gitignore**: ודא שקבצי `.env.local`, `.env.production` נמצאים ב-.gitignore

---

*מסמך זה סודי. יש להגביל גישה אליו לאנשים מורשים בלבד.*
