-- ================================================================
-- Migration: Worker Identity Model
-- עדכון מודל זהות עובד + אינדקסים ייחודיים
-- הרץ ב-Supabase SQL Editor
-- ================================================================

-- 1. הוספת עמודות זהות חדשות
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS is_foreign_worker BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS national_id        TEXT,
  ADD COLUMN IF NOT EXISTS passport_number    TEXT;

-- 2. העברת נתונים קיימים מ-id_number + worker_type
UPDATE workers SET
  is_foreign_worker = (worker_type = 'foreign'),
  national_id       = CASE WHEN worker_type = 'israeli' THEN id_number ELSE NULL END,
  passport_number   = CASE WHEN worker_type = 'foreign'  THEN id_number ELSE NULL END;

-- 3. שמירת id_number כ-nullable לתאימות אחורה (תבניות PDF)
ALTER TABLE workers ALTER COLUMN id_number DROP NOT NULL;
ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_id_number_key;

-- 4. אינדקסים ייחודיים לשדות החדשים
CREATE UNIQUE INDEX IF NOT EXISTS workers_national_id_unique
  ON workers (national_id)
  WHERE national_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS workers_passport_number_unique
  ON workers (passport_number)
  WHERE passport_number IS NOT NULL;

-- 5. worker_type — שמירת תאימות: ניתן להריץ בעתיד כדי להסיר את השדה
--    לא חובה להריץ כרגע. הקוד ממלא worker_type אוטומטית לפי is_foreign_worker.
--    כשתרצה להסיר לחלוטין:
--    ALTER TABLE workers DROP COLUMN worker_type;

-- 6. כלי צמ"ה: אינדקס ייחודי על מספר רישיון (optional field)
CREATE UNIQUE INDEX IF NOT EXISTS heavy_equipment_license_number_unique
  ON heavy_equipment (license_number)
  WHERE license_number IS NOT NULL AND trim(license_number) <> '';
