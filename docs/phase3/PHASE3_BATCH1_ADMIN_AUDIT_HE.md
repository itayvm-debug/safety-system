# SafeDoc — Phase 3 Batch 1: Platform Administration & Company Onboarding

**תאריך:** 2026-08-03  
**גרסה:** 1.0  
**סטטוס:** הושלם — ממתין לאישור

---

## סקירה כללית

Phase 3 Batch 1 מוסיף שכבת Platform Administration מלאה ומאפשר Onboarding של חברות נוספות במערכת.  
הבנייה מתבססת על הסכמה הקיימת (**אין שינויי סכמה**) ומתקנת שלושה ממצאים ארכיטקטוניים שזוהו ב-Phase 2.

---

## ממצאי ה-Audit שהניעו את Phase 3

### ממצא A: `requireCompanyAdmin()` — שם מטעה

**בעיה:** הפונקציה בודקת `platformRole === 'admin'` (הרשאת פלטפורמה), לא `companyRole`. מנהל חברה עם `company_members.role='admin'` אך `profiles.role='user'` לא יכול להשתמש בה.

**תיקון:**
- `requireCompanyAdmin()` — נשאר כשהיה לתאימות לאחור (בודק platformRole)
- `requirePlatformAdmin()` — alias מפורש לאותה בדיקה
- `requireCompanyAdminRole()` — **חדש** — בודק `company_members.role IN ('admin','owner')`

### ממצא B: `getCurrentCompanyContext()` — בחירה שקטה של חברה שגויה

**בעיה:** קוד קודם השתמש ב-`.limit(1).single()` — אם למשתמש יש 2 חברויות פעילות, `.limit(1)` בוחרת אחת שרירותית, ה-context ייגזר מהחברה הלא-נכונה.

**תיקון:** שליפת כל החברויות הפעילות, ספירה ובדיקה:
- 0 חברויות → 403 "אין שיוך חברה פעיל"
- >1 חברויות → 403 "משויך למספר חברות — נדרש מתג חברה"
- בדיוק 1 → ממשיך כרגיל

### ממצא C: `company_members.role` לא נאכף ב-API

**בעיה:** שדה ה-role שמור ב-DB אך לא נאכף על-ידי שום route guard. כל API route שדורש admin בדק `profiles.role`, לא את התפקיד ברמת החברה.

**תיקון:** `requireCompanyAdminRole()` — route guard חדש לכל פעולות מנהל-חברה.

---

## ארכיטקטורת מודל ההרשאות לאחר Phase 3

```
profiles.role = 'admin'        → Platform Admin  (platform-wide ops)
profiles.role = 'user'         → Regular user

company_members.role = 'owner' → Company owner   (all company ops)
company_members.role = 'admin' → Company admin   (most company ops)
company_members.role = 'member'→ Regular member  (read + own data)
```

**Rule:** Platform Admin routes (`/api/admin/*`) use `requireAdmin()` — no company context needed.  
**Rule:** Company Admin routes (`/api/companies/*`) use `requireCompanyAdminRole()` — company context derived from session.

---

## קבצים שנוצרו / שונו

### Auth Layer
| קובץ | שינוי |
|------|-------|
| `lib/auth/company-context.ts` | תיקון multi-membership, הוספת `requirePlatformAdmin`, `requireCompanyAdminRole` |

### Platform Admin API Routes (דורשים `profiles.role='admin'`)
| קובץ | תיאור |
|------|-------|
| `app/api/admin/companies/route.ts` | GET list + POST create |
| `app/api/admin/companies/[id]/route.ts` | GET + PATCH (כולל is_active toggle) |
| `app/api/admin/companies/[id]/members/route.ts` | GET list + POST add member |
| `app/api/admin/companies/[id]/members/[memberId]/route.ts` | PATCH role/status + DELETE |

### Company Admin API Routes (דורשים `company_members.role IN ['admin','owner']`)
| קובץ | תיאור |
|------|-------|
| `app/api/companies/settings/route.ts` | GET + PATCH הגדרות חברה עצמית |
| `app/api/companies/members/route.ts` | GET list + POST add by email |
| `app/api/companies/members/[memberId]/route.ts` | PATCH + DELETE (הגנות: no-self, no-last-member) |

