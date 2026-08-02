# Phase 2 Batch 4 — Consistency Enforcement: Heavy Equipment

**תאריך:** 2026-07-30

---

## אינווריאנטים

### 1. `heavy_equipment_insurances.company_id = heavy_equipment.company_id`

כל רשומת ביטוח חייבת לשייך את אותה חברה כמו ציוד האב שלה.

**אכיפה:**
- Trigger: `heavy_equipment_insurances_company_id_check` (BEFORE INSERT OR UPDATE)
- Function: `public.enforce_heavy_equipment_child_company_id()`

```
INSERT INTO heavy_equipment_insurances (heavy_equipment_id, company_id, ...)
→ Trigger validates: insurances.company_id = heavy_equipment.company_id
→ Mismatch → RAISE EXCEPTION (transaction rolls back)
```

### 2. `heavy_equipment.subcontractor_id → subcontractors.company_id = heavy_equipment.company_id`

אם כלי הצמ"ה מקושר לקבלן משנה, הקבלן חייב להשתייך לאותה חברה.

**אכיפה:**
- Trigger: `heavy_equipment_subcontractor_same_company` (BEFORE INSERT OR UPDATE)
- Function: `public.enforce_heavy_equipment_subcontractor_same_company()`

```
PATCH heavy_equipment SET subcontractor_id = <id_from_other_company>
→ Trigger validates: subcontractors.company_id = heavy_equipment.company_id
→ Mismatch → RAISE EXCEPTION (transaction rolls back)
→ NULL subcontractor_id → allowed (optional field)
```

---

## ספינת אמת (Chain of Trust)

```
companies
   └─ heavy_equipment.company_id (NOT NULL, FK → companies.id)
         ├─ heavy_equipment_insurances.company_id (NOT NULL, FK → companies.id, enforced by trigger)
         └─ subcontractors.company_id (cross-check enforced by trigger)
```

---

## שגיאות trigger

| סיטואציה | Exception message |
|---|---|
| subcontractor_id של חברה אחרת | `INTEGRITY VIOLATION: heavy_equipment.company_id (X) must equal subcontractor.company_id (Y)` |
| subcontractor_id לא קיים | `INTEGRITY VIOLATION: subcontractor_id X not found in subcontractors` |
| insurance לא מתאים ל-parent | `INTEGRITY VIOLATION: heavy_equipment_insurances.company_id (X) must equal parent heavy_equipment.company_id (Y)` |
| parent לא קיים | `INTEGRITY VIOLATION: heavy_equipment_id X not found or has NULL company_id` |

---

## בדיקות אחרי מיגרציה

```sql
-- 0 mismatches expected:
SELECT COUNT(*) FROM heavy_equipment_insurances hei
JOIN heavy_equipment he ON he.id = hei.heavy_equipment_id
WHERE hei.company_id IS DISTINCT FROM he.company_id;

-- 0 cross-company subcontractor links expected:
SELECT COUNT(*) FROM heavy_equipment he
JOIN subcontractors s ON s.id = he.subcontractor_id
WHERE he.company_id IS DISTINCT FROM s.company_id;
```
