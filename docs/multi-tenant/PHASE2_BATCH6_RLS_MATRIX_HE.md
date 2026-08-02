# Phase 2 Batch 6 — RLS Policy Matrix (עברית)

## עקרון
API routes משתמשות ב-service client (מעקף RLS) — RLS מגן על גישה ישירה ל-DB בלבד.
כל Policy חייבת לכלול גם service_role ALL כ-defense-in-depth.

---

## 1. lifting_machine_appointments — DIRECT TENANT-OWNED (A)

### Policies חדשות (5)

| Policy | פקודה | Principal | USING | WITH CHECK |
|--------|--------|-----------|-------|------------|
| `lma_select_own_company` | SELECT | authenticated | company_id IN company_members | — |
| `lma_insert_own_company` | INSERT | authenticated | — | company_id IN company_members |
| `lma_update_own_company` | UPDATE | authenticated | company_id IN company_members | company_id IN company_members |
| `lma_delete_own_company` | DELETE | authenticated | company_id IN company_members | — |
| `lma_service_all` | ALL | service_role | true | true |

### SQL

```sql
-- מחיקת policy פרוצה
DROP POLICY IF EXISTS "Auth users can manage lifting_machine_appointments"
  ON lifting_machine_appointments;

-- policies חדשות
CREATE POLICY "lma_select_own_company"
  ON lifting_machine_appointments FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "lma_insert_own_company"
  ON lifting_machine_appointments FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "lma_update_own_company"
  ON lifting_machine_appointments FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "lma_delete_own_company"
  ON lifting_machine_appointments FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "lma_service_all"
  ON lifting_machine_appointments FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

---

## 2. entity_notes — DIRECT TENANT-OWNED (A)

### Policies חדשות (5)

| Policy | פקודה | Principal | USING | WITH CHECK |
|--------|--------|-----------|-------|------------|
| `entity_notes_select_own_company` | SELECT | authenticated | company_id IN company_members | — |
| `entity_notes_insert_own_company` | INSERT | authenticated | — | company_id IN company_members |
| `entity_notes_update_own_company` | UPDATE | authenticated | company_id IN company_members | company_id IN company_members |
| `entity_notes_delete_own_company` | DELETE | authenticated | company_id IN company_members | — |
| `entity_notes_service_all` | ALL | service_role | true | true |

### SQL

```sql
DROP POLICY IF EXISTS "authenticated manage notes" ON entity_notes;

CREATE POLICY "entity_notes_select_own_company"
  ON entity_notes FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "entity_notes_insert_own_company"
  ON entity_notes FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "entity_notes_update_own_company"
  ON entity_notes FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "entity_notes_delete_own_company"
  ON entity_notes FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

CREATE POLICY "entity_notes_service_all"
  ON entity_notes FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

---

## 3. safety_briefings — PARENT-INHERITED (B)

### מצב לפני
- `authenticated users can read` — SELECT TO authenticated USING (true) — פרוץ

### Policies חדשות (2)

| Policy | פקודה | Principal | USING |
|--------|--------|-----------|-------|
| `safety_briefings_worker_select` | SELECT | authenticated | worker_id IN worker chain |
| `safety_briefings_service_all` | ALL | service_role | true |

### SQL

```sql
DROP POLICY IF EXISTS "authenticated users can read" ON safety_briefings;
DROP POLICY IF EXISTS "service role full access" ON safety_briefings;
DROP POLICY IF EXISTS "safety_briefings_worker_select" ON safety_briefings;
DROP POLICY IF EXISTS "safety_briefings_service_all" ON safety_briefings;

CREATE POLICY "safety_briefings_worker_select"
  ON safety_briefings FOR SELECT TO authenticated
  USING (
    worker_id IN (
      SELECT w.id FROM workers w
      WHERE w.company_id IN (
        SELECT cm.company_id FROM company_members cm
        WHERE cm.user_id = auth.uid() AND cm.is_active = true
      )
    )
  );

CREATE POLICY "safety_briefings_service_all"
  ON safety_briefings FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

---

## 4. height_restrictions — PARENT-INHERITED (B)

### מצב לפני
- `Auth users can manage height_restrictions` — ALL TO authenticated USING (true) — פרוץ לגמרי

### Policies חדשות (2)

| Policy | פקודה | Principal | USING |
|--------|--------|-----------|-------|
| `height_restrictions_worker_select` | SELECT | authenticated | worker_id IN worker chain |
| `height_restrictions_service_all` | ALL | service_role | true |

### SQL

```sql
DROP POLICY IF EXISTS "Auth users can manage height_restrictions" ON height_restrictions;
DROP POLICY IF EXISTS "height_restrictions_worker_select" ON height_restrictions;
DROP POLICY IF EXISTS "height_restrictions_service_all" ON height_restrictions;

