# מטריצת RLS סופית — SafeDoc
> תאריך: 2026-07-18 | גרסה: 1.0 | סיווג: פנימי

## 1. הקשר

**כל ה-API routes של SafeDoc משתמשים ב-`createServiceClient` עם service_role key.**
**service_role עוקף RLS לחלוטין — הוא חיסון ב-API layer, לא ב-RLS.**

ההגנה העיקרית: `requireAuth()` / `requireAdmin()` ב-API routes + middleware.
RLS ב-SafeDoc: defense in depth, הגנה על גישה ישירה, בסיס לעתיד.

---

## 2. מטריצת RLS לפי טבלה

| טבלה | RLS פעיל | Policy | סיכון ישיר |
|------|----------|--------|-----------|
| workers | ✓ | ALL to authenticated | בינוני — כל JWT יכול לשנות |
| documents | ✓ | ALL to authenticated | בינוני |
| profiles | ✓ | SELECT own only (id = auth.uid()) | נמוך — הגנה טובה |
| authorized_phones | ✓ | SELECT to authenticated | נמוך |
| subcontractors | ✓ | CRUD to authenticated | בינוני |
| entity_notes | ✓ | ALL to authenticated | בינוני |
| safety_briefings | ✓ | SELECT auth; ALL service_role | נמוך |
| height_restrictions | ✓ | ALL to authenticated | בינוני |
| heavy_equipment | ✓ | ALL to authenticated | בינוני |
| lifting_equipment | ✓ | ALL to authenticated | בינוני |
| lifting_machine_appointments | ✓ | ALL to authenticated | בינוני |
| vehicles | ✓ | ALL to authenticated | בינוני |
| vehicle_licenses | ✓ | ALL to authenticated | בינוני |
| vehicle_insurances | ✓ | ALL to authenticated | בינוני |
| heavy_equipment_insurances | ✓ | ALL to authenticated | בינוני |
| manager_licenses | ✓ | ALL to authenticated | בינוני |
| legal_acceptances | ✓ | INSERT/SELECT own | נמוך |
| audit_logs | ✓ | INSERT service_role; SELECT admin | נמוך |

---

## 3. ניתוח "ALL to authenticated"

**משמעות**: כל Supabase JWT תקף מאפשר קריאה וכתיבה לכל הרשומות.

**סיכון בפועל בשלב MVP**:
- אין גישה ישירה דרך supabase-js client-side (כל גישה דרך API routes)
- ה-API routes דורשים `requireAuth()` / `requireAdmin()`
- סיכון נמוך-בינוני ב-single-tenant MVP

**סיכון פוטנציאלי**:
- אם מפתח יוסיף Supabase client-side עם anon key ויאפשר JWT לגשת ישירות
- אם יהפוך ל-multi-tenant — חובה לשנות ל-`auth.uid() = owner_id`

---

## 4. המלצות אבטחה עתידיות

| פריט | עדיפות | תיאור |
|------|--------|-------|
| Row-level ownership | גבוה (מסחור) | הוסף `created_by` FK לכל טבלה, RLS per-user |
| service_role audit | בינוני | רישום בנפרד של כל קריאות service_role |
| RLS unit tests | בינוני | בדיקות שמוודאות שה-policies פועלות כמצופה |

---

## 5. הצהרה

RLS ב-SafeDoc MVP תקין כ-defense in depth עבור single-tenant.
לפריסה multi-tenant נדרשת עבודה נוספת.
RLS לא נבדק על-ידי גורם חיצוני.

---

*מסמך זה עודכן בהתאם ל-SOURCE_OF_TRUTH_AUDIT.md ול-RLS_AUDIT.md.*
