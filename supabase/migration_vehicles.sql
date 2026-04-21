-- ================================================================
-- Migration: Vehicles + Vehicle Number on Manager Licenses
-- הרץ ב-Supabase SQL Editor
-- ================================================================

-- 1. הוספת מספר רכב לטבלת רישיונות מנהל עבודה
ALTER TABLE manager_licenses ADD COLUMN IF NOT EXISTS vehicle_number TEXT;

-- 2. טבלת רכבים (שאינם כלי צמ"ה)
CREATE TABLE IF NOT EXISTS vehicles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type        TEXT NOT NULL,
  model               TEXT,
  vehicle_number      TEXT NOT NULL,
  image_url           TEXT,
  assigned_manager_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  project_name        TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. רישיון רכב (רשומה אחת לכל רכב)
CREATE TABLE IF NOT EXISTS vehicle_licenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id  UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  file_url    TEXT,
  expiry_date DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. ביטוחי רכב
CREATE TABLE IF NOT EXISTS vehicle_insurances (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id     UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  insurance_type TEXT NOT NULL, -- 'ביטוח חובה' | 'ביטוח מקיף' | 'ביטוח צד ג'
  file_url       TEXT,
  expiry_date    DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vehicle_id, insurance_type)
);

-- 5. אינדקסים לביצועים
CREATE INDEX IF NOT EXISTS vehicles_assigned_manager_idx ON vehicles (assigned_manager_id);
CREATE INDEX IF NOT EXISTS vehicle_licenses_vehicle_idx  ON vehicle_licenses (vehicle_id);
CREATE INDEX IF NOT EXISTS vehicle_insurances_vehicle_idx ON vehicle_insurances (vehicle_id);
