# Phase 3 Batch 2 — ארכיטקטורת Active Company Context

## עקרון היסוד

**Company ID אף פעם אינו מגיע מהדפדפן.** ה-server תמיד מאמת שה-user הוא member פעיל בחברה לפני שמשתמש ב-company_id לשאילתות DB.

---

## Cookie `safedoc_active_company`

| מאפיין | ערך |
|--------|-----|
| שם | `safedoc_active_company` |
| ערך | UUID של חברה |
| httpOnly | `true` — לא נגיש ל-JavaScript |
| sameSite | `lax` |
| maxAge | 7 ימים |
| אימות | Server תמיד מאמת membership לפני שימוש |

**חשוב**: ה-cookie מאוחסן בדפדפן אבל **אינו מהווה הרשאה** — הוא רק "רמז" לאיזו חברה לטעון. האימות תמיד מתבצע מול `company_members` ב-DB.

---

## אלגוריתם רזולוציית חברה (`getCurrentCompanyContext`)

```
session → getSession()
  ↓ null → NO_SESSION (401)

profiles → is_active check
  ↓ inactive/null → INACTIVE_PROFILE (403)

company_members → filter by user_id + is_active=true
  ↓ 0 results → NO_MEMBERSHIP (403)
  ↓ 1 result  → auto-select (no cookie needed)
  ↓ 2+ results:
      getActiveCompanyId() → read safedoc_active_company cookie
        ↓ null or not in memberships → NEEDS_COMPANY_SELECTION (403)
        ↓ matches membership → use that membership

companies → select by membership.company_id + is_active=true
  ↓ null → INACTIVE_COMPANY (403)
  ↓ ok   → CompanyContext { userId, companyId, companyName, companyRole, ... }
```

---

## סוגי שגיאה (`CompanyContextErrorCode`)

| קוד | סטטוס HTTP | הסיבה | תגובת ה-Page |
|-----|-----------|-------|--------------|
| `NO_SESSION` | 401 | אין session | redirect → `/login` |
| `INACTIVE_PROFILE` | 403 | פרופיל מושבת | redirect → `/login` |
| `NO_MEMBERSHIP` | 403 | אין שיוך | redirect → `/login` |
| `NEEDS_COMPANY_SELECTION` | 403 | 2+ memberships, אין cookie תקף | redirect → `/select-company` |
| `INACTIVE_COMPANY` | 403 | חברה לא פעילה | redirect → `/login` |
| `FORBIDDEN_ROLE` | 403 | אין admin role בחברה | 403 |

**API routes** (לא דפים): מחזירים את ה-NextResponse ישירות — אין redirect, רק JSON error.

---

## תרשים זרימה: Login → Dashboard

```
POST /api/auth/login
  → אימות credentials
  → query company_members
    → 0 memberships: לא מגדיר cookie
    → 1 membership:  מגדיר safedoc_active_company = company_id
    → 2+ memberships: מוחק cookie קיים
  → redirect → /dashboard

GET /dashboard
  → getCurrentCompanyContext()
    → code = NEEDS_COMPANY_SELECTION?
      → redirect → /select-company
    → ok → render dashboard
```

---

## תרשים זרימה: Company Switcher

```
NavBar (client) → useEffect → GET /api/session/companies
  → { companies: [...], activeCompanyId: 'co-a' }
  → מציג dropdown עם חברות

לחיצה על חברה → POST /api/session/company { company_id: 'co-b' }
  → server: מאמת membership
  → set cookie safedoc_active_company = 'co-b'
  → window.location.replace('/dashboard')
```
