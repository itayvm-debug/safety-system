# Phase 2 Batch 5 — Consistency Enforcement: Lifting Equipment

**תאריך:** 2026-07-30  
**טבלה:** `lifting_equipment`

---

## Trigger אינווריאנטים

### 1. `lifting_equipment_subcontractor_same_company`
**פונקציה:** `enforce_lifting_equipment_subcontractor_same_company()`  
**אירוע:** BEFORE INSERT OR UPDATE ON lifting_equipment  
**אינווריאנט:** אם `subcontractor_id IS NOT NULL`, אז `subcontractors.company_id = lifting_equipment.company_id`

**הודעת שגיאה:**
```
subcontractor (id=<uuid>) does not belong to the same company (<uuid>) as lifting_equipment
```

**לוגיקה:**
```sql
IF NEW.subcontractor_id IS NOT NULL THEN
  IF NOT EXISTS (
    SELECT 1 FROM subcontractors
    WHERE id = NEW.subcontractor_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION '...';
  END IF;
END IF;
```

---

## Verification Queries

### בדיקת trigger קיים
```sql
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'lifting_equipment'
  AND trigger_name = 'lifting_equipment_subcontractor_same_company';
```
**צפוי:** שורה אחת עם `BEFORE`, `INSERT` ו-`UPDATE`

### בדיקת פונקציה קיימת
```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'enforce_lifting_equipment_subcontractor_same_company';
```
**צפוי:** שורה אחת

### בדיקת עקביות subcontractors (אחרי migration)
```sql
SELECT le.id, le.company_id AS le_company_id, s.company_id AS sub_company_id
FROM lifting_equipment le
JOIN subcontractors s ON s.id = le.subcontractor_id
WHERE le.company_id <> s.company_id;
```
**צפוי:** 0 שורות

### בדיקת NULL company_id (אחרי migration)
```sql
SELECT COUNT(*) FROM lifting_equipment WHERE company_id IS NULL;
```
**צפוי:** 0

### בדיקת RLS מופעל
```sql
SELECT relname, relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = 'lifting_equipment' AND n.nspname = 'public';
```
**צפוי:** `relrowsecurity = true`

### בדיקת 5 פוליסות
```sql
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'lifting_equipment'
ORDER BY policyname;
```
**צפוי:** 5 שורות: select/insert/update/delete/service_all — **ללא** "Auth users can manage lifting_equipment"

---

## הבדלים ממה שהיה ב-Batch 4

| היבט | Batch 4 (heavy_equipment) | Batch 5 (lifting_equipment) |
|---|---|---|
| טבלות בסקופ | 2 (parent + child insurances) | 1 (standalone) |
| Trigger parent-child | ✅ heavy_equipment_insurances_company_id_check | ❌ לא נדרש |
| Trigger subcontractor | ✅ heavy_equipment_subcontractor_same_company | ✅ lifting_equipment_subcontractor_same_company |
| Storage אחרי migration | Mode A | Mode A |
| STANDALONE_LEGACY_CONFIGS | הסיר heavy_equipment + heavy_equipment_insurances | מרוקן לחלוטין |
