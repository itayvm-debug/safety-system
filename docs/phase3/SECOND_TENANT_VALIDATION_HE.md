# אימות דייר שני — כללי הגנה על חברת Production

## מטרה

מסמך זה מגדיר את כללי ההגנה על החברה הקיימת ב-Production בעת ביצוע בדיקות ו-E2E לאחר הטמעת Phase 3 Batch 1.

---

## מקורות אמת להרשאות — סיכום

| מנגנון | טבלה | עמודה | מי בודק |
|--------|-------|-------|---------|
| Platform Admin | `profiles` | `role = 'admin'` | `requireAdmin()` / `requirePlatformAdmin()` ב-`lib/auth/api.ts` |
| Company Admin | `company_members` | `role IN ('admin','owner')` | `requireCompanyAdminRole()` ב-`lib/auth/company-context.ts` |

**`requirePlatformAdmin()`** — מיוצא מ-`lib/auth/api.ts`. בודק **רק** `profiles.role`. **לא** דורש שורה ב-`company_members`. זו ההפרדה הקריטית בין שני דומיינים של הרשאה.

---

## מטריצת הרשאות נתיבים

| נתיב | Guard | קובץ Guard | תלות ב-company_members |
|------|-------|------------|----------------------|
| `GET /api/admin/companies` | `requireAdmin()` | `lib/auth/api.ts` | **לא** |
| `POST /api/admin/companies` | `requireAdmin()` | `lib/auth/api.ts` | **לא** |
| `GET /api/admin/companies/[id]` | `requireAdmin()` | `lib/auth/api.ts` | **לא** |
| `PATCH /api/admin/companies/[id]` | `requireAdmin()` | `lib/auth/api.ts` | **לא** |
| `GET /api/admin/companies/[id]/members` | `requireAdmin()` | `lib/auth/api.ts` | **לא** |
| `POST /api/admin/companies/[id]/members` | `requireAdmin()` | `lib/auth/api.ts` | **לא** |
| `PATCH /api/admin/companies/[id]/members/[id]` | `requireAdmin()` | `lib/auth/api.ts` | **לא** |
| `DELETE /api/admin/companies/[id]/members/[id]` | `requireAdmin()` | `lib/auth/api.ts` | **לא** |
| `GET /api/companies/settings` | `requireCompanyAdminRole()` | `lib/auth/company-context.ts` | **כן** |
| `PATCH /api/companies/settings` | `requireCompanyAdminRole()` | `lib/auth/company-context.ts` | **כן** |
| `GET /api/companies/members` | `requireCompanyAdminRole()` | `lib/auth/company-context.ts` | **כן** |
| `POST /api/companies/members` | `requireCompanyAdminRole()` | `lib/auth/company-context.ts` | **כן** |
| `PATCH /api/companies/members/[id]` | `requireCompanyAdminRole()` | `lib/auth/company-context.ts` | **כן** |
| `DELETE /api/companies/members/[id]` | `requireCompanyAdminRole()` | `lib/auth/company-context.ts` | **כן** |

דפי UI (`/admin/companies/**`) — מוגנים על-ידי Middleware (בדיקת `session.role = 'admin'` מה-JWT). דפי API מוסיפים DB re-check.

---

## כלל הגנה מספר 1 — לא לבצע mutations על חברת Production

> **אסור לבצע כל פעולת כתיבה (INSERT / UPDATE / DELETE) על חברת Production בסביבת בדיקות.**

### הגדרת "חברת Production"

החברה הקיימת ב-Production היא החברה הראשונה שנוצרה לפני שלב Phase 3 (לפני הוספת multi-tenant). היא מזוהה ב-DB לפי `companies.created_at` הנמוך ביותר, או לפי ID ידוע שיש לתעד בקובץ `.env.test.local`:

```
TEST_SKIP_COMPANY_ID=<uuid-of-production-company>
```

### אכיפה בבדיקות E2E

כל fixture ב-Playwright שמבצע mutation חייב לכלול את הבדיקה הבאה:

```typescript
// playwright/fixtures/company.fixture.ts
import { TEST_COMPANY_ID } from './constants';
import { PRODUCTION_COMPANY_ID } from './constants';

// Safety guard — בכל fixture שמבצע mutation
if (companyId === PRODUCTION_COMPANY_ID) {
  throw new Error(
    `[SAFETY] Fixture attempted mutation on Production company (${PRODUCTION_COMPANY_ID}). ` +
    `Use TEST_COMPANY_ID instead.`
  );
}
```

