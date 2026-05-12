-- ================================================================
-- migration_profiles.sql — ניהול משתמשים
-- idempotent — בטוח להרצה חוזרת, עצמאי לחלוטין
-- ================================================================

-- 1. פונקציות (CREATE OR REPLACE — בטוח חוזר)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION normalize_username()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.username IS NOT NULL THEN
    NEW.username = lower(trim(NEW.username));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. טבלה
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT        NOT NULL,
  username    TEXT        UNIQUE,
  email       TEXT        UNIQUE NOT NULL,
  role        TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  job_title   TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 3. Triggers — DROP IF EXISTS לפני CREATE
DROP TRIGGER IF EXISTS profiles_normalize_username ON profiles;
CREATE TRIGGER profiles_normalize_username
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION normalize_username();

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 5. Policies — DROP IF EXISTS לפני CREATE
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- 6. אינדקסים
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_email    ON profiles(email);

-- הערה: אין צורך ב-UPDATE role='viewer'→'user'
-- CHECK constraint מונע הכנסת ערך שאינו 'admin'/'user',
-- כך שאין אפשרות שיהיה שורה עם role='viewer' בטבלה זו.
