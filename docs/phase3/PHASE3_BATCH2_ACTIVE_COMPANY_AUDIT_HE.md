# Phase 3 Batch 2 — ביקורת קוד: Active Company Context

## סיכום

**באג קריטי**: כל משתמש עם יותר ממנוי חברה אחד נחסם על ידי `getCurrentCompanyContext()` עם שגיאת 403.  
**פתרון**: cookie httpOnly `safedoc_active_company` + מנגנון בחירת חברה (`/select-company`).  
**הסטטוס ב-DB**: אין שינויים — פתרון מבוסס cookie בלבד, ללא migration.

---

## 1. קובץ הבאג המקורי: `lib/auth/company-context.ts` שורות 71–79

```typescript
// לפני (Batch 1):
if (memberships.length > 1) {
  return {
    context: null,
    error: NextResponse.json(
      { error: 'משתמש משויך למספר חברות — נדרש מתג חברה שטרם הוטמע. פנה לתמיכה.' },
      { status: 403 }
    ),
  };
}
```

כל platform-admin שנוסף כ-owner של חברה חדשה הפך ל-blocked לחלוטין.

---

## 2. קבצים שנסרקו בביקורת

| קובץ | ממצא |
|------|------|
| `lib/auth/company-context.ts` | שורש הבאג — מחסום קשיח ל-2+ memberships |
| `lib/auth/session.ts` | cookie names: `safedoc_session` (httpOnly), `safedoc_role` (לא httpOnly) |
| `lib/auth/api.ts` | `requireAuth`, `requireAdmin`, `requirePlatformAdmin` — בסדר |
| `middleware.ts` | בודק session + consent + admin; לא בודק company context |
| `app/api/auth/login/route.ts` | לא מגדיר active-company cookie |
| `app/api/auth/logout/route.ts` | מוחק 3 cookies — לא active-company (באג) |
| `app/dashboard/page.tsx` | `if (ctxResult.error) redirect('/login')` — לא מבדיל multi-membership |
| `app/archive/page.tsx` | אותה בעיה |
| `app/issues/page.tsx` | אותה בעיה |
| `app/subcontractors/page.tsx` | אותה בעיה |
| `app/vehicles/[id]/page.tsx` | אותה בעיה |
| `app/vehicles/new/page.tsx` | אותה בעיה |
| `components/NavBar.tsx` | אין תצוגת שם חברה, אין מתג חברות |

---

## 3. תלויות auth guards

```
getCurrentCompanyContext() ← requireCompanyMember (alias)
                           ← requireCompanyAdminRole
```

**קבצים שמשתמשים ב-`getCurrentCompanyContext` ישירות** (14 קבצים):
- `app/api/alerts/route.ts`
- `app/api/entity-notes/[id]/route.ts` + `route.ts`
- `app/api/lifting-machine-appointments/route.ts`
- `app/api/manager-licenses/[id]/route.ts` + `route.ts`
- `app/api/professional-licenses/[id]/route.ts` + `route.ts`
- `app/api/signed-url/route.ts`
- `app/api/subcontractors/[id]/route.ts` + `route.ts`
- `app/api/vehicle-insurances/[id]/route.ts` + `route.ts`
- `app/api/vehicle-licenses/[id]/route.ts` + `route.ts`
- `app/api/vehicles/[id]/route.ts` + `route.ts`
- `app/api/workers/[id]/route.ts` + `route.ts`
- 6 דפי server-components (dashboard, archive, issues, subcontractors, vehicles/[id], vehicles/new)

---

## 4. החלטות ארכיטקטורה

| שאלה | החלטה | הנמקה |
|------|--------|--------|
| היכן שומרים את ה-company הנבחרת? | cookie httpOnly `safedoc_active_company` | בטוח, לא נגיש ל-JS, 7 ימים |
| האם לשנות את signature של `getCurrentCompanyContext`? | לא — רק מוסיפים שדה `code` לסוג השגיאה | תאימות לאחור לכל ה-API routes |
| כיצד ה-pages מנתבות multi-membership? | `code === 'NEEDS_COMPANY_SELECTION'` → `/select-company` | ברור, type-safe |
| האם נדרש DB migration? | לא | cookie-based בלבד |
| platform admin — מגבלת חברות? | אין — מותר להשתייך לכמה חברות | spec קיים |

---

## 5. תיאור השינויים שבוצעו

1. **`lib/auth/active-company.ts`** — נוצר: `ACTIVE_COMPANY_COOKIE_NAME`, `getActiveCompanyId()`
2. **`lib/auth/company-context.ts`** — נכתב מחדש: רזולוציית 0/1/2+ memberships + `code` field
3. **`app/api/session/companies/route.ts`** — נוצר: GET רשימת חברות + activeCompanyId
4. **`app/api/session/company/route.ts`** — נוצר: POST הגדרת חברה פעילה, DELETE ניקוי
5. **`app/api/auth/logout/route.ts`** — נוסף: מחיקת `safedoc_active_company` cookie
6. **`app/api/auth/login/route.ts`** — נוסף: auto-set cookie עבור single membership
7. **`app/select-company/page.tsx`** + **`SelectCompanyClient.tsx`** — נוצרו
8. **`components/NavBar.tsx`** — נוסף: תצוגת שם חברה + מתג חברות
9. **6 דפים** — תוקן: redirect ל-`/select-company` במקום `/login` ל-NEEDS_COMPANY_SELECTION