### חברת הבדיקה

כל בדיקות E2E של Phase 3 Batch 1 פועלות על חברה נפרדת שנוצרת לצורך הבדיקות בלבד:

- נוצרת על-ידי Platform Admin דרך `POST /api/admin/companies` בתחילת Suite
- מוגדרת כ-`TEST_COMPANY_ID` בסביבת הבדיקה
- נמחקת (או מסומנת is_active=false) בסיום Suite

---

## כלל הגנה מספר 2 — Platform Admin אינו Company Admin

המנגנון `requirePlatformAdmin()` (בעבר: alias שגוי ל-`requireCompanyAdmin()`) תוקן ב-Phase 3 Batch 1:

- **לפני התיקון**: `requirePlatformAdmin = requireCompanyAdmin` — דרש שורה ב-`company_members`. Platform admin ללא membership בחברה היה מקבל 403.
- **אחרי התיקון**: `requirePlatformAdmin = requireAdmin` (מ-`lib/auth/api.ts`) — בודק **רק** `profiles.role = 'admin'`. לא תלוי ב-`company_members`.

השגיאה המקורית:
```typescript
// company-context.ts — הוסר
export const requirePlatformAdmin = requireCompanyAdmin; // ← WRONG: needed company membership
```

התיקון:
```typescript
// api.ts — הוסף
export const requirePlatformAdmin = requireAdmin; // ← CORRECT: profiles.role only
```

---

## כלל הגנה מספר 3 — companyId לעולם לא מגיע מהבקשה

כל route תחת `/api/companies/**` מקבל את `companyId` מה-Context של `requireCompanyAdminRole()` — לא מה-body, לא מה-headers, לא מה-URL params (אלא אם כן ה-URL param מוצלב עם ה-Context).

```typescript
// WRONG — לעולם לא לעשות זאת
const { company_id } = await request.json();
await supabase.from('workers').select().eq('company_id', company_id);

// CORRECT
const { context, error } = await requireCompanyAdminRole();
await supabase.from('workers').select().eq('company_id', context.companyId);
```

---

## כלל הגנה מספר 4 — first_admin_user_id לא מקנה Platform Admin

כאשר Platform Admin יוצר חברה חדשה עם `first_admin_user_id`:

1. נוצרת שורה ב-`company_members` עם `role = 'admin'` — **הרשאת חברה בלבד**
2. **לא** מתבצע שינוי ב-`profiles.role` של המשתמש שנקבע כמנהל ראשון
3. המשתמש שנקבע נשאר `profiles.role = 'user'` — מנהל חברה, לא Platform Admin

```typescript
// route.ts — הפעולה היחידה על המשתמש החדש
await supabase.from('company_members').insert({
  company_id: company.id,
  user_id: adminUserId,
  role: 'admin',      // ← company_members.role — NOT profiles.role
  is_active: true,
});
// profiles.role אינו נגעת — לעולם
```

---

## בדיקות קיימות הרלוונטיות לאימות

| # | תיאור | קובץ |
|---|-------|------|
| T1-T3 | Platform admin יכול לגשת ל-/api/admin/companies | `auth-boundary.isolation.test.ts` |
| T4 | Company Admin A מקבל 403 מ-/api/admin/companies | `auth-boundary.isolation.test.ts` |
| T5 | Company Admin B מקבל 403 | `auth-boundary.isolation.test.ts` |
| T6 | משתמש רגיל מקבל 403 | `auth-boundary.isolation.test.ts` |
| T7 | Company Admin ניגש להגדרות חברה שלו | `auth-boundary.isolation.test.ts` |
| T8 | לא ניתן לתת role='owner' או 'platform_admin' | `auth-boundary.isolation.test.ts` |
| T9 | מנהל ראשון מקבל הרשאת חברה בלבד | `auth-boundary.isolation.test.ts` |
| T10 | Multi-membership → 403 | `auth-boundary.isolation.test.ts` + `company-context.isolation.test.ts` |
| — | requireCompanyAdmin בלי Platform role → 403 | `company-context.isolation.test.ts` |
| — | Multi-membership fails safely | `lib/company/__tests__/isolation.test.ts` (Scenario 11) |
| — | Cross-company member access → 404 | `app/api/companies/__tests__/members.isolation.test.ts` |
