-- ================================================================
-- Phase 2 Batch 6 — Multi-Tenant Migration
-- טבלאות: lifting_machine_appointments (DIRECT), entity_notes (DIRECT),
--         safety_briefings (RLS), height_restrictions (RLS),
--         professional_licenses (RLS), manager_licenses (RLS)
-- ⚠️ אין לבצע SQL על Supabase Production
-- ⚠️ אין commit, push, deploy
-- ================================================================

BEGIN;

-- ================================================================
-- Safety Guard 1: workers.company_id חייב להיות קיים
-- ================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workers' AND column_name = 'company_id'
  ) THEN
    RAISE EXCEPTION 'Safety Guard: workers.company_id לא קיים — הרץ Batch 1 תחילה';
  END IF;
END $$;

-- ================================================================
-- Safety Guard 2: heavy_equipment.company_id חייב להיות קיים
-- ================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'heavy_equipment' AND column_name = 'company_id'
  ) THEN
    RAISE EXCEPTION 'Safety Guard: heavy_equipment.company_id לא קיים — הרץ Batch 4 תחילה';
  END IF;
END $$;

-- ================================================================
-- Safety Guard 3: vehicles/lifting_equipment/subcontractors.company_id
-- ================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicles' AND column_name = 'company_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lifting_equipment' AND column_name = 'company_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subcontractors' AND column_name = 'company_id'
  ) THEN
    RAISE EXCEPTION 'Safety Guard: vehicles/lifting_equipment/subcontractors.company_id חסר — הרץ Batch 2-5 תחילה';
  END IF;
END $$;

-- ================================================================
-- STEP 1: lifting_machine_appointments — הוספת company_id
-- ================================================================

ALTER TABLE lifting_machine_appointments
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE RESTRICT;

-- Backfill: company_id מהעובד
UPDATE lifting_machine_appointments lma
SET company_id = w.company_id
FROM workers w
WHERE lma.worker_id = w.id
  AND lma.company_id IS NULL;

-- וודא אין NULL
DO $$
DECLARE v_null bigint;
BEGIN
  SELECT count(*) INTO v_null FROM lifting_machine_appointments WHERE company_id IS NULL;
  IF v_null > 0 THEN
    RAISE EXCEPTION 'Batch 6 Safety: % שורות ב-lifting_machine_appointments ללא company_id אחרי backfill', v_null;
  END IF;
END $$;

-- NOT NULL constraint
ALTER TABLE lifting_machine_appointments
  ALTER COLUMN company_id SET NOT NULL;

-- אינדקס
CREATE INDEX IF NOT EXISTS idx_lma_company_id
  ON lifting_machine_appointments (company_id);

-- ================================================================
-- STEP 2: lifting_machine_appointments — consistency trigger
-- ================================================================

CREATE OR REPLACE FUNCTION enforce_lma_company()
RETURNS TRIGGER AS $$
DECLARE
  v_worker_company  uuid;
  v_equip_company   uuid;
BEGIN
  SELECT company_id INTO v_worker_company
  FROM workers WHERE id = NEW.worker_id;

  IF v_worker_company IS NULL THEN
    RAISE EXCEPTION 'עובד לא נמצא: %', NEW.worker_id;
  END IF;

  IF NEW.company_id IS DISTINCT FROM v_worker_company THEN
    RAISE EXCEPTION 'company_id אינו תואם לעובד (appointment=% worker=%)',
      NEW.company_id, v_worker_company;
  END IF;

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

DROP TRIGGER IF EXISTS lma_company_consistency ON lifting_machine_appointments;
CREATE TRIGGER lma_company_consistency
  BEFORE INSERT OR UPDATE ON lifting_machine_appointments
  FOR EACH ROW EXECUTE FUNCTION enforce_lma_company();

-- ================================================================
-- STEP 3: lifting_machine_appointments — RLS policies
-- ================================================================

DROP POLICY IF EXISTS "Auth users can manage lifting_machine_appointments"
  ON lifting_machine_appointments;

DROP POLICY IF EXISTS "lma_select_own_company"  ON lifting_machine_appointments;
DROP POLICY IF EXISTS "lma_insert_own_company"  ON lifting_machine_appointments;
DROP POLICY IF EXISTS "lma_update_own_company"  ON lifting_machine_appointments;
DROP POLICY IF EXISTS "lma_delete_own_company"  ON lifting_machine_appointments;
DROP POLICY IF EXISTS "lma_service_all"         ON lifting_machine_appointments;

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

-- ================================================================
-- STEP 4: entity_notes — הוספת company_id
-- ================================================================

ALTER TABLE entity_notes
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE RESTRICT;

-- Backfill פולימורפי — כל entity_type בנפרד
UPDATE entity_notes en
SET company_id = w.company_id
FROM workers w
WHERE en.entity_id = w.id AND en.entity_type = 'worker' AND en.company_id IS NULL;

UPDATE entity_notes en
SET company_id = v.company_id
FROM vehicles v
WHERE en.entity_id = v.id AND en.entity_type = 'vehicle' AND en.company_id IS NULL;

UPDATE entity_notes en
SET company_id = he.company_id
FROM heavy_equipment he
WHERE en.entity_id = he.id AND en.entity_type = 'heavy_equipment' AND en.company_id IS NULL;

UPDATE entity_notes en
SET company_id = le.company_id
FROM lifting_equipment le
WHERE en.entity_id = le.id AND en.entity_type = 'lifting_equipment' AND en.company_id IS NULL;

