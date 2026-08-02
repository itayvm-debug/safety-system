# Phase 2 Batch 6 — Rollback Plan (עברית)

## עיקרון
Rollback מבצעים רק אם הפריסה נכשלת. Rollback SQL צריך להתבצע לפני כל שינוי TypeScript.
**לא לבצע rollback על Production ללא אישור מפורש.**

---

## 1. Rollback SQL — שינויי סכמה

### 1.1 lifting_machine_appointments

```sql
-- Step A: מחיקת trigger
DROP TRIGGER IF EXISTS lma_company_consistency ON lifting_machine_appointments;
DROP FUNCTION IF EXISTS enforce_lma_company();

-- Step B: מחיקת RLS policies חדשות
DROP POLICY IF EXISTS "lma_select_own_company" ON lifting_machine_appointments;
DROP POLICY IF EXISTS "lma_insert_own_company" ON lifting_machine_appointments;
DROP POLICY IF EXISTS "lma_update_own_company" ON lifting_machine_appointments;
DROP POLICY IF EXISTS "lma_delete_own_company" ON lifting_machine_appointments;
DROP POLICY IF EXISTS "lma_service_all" ON lifting_machine_appointments;

-- Step C: שחזור policy פרוצה (ה-fallback היחיד לאחר rollback)
CREATE POLICY "Auth users can manage lifting_machine_appointments"
  ON lifting_machine_appointments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Step D: מחיקת אינדקס
DROP INDEX IF EXISTS idx_lma_company_id;

-- Step E: הסרת NOT NULL
ALTER TABLE lifting_machine_appointments
  ALTER COLUMN company_id DROP NOT NULL;

-- Step F: הסרת עמודה
ALTER TABLE lifting_machine_appointments DROP COLUMN IF EXISTS company_id;
```

### 1.2 entity_notes

```sql
-- Step A: מחיקת trigger
DROP TRIGGER IF EXISTS entity_notes_company_consistency ON entity_notes;
DROP FUNCTION IF EXISTS enforce_entity_notes_company();

-- Step B: מחיקת RLS policies חדשות
DROP POLICY IF EXISTS "entity_notes_select_own_company" ON entity_notes;
DROP POLICY IF EXISTS "entity_notes_insert_own_company" ON entity_notes;
DROP POLICY IF EXISTS "entity_notes_update_own_company" ON entity_notes;
DROP POLICY IF EXISTS "entity_notes_delete_own_company" ON entity_notes;
DROP POLICY IF EXISTS "entity_notes_service_all" ON entity_notes;

-- Step C: שחזור policy פרוצה
CREATE POLICY "authenticated manage notes" ON entity_notes
  FOR ALL USING (auth.role() = 'authenticated');

-- Step D: מחיקת אינדקס
DROP INDEX IF EXISTS idx_entity_notes_company_id;

-- Step E: הסרת NOT NULL
ALTER TABLE entity_notes ALTER COLUMN company_id DROP NOT NULL;

-- Step F: הסרת עמודה
ALTER TABLE entity_notes DROP COLUMN IF EXISTS company_id;
```

---

## 2. Rollback SQL — שינויי RLS בלבד

### 2.1 safety_briefings

```sql
DROP POLICY IF EXISTS "safety_briefings_worker_select" ON safety_briefings;
DROP POLICY IF EXISTS "safety_briefings_service_all" ON safety_briefings;

-- שחזור policies מקוריות
CREATE POLICY "authenticated users can read"
  ON safety_briefings FOR SELECT TO authenticated USING (true);

CREATE POLICY "service role full access"
  ON safety_briefings FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### 2.2 height_restrictions

```sql
DROP POLICY IF EXISTS "height_restrictions_worker_select" ON height_restrictions;
DROP POLICY IF EXISTS "height_restrictions_service_all" ON height_restrictions;

-- שחזור
CREATE POLICY "Auth users can manage height_restrictions"
  ON height_restrictions FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

### 2.3 professional_licenses

```sql
DROP POLICY IF EXISTS "professional_licenses_worker_select" ON professional_licenses;
DROP POLICY IF EXISTS "professional_licenses_service_all" ON professional_licenses;
-- אם RLS לא היה מופעל לפני, ניתן להשבית:
-- ALTER TABLE professional_licenses DISABLE ROW LEVEL SECURITY;
```

