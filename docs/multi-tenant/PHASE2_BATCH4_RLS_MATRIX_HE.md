# Phase 2 Batch 4 — RLS Matrix: Heavy Equipment

**תאריך:** 2026-07-30  
**טבלאות:** `heavy_equipment`, `heavy_equipment_insurances`

> כל API routes משתמשים ב-`createServiceClient()` (service role) שמעקף RLS.  
> ה-policies הן defense-in-depth בלבד.

---

## `heavy_equipment`

| Policy | פעולה | גישה | USING / WITH CHECK |
|---|---|---|---|
| `heavy_equipment_select_company` | SELECT | authenticated | company_id ∈ company_members של auth.uid() |
| `heavy_equipment_insert_company` | INSERT | authenticated | company_id ∈ company_members של auth.uid() |
| `heavy_equipment_update_company` | UPDATE | authenticated | company_id ∈ company_members של auth.uid() |
| `heavy_equipment_delete_company` | DELETE | authenticated | company_id ∈ company_members של auth.uid() |
| `heavy_equipment_service_all` | ALL | service_role | true (explicit — service_role bypasses RLS) |

**Policy שנמחקת:** `"Auth users can manage heavy_equipment"` (blanket, ללא tenant scope)

---

## `heavy_equipment_insurances`

| Policy | פעולה | גישה | USING / WITH CHECK |
|---|---|---|---|
| `heavy_equipment_insurances_select_company` | SELECT | authenticated | company_id ∈ company_members של auth.uid() |
| `heavy_equipment_insurances_insert_company` | INSERT | authenticated | company_id ∈ company_members של auth.uid() |
| `heavy_equipment_insurances_update_company` | UPDATE | authenticated | company_id ∈ company_members של auth.uid() |
| `heavy_equipment_insurances_delete_company` | DELETE | authenticated | company_id ∈ company_members של auth.uid() |
| `heavy_equipment_insurances_service_all` | ALL | service_role | true |

**הערה:** לפני Batch 4 לא היה RLS על heavy_equipment_insurances — כל משתמש מאומת יכול לבצע כל פעולה.

---

## לוגיקת USING (זהה לכל ה-policies)

```sql
company_id IN (
  SELECT cm.company_id FROM company_members cm
  WHERE cm.user_id = auth.uid() AND cm.is_active = true
)
```

---

## עקרונות אכיפה

1. **API Layer (primary):** requireCompanyAdmin() → companyId מ-session → `.eq('company_id', companyId)`
2. **Trigger Layer (DB integrity):** consistency triggers עוצרים INSERT/UPDATE לא חוקיים
3. **RLS Layer (defense-in-depth):** policy scope מגביל גישה ישירה ל-Supabase client

אין להסתמך על RLS כאמצעי אבטחה עיקרי — האכיפה הראשית היא ב-API layer.
