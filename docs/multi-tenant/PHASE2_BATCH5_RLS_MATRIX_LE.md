# Phase 2 Batch 5 — RLS Policy Matrix: Lifting Equipment

**תאריך:** 2026-07-30  
**טבלה:** `lifting_equipment`

---

## פוליסות לפני Batch 5

| שם | Operation | USING | WITH CHECK |
|---|---|---|---|
| `Auth users can manage lifting_equipment` | ALL | `true` | `true` |

**בעיה:** פוליסת blanket מאפשרת לכל משתמש מאומת לגשת לציוד של כל החברות.

**פעולה בבאצ׳ 5:** DROP פוליסת ה-blanket; יצירת 5 פוליסות tenant-aware.

---

## פוליסות אחרי Batch 5 — `lifting_equipment`

### 1. `lifting_equipment_select_own_company`
```sql
CREATE POLICY lifting_equipment_select_own_company ON lifting_equipment
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );
```

### 2. `lifting_equipment_insert_own_company`
```sql
CREATE POLICY lifting_equipment_insert_own_company ON lifting_equipment
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );
```

### 3. `lifting_equipment_update_own_company`
```sql
CREATE POLICY lifting_equipment_update_own_company ON lifting_equipment
  FOR UPDATE TO authenticated
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
```

### 4. `lifting_equipment_delete_own_company`
```sql
CREATE POLICY lifting_equipment_delete_own_company ON lifting_equipment
  FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );
```

### 5. `lifting_equipment_service_all`
```sql
CREATE POLICY lifting_equipment_service_all ON lifting_equipment
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

---

## סיכום פוליסות לאחר Migration

| טבלה | SELECT | INSERT | UPDATE | DELETE | SERVICE |
|---|---|---|---|---|---|
| `lifting_equipment` | ✅ company_id | ✅ company_id | ✅ company_id | ✅ company_id | ✅ service_role |

**RLS state:** ENABLED  
**blanket policy:** DROPPED  
**פוליסות tenant-aware:** 4 (select/insert/update/delete) + 1 service_all = **5 סה"כ**

---

## הערות

- API routes משתמשות ב-`createServiceClient()` (עוקף RLS) — ה-RLS כאן הוא הגנה נוספת (defense-in-depth) לגישה ישירה ל-DB.
- הפוליסות חלות על `authenticated` role (ישיר ל-Supabase) ועל `service_role` (לשירותים פנימיים).
- `company_members.is_active = true` מבטיח שחברים שעזבו לא יכולים לגשת לנתוני החברה.