### 2.4 manager_licenses

```sql
DROP POLICY IF EXISTS "manager_licenses_worker_select" ON manager_licenses;
DROP POLICY IF EXISTS "manager_licenses_service_all" ON manager_licenses;

-- שחזור
CREATE POLICY "manager_licenses_authenticated"
  ON manager_licenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

---

## 3. Rollback TypeScript

### lib/export/exportTables.ts
```typescript
// שחזר GLOBAL_TABLES לכלול:
'lifting_machine_appointments', 'safety_briefings', 'height_restrictions', 'entity_notes'
// הסר WORKER_SCOPED_TABLES
// הסר LMA ו-entity_notes מ-COMPANY_SCOPED_TABLES
```

### lib/storage/authorize.ts
```typescript
// הוצא 'lifting_machine_appointments' מ-TENANT_MIGRATED_TABLES
// הוסף חזרה ל-Mode B:
// supabase.from('lifting_machine_appointments').select('id').eq('pdf_url', path).in('worker_id', workerIds)...
```

### types/index.ts
```typescript
// הסר company_id מ-LiftingMachineAppointment
// הסר company_id מ-EntityNote
```

### app/api/lifting-machine-appointments/route.ts
```typescript
// שחזר ל-requireAuth/requireAdmin ללא company scope
```

### app/api/lifting-machine-appointments/[id]/route.ts
```typescript
// שחזר ל-requireAuth/requireAdmin
```

### app/api/lifting-machine-appointments/generate-pdf/route.ts
```typescript
// שחזר ל-requireAdmin בלבד
```

### app/api/professional-licenses/route.ts
```typescript
// שחזר ל-requireAuth (GET) / requireAdmin (POST/DELETE)
// הסר worker ownership check
```

### app/api/professional-licenses/[id]/route.ts
```typescript
// שחזר ל-requireAdmin, הסר ownership check
```

### app/api/manager-licenses/route.ts + [id]/route.ts
```typescript
// שחזר ל-requireAuth/requireAdmin
```

### app/api/entity-notes/route.ts + [id]/route.ts
```typescript
// שחזר ל-requireAuth
// הסר resolveEntityCompany
// הסר company_id מ-INSERT
```

### app/workers/[id]/page.tsx
```typescript
// הסר .eq('company_id', worker.company_id) מקישור LMA
```

### מחק קבצים שנוצרו
```
lib/company/resolve-entity-company.ts
lib/lifting-machine-appointments/__tests__/isolation.test.ts
```

---

## 4. בדיקות לאחר Rollback

```sql
-- ווידוא שעמודות הוסרו
SELECT column_name FROM information_schema.columns
WHERE table_name IN ('lifting_machine_appointments', 'entity_notes')
  AND column_name = 'company_id';
-- חייב להחזיר 0 שורות

-- ווידוא Policies שוחזרו
SELECT tablename, policyname FROM pg_policies
WHERE tablename IN ('lifting_machine_appointments', 'entity_notes',
  'safety_briefings', 'height_restrictions',
  'professional_licenses', 'manager_licenses')
ORDER BY tablename, policyname;
```

---

## 5. מה לא מבוצע ב-Rollback

- **אין rollback על נתונים שנוצרו** — הערות ומינויים שנוצרו אחרי migration יישארו.
- **אין rollback על Phase 1, Batch 1-5** — לא לגעת.
- **אין push/deploy** — רק SQL + TypeScript מקומית.

---

## 6. מדריך Rollback לפי שלב כישלון

| שלב שנכשל | מה rollback |
|-----------|-------------|
| Step 1-2 (ADD COLUMN + backfill) | DROP COLUMN IF EXISTS — בטוח |
| Step 3 (NOT NULL) | DROP NOT NULL + DROP COLUMN |
| Step 4 (trigger) | DROP TRIGGER + DROP FUNCTION |
| Step 5 (RLS) | DROP policies חדשות + CREATE policies ישנות |
| Step 6-7 (TypeScript) | git revert על קבצי TS |
| Step 8 (Tests) | debug + fix, לא rollback |
