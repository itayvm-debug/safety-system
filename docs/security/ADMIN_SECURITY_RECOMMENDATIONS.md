# המלצות אבטחה — ניהול Auth, Session ו-Admin
> נוצר: 2026-07-15

---

## 1. מנגנון Session — ניתוח

### 1.1 מה קיים

```
SESSION_COOKIE_NAME = 'safedoc_session'
ROLE_COOKIE_NAME = 'safedoc_role'
COOKIE_MAX_AGE = 60 * 60 * 24 * 7  // 7 ימים
```

- **חתימה:** HMAC-SHA256 (Web Crypto API) — חזקה
- **Payload:** `{ userId, email, username, role, loginAt }`
- **Cookie flags:** HttpOnly ✅ | Secure (prod) ✅ | SameSite=Lax ✅
- **אין refresh token** — session תמיד 7 ימים
- **אין idle timeout** — session תקף גם אם לא נעשה שימוש

### 1.2 ממצאים

| # | ממצא | חומרה | המלצה |
|---|------|--------|--------|
| A-01 | אין idle timeout | בינונית | בעיה במחשב משותף — session פתוח 7 ימים גם ללא שימוש |
| A-02 | `loginAt` בפייעלואד — מספיק למעקב, אין `exp` (expiry) | נמוכה | HMAC מגביל תוקף דרך max-age; OK |
| A-03 | ROLE_COOKIE לא HttpOnly (כוונה) | נמוכה | מתועד ✅; UI בלבד |
| A-04 | אין revocation — session לא ניתן לביטול לפני תפוגה | בינונית | להוסיף jti/session_id ל-DB עתידי |
| A-05 | SESSION_SECRET — אם ישתנה, כל הsessions יפוגו | נמוכה | לתעד ב-runbook |
| A-06 | `is_active` נבדק בלוגין בלבד, לא בכל בקשה | בינונית | השבתת user נכנסת לתוקף רק בלוגין הבא |

### 1.3 המלצות Session

**A-06 (חשוב) — is_active blocking:**
כיום: `profiles.is_active = false` אינו חוסם session קיים.
**המלצה:** הוסף בדיקת `is_active` ב-`verifySession` או לפחות ב-`requireAuth/requireAdmin`.

**פיתרון מומלץ (ללא migration):**
```typescript
// ב-lib/auth/api.ts — בתוך requireAuth
const session = await getSession();
if (!session) return { error: 401 };

// בדיקת is_active מהDB (פעם בסשן — שמור ב-cache קצר)
// TODO: לשקול
```

**A-04 — session revocation:**
לשלב עתידי: הוסף `session_id` ל-payload ושמור ב-`active_sessions` table. logout מוחק את ה-row.

---

## 2. ניהול Admin — המלצות

### 2.1 הוספת/הסרת משתמשים

**תהליך נוכחי:** `/admin/users` → יצירת user ב-Supabase Auth + profiles.
**בעיה:** אין audit trail של שינויים.
**המלצה:** כשה-`auditLog` מוכן (שלב ו׳), לוגג `admin.user_create`, `admin.user_update`.

### 2.2 authorized_phones

**סיכון:** הוספה/הסרה של טלפון מורשה מאפשרת/שוללת גישה למערכת.
**כיום:** ניתן לשנות ישירות ב-Supabase Dashboard ללא audit trail.
**המלצה:**
- הוסף API admin route לניהול `authorized_phones`
- כל שינוי ירשם ב-audit_log
- שקול: לפחות 2 admins נדרשים לאישור (4-eyes principle) — עתידי

### 2.3 איפוס סיסמה

`/api/admin/users/[id]/reset-password` — requireAdmin ✅
אין audit trail.

### 2.4 MFA

כיום: **אין MFA** — רק שם משתמש + סיסמה.
לשלב עתידי: לשקול TOTP לחשבונות admin.

---

## 3. אבטחת ENV Variables

| משתנה | שימוש | סיכון אם דלף |
|--------|--------|-------------|
| `SESSION_SECRET` | חתימת sessions | גבוה מאוד — זיוף sessions |
| `SUPABASE_SERVICE_ROLE_KEY` | עקיפת RLS | **קריטי** — גישה מלאה ל-DB |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client auth | בינוני — RLS מגן |
| `CRON_SECRET` | אימות Vercel Cron | בינוני |
| `RESEND_API_KEY` | שליחת מיילים | בינוני — שליחת מיילים בשמנו |
| `ANTHROPIC_API_KEY` | AI extraction | בינוני — עלות $/בקשה |

**המלצות:**
- [ ] רוטציית `SESSION_SECRET` ו-`SUPABASE_SERVICE_ROLE_KEY` מדי שנה לפחות
- [ ] שמירת ENV Variables רק ב-Vercel (לא ב-`.env` ב-repo)
- [ ] בדיקה: האם יש secrets ב-git history? `git log -p | grep -i secret`

---

## 4. Session Expiry — בדיקה מהירה

```typescript
// lib/auth/session.ts — VerifySession
// הפונקציה אינה בודקת exp — max-age נאכף ע"י דפדפן
// לוגיקת "login at" + max-age = 7 ימים: OK
// כלול ב-payload: loginAt — ניתן לחסום sessions ישנים ידנית
```

**לשקול להוסיף ב-SessionPayload:**
```typescript
exp: Date.now() + COOKIE_MAX_AGE * 1000  // Unix timestamp תפוגה
```
וב-`verifySession`: בדיקת `payload.exp > Date.now()`.
זה מאפשר revocation של sessions גם אחרי שינוי max-age.

---

## 5. Security Headers — TODO

לאחר אישור, להוסיף ל-`next.config.ts`:

```typescript
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      // CSP — ראה SECURITY_AUDIT.md סעיף 6
    ],
  }];
}
```

**⚠️ לבדוק שה-headers לא שוברים PWA / camera functionality לפני deployment.**
