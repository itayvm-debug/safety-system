-- ================================================================
-- Migration: Lifting Machine Operator Appointments
-- הרץ ב-Supabase SQL Editor
-- ================================================================

-- ───── עובדים — שדות נוספים למינוי מפעיל ─────
ALTER TABLE workers ADD COLUMN IF NOT EXISTS father_name TEXT;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS birth_year SMALLINT;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS profession TEXT;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS is_crane_operator BOOLEAN DEFAULT false NOT NULL;

-- ───── כלי צמ"ה — שדות נוספים לתיאור מכונה ─────
ALTER TABLE heavy_equipment ADD COLUMN IF NOT EXISTS manufacturer TEXT;
ALTER TABLE heavy_equipment ADD COLUMN IF NOT EXISTS machine_identifier TEXT;
ALTER TABLE heavy_equipment ADD COLUMN IF NOT EXISTS safe_working_load TEXT;
ALTER TABLE heavy_equipment ADD COLUMN IF NOT EXISTS power_type TEXT;

-- ───── מינוי מפעיל מכונת הרמה ─────
CREATE TABLE IF NOT EXISTS lifting_machine_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES heavy_equipment(id) ON DELETE SET NULL,

  -- תיאור המכונה (מועתק מהציוד או מוזן ידנית)
  machine_name TEXT NOT NULL,
  manufacturer TEXT,
  machine_identifier TEXT,
  safe_working_load TEXT,
  power_type TEXT, -- 'mechanical' | 'electric' | 'hydraulic' | 'pneumatic'

  -- פרטי הממנה (מוזנים ידנית לכל מינוי)
  appointer_name TEXT NOT NULL,
  appointer_role TEXT,
  appointer_phone TEXT,
  appointer_address TEXT,
  appointer_zip TEXT,

  -- תאריך מינוי
  appointment_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- חתימות וקובץ
  operator_signature_url TEXT,
  appointer_signature_url TEXT,
  pdf_url TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER lifting_machine_appointments_updated_at
  BEFORE UPDATE ON lifting_machine_appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE lifting_machine_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can manage lifting_machine_appointments"
  ON lifting_machine_appointments FOR ALL TO authenticated USING (true) WITH CHECK (true);