UPDATE entity_notes en
SET company_id = s.company_id
FROM subcontractors s
WHERE en.entity_id = s.id AND en.entity_type = 'subcontractor' AND en.company_id IS NULL;

-- וודא אין NULL
DO $$
DECLARE v_null bigint;
BEGIN
  SELECT count(*) INTO v_null FROM entity_notes WHERE company_id IS NULL;
  IF v_null > 0 THEN
    RAISE EXCEPTION 'Batch 6 Safety: % הערות ב-entity_notes ללא company_id אחרי backfill (ייתכן orphaned notes)', v_null;
  END IF;
END $$;

-- NOT NULL constraint
ALTER TABLE entity_notes
  ALTER COLUMN company_id SET NOT NULL;

-- אינדקס
CREATE INDEX IF NOT EXISTS idx_entity_notes_company_id
  ON entity_notes (company_id);

-- ================================================================
-- STEP 5: entity_notes — consistency trigger
-- ================================================================

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

DROP TRIGGER IF EXISTS entity_notes_company_consistency ON entity_notes;
CREATE TRIGGER entity_notes_company_consistency
  BEFORE INSERT OR UPDATE ON entity_notes
  FOR EACH ROW EXECUTE FUNCTION enforce_entity_notes_company();

-- ================================================================
-- STEP 6: entity_notes — RLS policies
-- ================================================================

DROP POLICY IF EXISTS "authenticated manage notes"          ON entity_notes;
DROP POLICY IF EXISTS "entity_notes_select_own_company"    ON entity_notes;
DROP POLICY IF EXISTS "entity_notes_insert_own_company"    ON entity_notes;
DROP POLICY IF EXISTS "entity_notes_update_own_company"    ON entity_notes;
DROP POLICY IF EXISTS "entity_notes_delete_own_company"    ON entity_notes;
DROP POLICY IF EXISTS "entity_notes_service_all"           ON entity_notes;

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

-- ================================================================
-- STEP 7: safety_briefings — RLS fix
-- ================================================================

DROP POLICY IF EXISTS "authenticated users can read" ON safety_briefings;
DROP POLICY IF EXISTS "service role full access"     ON safety_briefings;
DROP POLICY IF EXISTS "safety_briefings_worker_select" ON safety_briefings;
DROP POLICY IF EXISTS "safety_briefings_service_all"   ON safety_briefings;

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

-- ================================================================
-- STEP 8: height_restrictions — RLS fix
-- ================================================================

DROP POLICY IF EXISTS "Auth users can manage height_restrictions" ON height_restrictions;
DROP POLICY IF EXISTS "height_restrictions_worker_select"        ON height_restrictions;
DROP POLICY IF EXISTS "height_restrictions_service_all"          ON height_restrictions;

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

-- ================================================================
-- STEP 9: professional_licenses — RLS
-- ================================================================

ALTER TABLE professional_licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "professional_licenses_worker_select" ON professional_licenses;
DROP POLICY IF EXISTS "professional_licenses_service_all"   ON professional_licenses;

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

-- ================================================================
-- STEP 10: manager_licenses — RLS fix
-- ================================================================

DROP POLICY IF EXISTS "manager_licenses_authenticated"    ON manager_licenses;
DROP POLICY IF EXISTS "manager_licenses_worker_select"    ON manager_licenses;
DROP POLICY IF EXISTS "manager_licenses_service_all"      ON manager_licenses;

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

-- ================================================================
-- STEP 11: Pre-commit assertions
-- ================================================================

DO $$
DECLARE
  v_lma_null    bigint;
  v_en_null     bigint;
  v_lma_trigger boolean;
  v_en_trigger  boolean;
BEGIN
  SELECT count(*) INTO v_lma_null FROM lifting_machine_appointments WHERE company_id IS NULL;
  SELECT count(*) INTO v_en_null FROM entity_notes WHERE company_id IS NULL;
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'lifting_machine_appointments' AND t.tgname = 'lma_company_consistency'
  ) INTO v_lma_trigger;
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'entity_notes' AND t.tgname = 'entity_notes_company_consistency'
  ) INTO v_en_trigger;

  IF v_lma_null > 0 THEN
    RAISE EXCEPTION 'Pre-commit: % NULLs ב-lifting_machine_appointments.company_id', v_lma_null;
  END IF;
  IF v_en_null > 0 THEN
    RAISE EXCEPTION 'Pre-commit: % NULLs ב-entity_notes.company_id', v_en_null;
  END IF;
  IF NOT v_lma_trigger THEN
    RAISE EXCEPTION 'Pre-commit: lma_company_consistency trigger חסר';
  END IF;
  IF NOT v_en_trigger THEN
    RAISE EXCEPTION 'Pre-commit: entity_notes_company_consistency trigger חסר';
  END IF;
END $$;

-- Confirmation row
SELECT
  'BATCH 6 MIGRATION COMPLETE' AS status,
  (SELECT count(*) FROM lifting_machine_appointments)                    AS lma_total,
  (SELECT count(*) FROM lifting_machine_appointments WHERE company_id IS NOT NULL) AS lma_scoped,
  (SELECT count(*) FROM entity_notes)                                    AS en_total,
  (SELECT count(*) FROM entity_notes WHERE company_id IS NOT NULL)       AS en_scoped;

COMMIT;
