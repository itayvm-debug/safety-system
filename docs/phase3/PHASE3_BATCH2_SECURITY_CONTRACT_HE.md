# Phase 3 Batch 2 — חוזה אבטחה: Multi-Membership

## עקרונות בלתי ניתנים לשינוי

1. **Never trust company_id from browser** — ה-cookie `safedoc_active_company` הוא רמז בלבד. לפני כל שאילתת DB מוגנת, ה-server מאמת ש-`user_id + company_id` קיימים ב-`company_members` עם `is_active=true`.

2. **הפרדת תפקידים**: `profiles.role` = הרשאה ברמת פלטפורמה בלבד. `company_members.role` = הרשאה ברמת חברה. `requireCompanyAdminRole` אינה בודקת `profiles.role` לעולם.

3. **Platform admin — מגבלת חברות**: platform admins (`profiles.role='admin'`) רשאים להשתייך לכמה חברות. Regular users מוגבלים לחברה אחת (נאכף ב-business logic בעת יצירת חברה).

4. **Company admin invariant**: אדמין חברה (`company_members.role IN ['admin','owner']`) עם `profiles.role='user'` חייב לבצע את כל פעולות ניהול החברה הרגילות. `requireCompanyAdminRole` מבוססת רק על `company_members.role`.

5. **הפעלת חברה**: חברה נוצרת תמיד עם `is_active=false` ומופעלת רק לאחר הכנסת membership ראשון. המטרה: אין חברה פעילה ללא בעלים.

---

## API Security Boundary

### `GET /api/session/companies`
- **מי**: כל user עם session תקף
- **מה**: מחזיר רק חברות עם `is_active=true` שה-user הוא member פעיל בהן
- **לא מחזיר**: settings, כתובות, נתוני הגדרות, נתוני platform

### `POST /api/session/company`
- **מי**: כל user עם session תקף
- **מה**: מגדיר cookie לחברה שצוינה
- **validation**: server מאמת `company_members` — לא מסתמך על ה-body בלבד
- **אינו**: מגדיר הרשאות, משנה DB

### `DELETE /api/session/company`
- **מי**: כל user עם session תקף
- **מה**: מוחק cookie — לא משנה DB

---

## Cookie Security Properties

| Cookie | httpOnly | JS-accessible | ניתן לזיוף? |
|--------|----------|---------------|-------------|
| `safedoc_session` | ✓ | ✗ | לא — HMAC-SHA256 |
| `safedoc_role` | ✗ | ✓ | כן — display only |
| `safedoc_active_company` | ✓ | ✗ | לא רלוונטי — server מאמת membership |

**`safedoc_role`** ניתן לזיוף בידי המשתמש אך משמש לתצוגה בלבד (NavBar). כל הרשאה אמיתית מגיעה מ-DB.

**`safedoc_active_company`** אינו יכול להיות מוגדר ע"י JavaScript (httpOnly). גם אם היה — הוא רק "רמז" שה-server מאמת לפני שימוש.

---

## Test Isolation Contract

כל mutation E2E מיועדת ל-Company B (tenant לבדיקות) בלבד.  
אם `company_id === TEST_SKIP_COMPANY_ID` (Company A) — הטסט מופסק.  
Platform admin רשאי להיות member בכמה חברות; regular user — חברה אחת בלבד.
