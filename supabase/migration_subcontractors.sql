-- ================================================================
-- Migration: הוספת קבלני משנה
-- הרץ ב-Supabase SQL Editor
-- ================================================================

-- 1. טבלת קבלני משנה
CREATE TABLE IF NOT EXISTS subcontractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. trigger לעדכון updated_at
CREATE TRIGGER subcontractors_updated_at
  BEFORE UPDATE ON subcontractors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. הוספת עמודה לטבלת עובדים
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS subcontractor_id UUID REFERENCES subcontractors(id) ON DELETE SET NULL;

-- 4. RLS
ALTER TABLE subcontractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read subcontractors"
  ON subcontractors FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert subcontractors"
  ON subcontractors FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update subcontractors"
  ON subcontractors FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete subcontractors"
  ON subcontractors FOR DELETE
  TO authenticated USING (true);
