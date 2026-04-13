-- Migration: הוספת תמיכה ברישיונות מקצועיים אופציונליים
-- הרץ ב-Supabase SQL Editor

-- 1. הוספת עמודת license_name
ALTER TABLE documents ADD COLUMN IF NOT EXISTS license_name TEXT;

-- 2. עדכון CHECK constraint לכלול optional_license
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_doc_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_doc_type_check
  CHECK (doc_type IN ('id_document', 'height_permit', 'work_visa', 'optional_license'));

-- 3. הסרת UNIQUE constraint הישן (לא תקין עבור מספר רישיונות אופציונליים)
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_worker_id_doc_type_key;

-- 4. UNIQUE constraint חדש: לחובה — אחד מכל סוג. לרישיון אופציונלי — לפי שם
CREATE UNIQUE INDEX IF NOT EXISTS documents_required_unique
  ON documents (worker_id, doc_type)
  WHERE doc_type IN ('id_document', 'height_permit', 'work_visa');

CREATE UNIQUE INDEX IF NOT EXISTS documents_license_unique
  ON documents (worker_id, doc_type, license_name)
  WHERE doc_type = 'optional_license';