### UI Pages
| קובץ | תיאור |
|------|-------|
| `app/admin/companies/page.tsx` + `CompaniesClient.tsx` | רשימת חברות + יצירה |
| `app/admin/companies/[id]/page.tsx` + `CompanyDetailClient.tsx` | פרטי חברה + עריכה |
| `app/admin/companies/[id]/members/page.tsx` + `MembersClient.tsx` | ניהול חברים |
| `app/admin/companies/[id]/settings/page.tsx` + `SettingsClient.tsx` | עריכת הגדרות |
| `app/admin/layout.tsx` | הוספת sub-navigation |
| `components/AdminSubNav.tsx` | טאבי ניווט admin (חדש) |
| `components/NavBar.tsx` | הוספת קישור "חברות" לאדמינים |

### SQL Files
| קובץ | תיאור |
|------|-------|
| `supabase/phase3_batch1_platform_admin_preview.sql` | בדיקת סכמה לפני deploy (read-only) |
| `supabase/phase3_batch1_platform_admin.sql` | קובץ מיגרציה — no-op (אין שינויי סכמה) |
| `supabase/phase3_batch1_post_failure_check.sql` | בדיקת בריאות לאחר deploy (read-only) |

### Tests
| קובץ | תיאור |
|------|-------|
| `app/api/admin/companies/__tests__/route.isolation.test.ts` | auth boundary, create, slug uniqueness |
| `app/api/admin/companies/[id]/members/__tests__/route.isolation.test.ts` | member list, add, last-member guard |
| `app/api/companies/__tests__/settings.isolation.test.ts` | company admin role guard, GET, PATCH validation |
| `app/api/companies/__tests__/members.isolation.test.ts` | role guard, add by email, self-add, self-remove, last-member |
| `lib/auth/__tests__/company-context.isolation.test.ts` | multi-membership error, requireCompanyAdminRole, alias |

---

## פרוטוקול אבטחה — Platform Admin Routes

1. **כל** route תחת `/api/admin/companies/` מתחיל ב-`requireAdmin()` (DB re-check)
2. הנתיבים האלה משתמשים ב-`requireAdmin()` מ-`lib/auth/api.ts` — אינם צריכים company context
3. **לעולם לא מאמינים ל-`companyId` שמגיע מה-Body** — ה-companyId מה-URL params הוא param בלבד, לא authorization scope. הנתיב בודק שהחברה קיימת.
4. ה-middleware בודק session.role=admin לנתיבי `/admin/*` לפני שמגיעים ל-route handler

## פרוטוקול אבטחה — Company Admin Routes

1. **כל** route תחת `/api/companies/` מתחיל ב-`requireCompanyAdminRole()`
2. `requireCompanyAdminRole()` → `getCurrentCompanyContext()` → `companyId` נגזר מ-Session, לא מה-Client
3. כל פעולה על members מבצעת `.eq('company_id', context.companyId)` — חוסמת cross-tenant
4. הגנות נוספות: לא ניתן לשנות role של עצמך, לא ניתן להסיר את עצמך, לא ניתן להסיר חבר אחרון

---

## מגבלות שנותרו ל-Phase 3 Batch 2

1. **Company Switcher**: משתמש עם >1 חברויות פעילות מקבל 403 כרגע. נדרש UI לבחירת חברה.
2. **Invitations**: הזמנת משתמשים חדשים (שאין להם עדיין profile) לחברה — נדרש טבלת invitations.
3. **Company Admin UI**: ה-UI לחברה עצמית (`/api/companies/settings`, `/api/companies/members`) ממומש כ-API בלבד — נדרש UI עבור company admins (לא platform admins).
4. **Settings wiring**: הגדרות הברנדינג (primary/secondary/accent colors) עדיין לא מחוברות ל-CSS variables ב-UI.
5. **Role elevation guard**: Platform Admin יכול להעניק לעצמם `owner` role בחברה כלשהי דרך `/api/admin/companies/[id]/members` — זה עיצוב מכוון (admin יכול הכל), אך יש לתעד.
