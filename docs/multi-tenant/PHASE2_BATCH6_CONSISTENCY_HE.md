# Phase 2 Batch 6 — Consistency Invariants (עברית)

## Triggers אכיפה — טבלאות עם company_id חדש

### 1. lifting_machine_appointments — enforce_lma_company()

**Trigger:** `lma_company_consistency` BEFORE INSERT OR UPDATE ON lifting_machine_appointments

```sql
CREATE OR REPLACE FUNCTION enforce_lma_company()
RETURNS TRIGGER AS $$
DECLARE
  v_worker_company  uuid;
  v_equip_company   uuid;
BEGIN
  -- 1. עובד חייב להיות קיים ובעל company_id תואם
  SELECT company_id INTO v_worker_company
  FROM workers WHERE id = NEW.worker_id;

  IF v_worker_company IS NULL THEN
    RAISE EXCEPTION 'עובד לא נמצא: %', NEW.worker_id;
  END IF;

  IF NEW.company_id IS DISTINCT FROM v_worker_company THEN
    RAISE EXCEPTION 'company_id אינו תואם לעובד (appointment=% worker=%)',
      NEW.company_id, v_worker_company;
  END IF;

  -- 2. אם equipment_id קיים, חייב להיות מאותה חברה
  IF NEW.equipment_id IS NOT NULL THEN
    SELECT company_id INTO v_equip_company
    FROM heavy_equipment WHERE id = NEW.equipment_id;

    IF v_equip_company IS DISTINCT FROM v_worker_company THEN
      RAISE EXCEPTION 'ציוד שייך לחברה שונה מהעובד (equip=% worker=%)',
        v_equip_company, v_worker_company;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**אינווריאנט:**
- `∀ lma: lma.company_id = workers[lma.worker_id].company_id`
- `∀ lma: lma.equipment_id IS NOT NULL → heavy_equipment[lma.equipment_id].company_id = lma.company_id`

---

### 2. entity_notes — enforce_entity_notes_company()

**Trigger:** `entity_notes_company_consistency` BEFORE INSERT OR UPDATE ON entity_notes

```sql
CREATE OR REPLACE FUNCTION enforce_entity_notes_company()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id uuid;
BEGIN
  CASE NEW.entity_type
    WHEN 'worker' THEN
      SELECT company_id INTO v_company_id FROM workers WHERE id = NEW.entity_id;
    WHEN 'vehicle' THEN
      SELECT company_id INTO v_company_id FROM vehicles WHERE id = NEW.entity_id;
    WHEN 'heavy_equipment' THEN
      SELECT company_id INTO v_company_id FROM heavy_equipment WHERE id = NEW.entity_id;
    WHEN 'lifting_equipment' THEN
      SELECT company_id INTO v_company_id FROM lifting_equipment WHERE id = NEW.entity_id;
    WHEN 'subcontractor' THEN
      SELECT company_id INTO v_company_id FROM subcontractors WHERE id = NEW.entity_id;
    ELSE
      RAISE EXCEPTION 'entity_type לא תקין: %', NEW.entity_type;
  END CASE;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'ישות % לא נמצאה: %', NEW.entity_type, NEW.entity_id;
  END IF;

  IF NEW.company_id IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'company_id אינו תואם לישות הרלוונטית (note=% entity=%)',
      NEW.company_id, v_company_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**אינווריאנט:**
- `∀ en: en.company_id = entity_table[en.entity_id].company_id`
  (כאשר entity_table נקבעת לפי en.entity_type)

---

## אינווריאנטים RLS — טבלאות PARENT-INHERITED (B)

### professional_licenses, manager_licenses

**SELECT RLS (Worker Chain):**
```
worker_id IN (
  SELECT w.id FROM workers w
  WHERE w.company_id IN (
    SELECT cm.company_id FROM company_members cm
    WHERE cm.user_id = auth.uid()
    AND cm.is_active = true
  )
)
```

### safety_briefings

**SELECT RLS (Worker Chain):**
```
worker_id IN (
  SELECT w.id FROM workers w
  WHERE w.company_id IN (
    SELECT cm.company_id FROM company_members cm
    WHERE cm.user_id = auth.uid()
    AND cm.is_active = true
  )
)
```

### height_restrictions

**SELECT RLS (Worker Chain):**
```
worker_id IN (
  SELECT w.id FROM workers w
  WHERE w.company_id IN (
    SELECT cm.company_id FROM company_members cm
    WHERE cm.user_id = auth.uid()
    AND cm.is_active = true
  )
)
```

