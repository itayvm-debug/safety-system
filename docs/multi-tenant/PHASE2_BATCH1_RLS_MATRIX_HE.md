# מטריצת RLS — Phase 2 Batch 1

## עיקרון הגנה כפולה

השיטה ב-SafeDoc Phase 2 Batch 1 משתמשת בשתי שכבות הגנה:

1. **Application Layer** — `getCurrentCompanyContext()` + `.eq('company_id', companyId)`  
   כל API routes ו-Server Components. ה-`companyId` **תמיד** מגיע מה-session + DB, לא מהבקשה.

2. **Database Layer (RLS)** — פוליסי PostgreSQL על כל טבלה  
   שכבת הגנה נוספת (defense-in-depth). כל גישה מ-authenticated users נחסמת ב-DB.

---

## מטריצת פוליסי מלאה

### companies

| פוליסי | For | Roles | USING | WITH CHECK |
|--------|-----|-------|-------|------------|
| companies_select_member | SELECT | authenticated | `id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND is_active = true)` | — |
| companies_service_all | ALL | service_role | true | true |

### company_members

| פוליסי | For | Roles | USING | WITH CHECK |
|--------|-----|-------|-------|------------|
| company_members_select_own | SELECT | authenticated | `user_id = auth.uid()` | — |
| company_members_service_all | ALL | service_role | true | true |

### workers (**Phase 2 Batch 1 — חדש**)

| פוליסי | For | Roles | USING | WITH CHECK |
|--------|-----|-------|-------|------------|
| ~~authenticated users can manage workers~~ (הוסר) | ALL | authenticated | true | true |
| workers_select_company | SELECT | authenticated | company_id IN (SELECT ...) | — |
| workers_insert_company | INSERT | authenticated | — | company_id IN (SELECT ...) |
| workers_update_company | UPDATE | authenticated | company_id IN (SELECT ...) | company_id IN (SELECT ...) |
| workers_delete_company | DELETE | authenticated | company_id IN (SELECT ...) | — |
| workers_service_all | ALL | service_role | true | true |

**הערה UPDATE:** USING בודק את הרשומה הקיימת (החברה שלה), WITH CHECK בודק את הרשומה החדשה (מניעת העברה לחברה אחרת). מכיוון שמשתמש שייך לחברה אחת, שניהם חייבים לעמוד — אי-אפשר להעביר worker לחברה אחרת.

### documents (**Phase 2 Batch 1 — חדש**)

| פוליסי | For | Roles | USING | WITH CHECK |
|--------|-----|-------|-------|------------|
| ~~authenticated users can manage documents~~ (הוסר) | ALL | authenticated | true | true |
| documents_select_company | SELECT | authenticated | company_id IN (SELECT ...) | — |
| documents_insert_company | INSERT | authenticated | — | company_id IN (SELECT ...) |
| documents_update_company | UPDATE | authenticated | company_id IN (SELECT ...) | company_id IN (SELECT ...) |
| documents_delete_company | DELETE | authenticated | company_id IN (SELECT ...) | — |
| documents_service_all | ALL | service_role | true | true |

---

## טבלאות ללא company-scope (Batch 2)

| טבלה | RLS נוכחי | הערה |
|------|-----------|------|
| vehicles | ללא מגבלת חברה | Batch 2 |
| heavy_equipment | ללא מגבלת חברה | Batch 2 |
| lifting_equipment | ללא מגבלת חברה | Batch 2 |
| subcontractors | ללא מגבלת חברה | Batch 2 |
| safety_briefings | ללא company_id | מאובטח ברמת Application דרך worker |
| height_restrictions | ללא company_id | מאובטח ברמת Application דרך worker |
| professional_licenses | ללא company_id | מאובטח ברמת Application דרך worker |
| manager_licenses | ללא company_id | מאובטח ברמת Application דרך worker |
| lifting_machine_appointments | ללא company_id | מאובטח ברמת Application דרך worker |
| profiles | ללא company_id | RLS בנפרד |
| authorized_phones | ללא company_id | read only לכל authenticated |

---

## תרשים: היעדר Recursion

```
workers_select_company
  → USING: company_id IN (SELECT company_id FROM company_members WHERE ...)
      company_members RLS → user_id = auth.uid()  ← עצירה. אין lookup בחזרה ל-companies.

documents_select_company
  → USING: company_id IN (SELECT company_id FROM company_members WHERE ...)
      company_members RLS → user_id = auth.uid()  ← עצירה. אין recursion.
```

**אין SECURITY DEFINER.** אין forward reference. אין recursion.

---

## subquery הסטנדרטי (משתמש בכל הפוליסי)

```sql
company_id IN (
  SELECT company_id FROM company_members
   WHERE user_id   = auth.uid()
     AND is_active = true
)
```

ה-index `idx_company_members_user_id` מבטיח ביצועים מהירים לבדיקה זו.
