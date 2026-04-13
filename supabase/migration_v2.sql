-- ================================================================
-- Migration v2 — שדרוגים כלליים
-- הרץ ב-Supabase SQL Editor לאחר migration_subcontractors.sql
-- ================================================================

-- ───── עובדים ─────
ALTER TABLE workers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true NOT NULL;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS project_name TEXT;

-- ───── מסמכים ─────
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT true NOT NULL;

-- ───── איסורי עבודה בגובה ─────
CREATE TABLE IF NOT EXISTS height_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  conducted_by TEXT,
  signature_url TEXT,
  file_url TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE height_restrictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can manage height_restrictions"
  ON height_restrictions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ───── כלי צמ"ה ─────
CREATE TABLE IF NOT EXISTS heavy_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  license_number TEXT,
  image_url TEXT,
  license_file_url TEXT,
  license_expiry DATE,
  insurance_file_url TEXT,
  insurance_expiry DATE,
  inspection_file_url TEXT,
  inspection_expiry DATE,
  subcontractor_id UUID REFERENCES subcontractors(id) ON DELETE SET NULL,
  project_name TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER heavy_equipment_updated_at
  BEFORE UPDATE ON heavy_equipment
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE heavy_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can manage heavy_equipment"
  ON heavy_equipment FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ───── ציוד הרמה ─────
CREATE TABLE IF NOT EXISTS lifting_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  image_url TEXT,
  inspection_file_url TEXT,
  inspection_expiry DATE,
  subcontractor_id UUID REFERENCES subcontractors(id) ON DELETE SET NULL,
  project_name TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER lifting_equipment_updated_at
  BEFORE UPDATE ON lifting_equipment
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE lifting_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can manage lifting_equipment"
  ON lifting_equipment FOR ALL TO authenticated USING (true) WITH CHECK (true);