---

## שאילתות אימות

### אחרי הרצת migration — lifting_machine_appointments
```sql
-- 1. אין NULLים ב-company_id
SELECT count(*) AS null_company_count
FROM lifting_machine_appointments WHERE company_id IS NULL;

-- 2. עקביות עם worker
SELECT count(*) AS mismatch_count
FROM lifting_machine_appointments lma
JOIN workers w ON w.id = lma.worker_id
WHERE lma.company_id <> w.company_id;

-- 3. עקביות עם equipment (רק שורות עם equipment_id)
SELECT count(*) AS equip_mismatch
FROM lifting_machine_appointments lma
JOIN heavy_equipment he ON he.id = lma.equipment_id
WHERE lma.equipment_id IS NOT NULL
  AND lma.company_id <> he.company_id;
```

### אחרי הרצת migration — entity_notes
```sql
-- 1. אין NULLים ב-company_id
SELECT count(*) AS null_company_count
FROM entity_notes WHERE company_id IS NULL;

-- 2. עקביות worker-type
SELECT count(*) AS worker_mismatch
FROM entity_notes en
JOIN workers w ON w.id = en.entity_id
WHERE en.entity_type = 'worker' AND en.company_id <> w.company_id;

-- 3. עקביות vehicle-type
SELECT count(*) AS vehicle_mismatch
FROM entity_notes en
JOIN vehicles v ON v.id = en.entity_id
WHERE en.entity_type = 'vehicle' AND en.company_id <> v.company_id;

-- 4. הערות ללא ישות תואמת (orphan)
SELECT count(*) AS orphan_count
FROM entity_notes WHERE company_id IS NULL;
```

### אימות RLS Policies
```sql
-- RLS מופעל על כל 6 הטבלאות
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN (
  'professional_licenses', 'manager_licenses',
  'lifting_machine_appointments', 'safety_briefings',
  'height_restrictions', 'entity_notes'
)
ORDER BY relname;

-- Policies קיימות
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN (
  'professional_licenses', 'manager_licenses',
  'lifting_machine_appointments', 'safety_briefings',
  'height_restrictions', 'entity_notes'
)
ORDER BY tablename, policyname;
```

### השוואה ל-Batch 5
| נושא | Batch 5 (lifting_equipment) | Batch 6 |
|------|----------------------------|---------|
| טבלאות עם company_id | 8 | +2 (LMA + entity_notes) |
| TENANT_MIGRATED_TABLES | 8 | 10 |
| STANDALONE_LEGACY_CONFIGS | [] | [] (לא שונה) |
| Mode B Storage Tables | 5 | 5 (LMA עבר ל-Mode A) |
| WORKER_SCOPED export | לא קיים | 4 טבלאות |
| COMPANY_SCOPED export | 9 | 11 (+LMA +entity_notes) |

---

## Backfill אימות — לפני הוספת NOT NULL

### lifting_machine_appointments
```sql
-- לוודא שכל שורות יקבלו company_id
SELECT count(*) AS rows_without_match
FROM lifting_machine_appointments lma
LEFT JOIN workers w ON w.id = lma.worker_id
WHERE w.id IS NULL;
-- חייב להיות 0 (ON DELETE CASCADE אמור להבטיח זאת)
```

### entity_notes
```sql
-- לוודא שכל entity_notes יכולות לקבל company_id
WITH matched AS (
  SELECT en.id
  FROM entity_notes en
  LEFT JOIN workers w       ON w.id = en.entity_id AND en.entity_type = 'worker'
  LEFT JOIN vehicles v      ON v.id = en.entity_id AND en.entity_type = 'vehicle'
  LEFT JOIN heavy_equipment he ON he.id = en.entity_id AND en.entity_type = 'heavy_equipment'
  LEFT JOIN lifting_equipment le ON le.id = en.entity_id AND en.entity_type = 'lifting_equipment'
  LEFT JOIN subcontractors s ON s.id = en.entity_id AND en.entity_type = 'subcontractor'
  WHERE COALESCE(w.company_id, v.company_id, he.company_id, le.company_id, s.company_id) IS NOT NULL
)
SELECT
  (SELECT count(*) FROM entity_notes) AS total_notes,
  count(*) AS notes_with_parent,
  (SELECT count(*) FROM entity_notes) - count(*) AS orphan_notes
FROM matched;
-- orphan_notes חייב להיות 0 לפני NOT NULL
```
