# נספח אבטחת מידע — SafeDoc [SUPERSEDED]

> ⚠️ **SUPERSEDED — אין להשתמש במסמך זה.**
> **הגרסה העדכנית והמלאה נמצאת ב: `docs/legal-drafts/INFORMATION_SECURITY_APPENDIX_DRAFT_HE.md`**
> מסמך זה הוא גרסה ישנה ומוחזק לצורכי הפניה בלבד.

---

**⚠️ DRAFT — לסקירת עורך דין / מומחה אבטחה בלבד**

---

## 1. מצב אבטחה נוכחי

### 1.1 תשתית
- **אחסון:** Supabase (PostgreSQL + Object Storage) — private bucket
- **Hosting:** Vercel (Edge + Node.js runtime)
- **הצפנת תעבורה:** TLS 1.2+ (Vercel + Supabase מוגדרים כך כברירת מחדל)
- **הצפנת נתונים at-rest:** TODO: לאמת שהצפנה מופעלת ב-Supabase

### 1.2 אימות וגישה
- Session cookie מבוסס HMAC-SHA256 (Web Crypto API)
- תוקף session: 7 ימים
- גישה מוגבלת לטלפונים מורשים + סיסמה
- הגנת middleware לכל נתיבי ה-API
- הפרדה admin / user ברמת API + middleware

### 1.3 ניהול secrets
- כל סודות המערכת מאוחסנים ב-Vercel Environment Variables
- לא קיים `.env.local` ב-production
- SUPABASE_SERVICE_KEY אינו חשוף ל-client

## 2. בקרות אבטחה מיושמות

| בקרה | מצב | הערה |
|------|-----|-------|
| HTTPS / TLS | ✓ מיושם | Vercel אוכף |
| HttpOnly session cookie | ✓ מיושם | `lib/auth/session.ts` |
| SameSite=Lax cookie | ✓ מיושם | |
| Secure cookie flag | ⚠️ לאמת | רלוונטי ב-production |
| Private storage bucket | ✓ מיושם | worker-files |
| Signed URLs לקבצים | ✓ מיושם | TTL מוגבל |
| MIME validation בהעלאה | ✓ מיושם | רק jpg/png/pdf |
| גודל קובץ מקסימלי | ✓ מיושם | 10MB |
| Rate limiting | ❌ חסר | יוטפל בשלב יא׳ |
| Audit log | ❌ חסר | יוטפל בשלב ו׳ |
| Secure flag cookie | ⚠️ לאמת | |
| CSP headers | ❌ חסר | להוסיף |
| MFA | ❌ לא מיושם | MVP בלבד |
| IP whitelist | ❌ לא מיושם | שיקול עתידי |

## 3. בקרות ארגוניות

| בקרה | מצב | הערה |
|------|-----|-------|
| Incident Response Procedure | ⚠️ טיוטה | ראה INCIDENT_RESPONSE_PROCEDURE |
| Backup procedure | ⚠️ לאמת | Supabase Point-in-Time Recovery? |
| Disaster Recovery | ❌ לא מתועד | להשלים |
| Security training | ❌ לא מתועד | |
| Vendor security review | ⚠️ חלקי | Supabase, Vercel — SOC2? |
| Penetration test | ❌ לא בוצע | |
| Vulnerability scanning | ❌ לא בוצע | |

## 4. פערים ידועים לטיפול

1. **Rate limiting** — אין הגבלת קצב לכניסה, העלאה, ייצוא (שלב יא׳)
2. **Audit trail** — אין תיעוד פעולות משתמש (שלב ו׳)
3. **Cookie Secure flag** — לאמת שמוגדר ב-production
4. **CSP headers** — לא מוגדרים ב-`next.config.ts`
5. **Session timeout** — אין timeout אוטומטי (רק max-age 7 ימים)
6. **RLS** — כל ה-API routes משתמשים ב-service_role; RLS אינו קו ההגנה הראשי

## 5. תגובה לאירועי אבטחה

ראה INCIDENT_RESPONSE_PROCEDURE.

## 6. DPA עם ספקים

| ספק | SOC2 | DPA | הערה |
|-----|------|-----|-------|
| Supabase | TODO | TODO | לאמת |
| Vercel | TODO | TODO | לאמת |
| Resend | TODO | TODO | לחתום |

---
*מסמך זה מייצג מצב ראשוני. יש לעדכן לאחר security audit מלא (שלב ז׳).*
