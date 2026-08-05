# Phase 3 Batch 2 — Company Switcher: NavBar + /select-company

## רכיבים

### NavBar (Client Component)
- **טעינה**: `useEffect` → `GET /api/session/companies` בעת mount
- **תצוגה**: שם החברה הפעילה ב-header (desktop + mobile)
- **מתג**: dropdown מוצג רק אם `companies.length > 1`
- **החלפה**: POST `/api/session/company` → `window.location.replace('/dashboard')`

### `/select-company` (Server Page → Client Component)
- **Auth required**: middleware מאפשר כניסה עם session בלבד (ללא company context)
- **0 memberships**: redirect → `/login`
- **1 membership**: auto-select → POST → redirect → `/dashboard`
- **2+ memberships**: מציג רשימת כרטיסיות לבחירה

---

## Response Format: `GET /api/session/companies`

```json
{
  "companies": [
    { "id": "uuid1", "name": "חברה א", "logo_url": null, "role": "owner" },
    { "id": "uuid2", "name": "חברה ב", "logo_url": "https://...", "role": "admin" }
  ],
  "activeCompanyId": "uuid1"
}
```

- `activeCompanyId`: `null` אם 2+ memberships וה-cookie לא תקף / חסר
- `activeCompanyId`: auto-filled לחברה היחידה אם `companies.length === 1`

---

## UX Scenarios

| מצב משתמש | התנהגות בהתחברות |
|-----------|-----------------|
| 0 memberships | `/login` (הסרה ידנית ע"י admin) |
| 1 membership | Dashboard ישיר — cookie מוגדר ב-login |
| 2+ memberships, יש cookie תקף | Dashboard ישיר |
| 2+ memberships, אין cookie | redirect → `/select-company` |
| platform-admin חדש (לאחר יצירת חברה) | `/select-company` (2 memberships עם/בלי cookie תלוי בזמן) |

---

## Accessibility

- `/select-company` תומכת ב-RTL מלא (`dir="rtl"`)
- כפתורי בחירה עם `disabled` state בזמן טעינה
- Spinner animation בכפתור הנבחר
- Fallback error message עם כפתור "נסה שנית"