CREATE POLICY "height_restrictions_worker_select"
  ON height_restrictions FOR SELECT TO authenticated
  USING (
    worker_id IN (
      SELECT w.id FROM workers w
      WHERE w.company_id IN (
        SELECT cm.company_id FROM company_members cm
        WHERE cm.user_id = auth.uid() AND cm.is_active = true
      )
    )
  );

CREATE POLICY "height_restrictions_service_all"
  ON height_restrictions FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

---

## 5. professional_licenses — PARENT-INHERITED (B)

### מצב לפני
לא ברור אם RLS מופעל בכלל — migration_session1 לא כלל אותה.

### Policies חדשות (2)

| Policy | פקודה | Principal | USING |
|--------|--------|-----------|-------|
| `professional_licenses_worker_select` | SELECT | authenticated | worker_id IN worker chain |
| `professional_licenses_service_all` | ALL | service_role | true |

### SQL

```sql
ALTER TABLE professional_licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "professional_licenses_worker_select" ON professional_licenses;
DROP POLICY IF EXISTS "professional_licenses_service_all" ON professional_licenses;

CREATE POLICY "professional_licenses_worker_select"
  ON professional_licenses FOR SELECT TO authenticated
  USING (
    worker_id IN (
      SELECT w.id FROM workers w
      WHERE w.company_id IN (
        SELECT cm.company_id FROM company_members cm
        WHERE cm.user_id = auth.uid() AND cm.is_active = true
      )
    )
  );

CREATE POLICY "professional_licenses_service_all"
  ON professional_licenses FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

---

## 6. manager_licenses — PARENT-INHERITED (B)

### מצב לפני
`manager_licenses_authenticated` FOR ALL TO authenticated USING (true) — פרוץ.

### Policies חדשות (2)

| Policy | פקודה | Principal | USING |
|--------|--------|-----------|-------|
| `manager_licenses_worker_select` | SELECT | authenticated | worker_id IN worker chain |
| `manager_licenses_service_all` | ALL | service_role | true |

### SQL

```sql
DROP POLICY IF EXISTS "manager_licenses_authenticated" ON manager_licenses;
DROP POLICY IF EXISTS "manager_licenses_worker_select" ON manager_licenses;
DROP POLICY IF EXISTS "manager_licenses_service_all" ON manager_licenses;

CREATE POLICY "manager_licenses_worker_select"
  ON manager_licenses FOR SELECT TO authenticated
  USING (
    worker_id IN (
      SELECT w.id FROM workers w
      WHERE w.company_id IN (
        SELECT cm.company_id FROM company_members cm
        WHERE cm.user_id = auth.uid() AND cm.is_active = true
      )
    )
  );

CREATE POLICY "manager_licenses_service_all"
  ON manager_licenses FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

---

## סיכום Policies — Batch 6

| טבלה | Policies שנמחקות | Policies חדשות |
|------|-----------------|----------------|
| lifting_machine_appointments | 1 (blanket) | 5 |
| entity_notes | 1 (blanket) | 5 |
| safety_briefings | 2 (read + service) | 2 |
| height_restrictions | 1 (blanket ALL) | 2 |
| professional_licenses | — | 2 |
| manager_licenses | 1 (blanket) | 2 |

**סה"כ: 6 policies נמחקות, 18 policies חדשות נוצרות.**

---

## הגנה שכבתית (Defense in Depth)

```
Browser → HTTPS → Next.js API Route
  └── requireCompanyAdmin() / getCurrentCompanyContext()
       ├── Session verification (Supabase Auth)
       ├── company_members verification (DB lookup)
       └── Returns trusted companyId
            └── API uses service client (bypass RLS)
                 └── Explicit .eq('company_id', companyId) filter
                      └── DB (RLS = last line of defense)
```

API routes לא מסתמכות על RLS — RLS הוא שכבת הגנה נוספת בלבד.
