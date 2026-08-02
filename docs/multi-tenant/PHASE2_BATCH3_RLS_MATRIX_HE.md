# Phase 2 Batch 3 — מטריצת RLS: vehicle_licenses + vehicle_insurances

**תאריך:** 2026-07-30

---

## עקרונות

- כל ה-API routes משתמשים ב-`service_role` (דרך `createServiceClient`) — service_role **עוקף RLS** אוטומטית.
- RLS הוא שכבת הגנה עמוקה (defense-in-depth) לגישה ישירה דרך JWT של `authenticated`.
- לאחר Batch 3, כל שדה company_id מאוכף גם ב-DB (NOT NULL + FK + trigger) וגם ב-RLS.

---

## מטריצת RLS — vehicle_licenses

| Role | Operation | Policy Name | Condition |
|------|-----------|-------------|-----------|
| authenticated | SELECT | vehicle_licenses_select_company | `USING (company_id IN (SELECT cm.company_id FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.is_active = true))` |
| authenticated | INSERT | vehicle_licenses_insert_company | `WITH CHECK (company_id IN (...))` |
| authenticated | UPDATE | vehicle_licenses_update_company | `USING (...) WITH CHECK (...)` — שני הצדדים |
| authenticated | DELETE | vehicle_licenses_delete_company | `USING (company_id IN (...))` |
| service_role | ALL | vehicle_licenses_service_all | `USING (true) WITH CHECK (true)` |

### לפני Batch 3
- RLS: **כבוי**
- פוליסות: **אין**

### אחרי Batch 3
- RLS: **פעיל**
- פוליסות: **5** (כפי שבטבלה)

---

## מטריצת RLS — vehicle_insurances

| Role | Operation | Policy Name | Condition |
|------|-----------|-------------|-----------|
| authenticated | SELECT | vehicle_insurances_select_company | `USING (company_id IN (...))` |
| authenticated | INSERT | vehicle_insurances_insert_company | `WITH CHECK (company_id IN (...))` |
| authenticated | UPDATE | vehicle_insurances_update_company | `USING (...) WITH CHECK (...)` |
| authenticated | DELETE | vehicle_insurances_delete_company | `USING (company_id IN (...))` |
| service_role | ALL | vehicle_insurances_service_all | `USING (true) WITH CHECK (true)` |

---

## תרחישי גבול

| תרחיש | אמצעי הגנה | תוצאה |
|--------|------------|--------|
| עובד מחברה A מנסה לקרוא רשיון של חברה B דרך JWT | RLS SELECT policy | DENIED (0 rows) |
| service_role מקריאה ל-vehicle_licenses ללא סינון | service_role עוקף RLS | כל הרשומות נקראות (מאובטח כי API-route מסנן לפי companyId) |
| INSERT עם company_id שגוי דרך JWT | RLS INSERT + trigger BEFORE INSERT | DENIED בשני שלבים |
| UPDATE שמשנה vehicle_id לרכב מחברה אחרת | trigger BEFORE UPDATE | EXCEPTION: company_id mismatch |
| UPDATE שמשנה company_id ישירות דרך JWT | RLS UPDATE WITH CHECK + trigger | DENIED בשני שלבים |

---

## סדר הגנות (Defense-in-Depth)

```
Request
  → getCurrentCompanyContext() / requireCompanyAdmin()   [שכבה 1: Auth JWT]
  → API route: company_id filter on query                [שכבה 2: Application logic]
  → service_role query: company_id = companyId           [שכבה 3: Query filter]
  → Trigger BEFORE INSERT/UPDATE                         [שכבה 4: DB trigger]
  → RLS (if authenticated role used directly)            [שכבה 5: RLS]
  → FK company_id → companies(id)                        [שכבה 6: FK integrity]
```

---

## השוואה לטבלאות Batch 2

| טבלה | RLS לפני | RLS אחרי | פוליסות |
|-------|----------|----------|---------|
| subcontractors | blanket authenticated | company-scoped | 5 |
| vehicles | blanket authenticated | company-scoped | 5 |
| vehicle_licenses | **אין** | company-scoped | **5 (חדשות)** |
| vehicle_insurances | **אין** | company-scoped | **5 (חדשות)** |
