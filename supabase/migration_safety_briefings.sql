-- Migration: הוספת טבלת תדריכי בטיחות
-- הרץ ב-Supabase SQL Editor

CREATE TABLE IF NOT EXISTS safety_briefings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id    UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  mode         TEXT NOT NULL CHECK (mode IN ('system', 'external')),
  language     TEXT CHECK (language IN ('hebrew', 'arabic', 'english', 'russian', 'thai')),
  conducted_by TEXT,
  signature_url TEXT,
  file_url     TEXT,
  briefed_at   DATE NOT NULL,
  expires_at   DATE NOT NULL,  -- תמיד = briefed_at + שנה, מחושב בקוד
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- אינדקס לשליפה מהירה של התדריך האחרון לכל עובד
CREATE INDEX IF NOT EXISTS safety_briefings_worker_date
  ON safety_briefings (worker_id, briefed_at DESC);

-- RLS
ALTER TABLE safety_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read"
  ON safety_briefings FOR SELECT TO authenticated USING (true);

CREATE POLICY "service role full access"
  ON safety_briefings FOR ALL TO service_role USING (true) WITH CHECK (true);
