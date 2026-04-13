-- ================================================================
-- SafeDoc - סכמת מסד נתונים
-- הרץ את הקובץ הזה ב-Supabase SQL Editor
-- ================================================================

-- 1. טבלת טלפונים מורשים
CREATE TABLE IF NOT EXISTS authorized_phones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE NOT NULL, -- פורמט E.164: +972501234567
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. טבלת עובדים
CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  id_number TEXT UNIQUE NOT NULL,
  worker_type TEXT NOT NULL CHECK (worker_type IN ('israeli', 'foreign')),
  phone TEXT,
  notes TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. טבלת מסמכים (אחד מכל סוג לכל עובד)
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('id_document', 'height_permit', 'work_visa')),
  file_url TEXT,
  expiry_date DATE,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(worker_id, doc_type)
);

-- 4. trigger לעדכון updated_at אוטומטי
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workers_updated_at
  BEFORE UPDATE ON workers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. Row Level Security (RLS)
ALTER TABLE authorized_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- כל משתמש מחובר יכול לקרוא/לכתוב (בשלב 1 כל המשתמשים המורשים שווים)
CREATE POLICY "authenticated users can read authorized_phones"
  ON authorized_phones FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated users can manage workers"
  ON workers FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated users can manage documents"
  ON documents FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ================================================================
-- הוספת Storage bucket לקבצים
-- ================================================================
-- הרץ ב-Supabase Dashboard → Storage → Create bucket
-- שם: worker-files
-- Privacy: Private (חשוב!)
--
-- הוסף policy לאחר יצירת הbucket:
-- INSERT policy: authenticated users
-- SELECT policy: authenticated users (signed URLs)
-- ================================================================

-- ================================================================
-- הוסף מספרי טלפון מורשים לאחר יצירת הטבלה:
-- INSERT INTO authorized_phones (phone) VALUES ('+972501234567');
-- ================================================================
