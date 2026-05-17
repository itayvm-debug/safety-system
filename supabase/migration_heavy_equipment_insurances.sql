-- ריבוי ביטוחים לכלי צמ"ה — מקביל למבנה vehicle_insurances
-- idempotent: בטוח להרצה חוזרת

-- טבלת ביטוחי כלי צמ"ה
CREATE TABLE IF NOT EXISTS heavy_equipment_insurances (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  heavy_equipment_id   UUID        NOT NULL REFERENCES heavy_equipment(id) ON DELETE CASCADE,
  insurance_type       TEXT        NOT NULL,
  file_url             TEXT,
  expiry_date          DATE,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE (heavy_equipment_id, insurance_type)
);

-- טריגר עדכון updated_at
DROP TRIGGER IF EXISTS heavy_equipment_insurances_updated_at ON heavy_equipment_insurances;
CREATE TRIGGER heavy_equipment_insurances_updated_at
  BEFORE UPDATE ON heavy_equipment_insurances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- העברת נתוני ביטוח קיימים (insurance_file_url / insurance_expiry) ל-'ביטוח חובה'
-- ON CONFLICT DO NOTHING — בטוח להרצה חוזרת
INSERT INTO heavy_equipment_insurances (heavy_equipment_id, insurance_type, file_url, expiry_date)
SELECT
  id,
  'ביטוח חובה',
  insurance_file_url,
  CASE WHEN insurance_expiry IS NOT NULL THEN insurance_expiry::DATE ELSE NULL END
FROM heavy_equipment
WHERE insurance_file_url IS NOT NULL
   OR insurance_expiry IS NOT NULL
ON CONFLICT (heavy_equipment_id, insurance_type) DO NOTHING;
