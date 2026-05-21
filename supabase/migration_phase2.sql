-- ============================================================
-- SafeDoc Phase 2 Migration
-- הרץ את כל הפקודות האלה ב-Supabase SQL Editor לפי הסדר
-- ============================================================

-- ─── 1. טבלת הערות לישויות ───────────────────────────────────

CREATE TABLE IF NOT EXISTS entity_notes (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type  text        NOT NULL CHECK (entity_type IN ('worker','vehicle','heavy_equipment','lifting_equipment','subcontractor')),
  entity_id    uuid        NOT NULL,
  content      text        NOT NULL CHECK (length(trim(content)) > 0),
  status       text        NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','needs_attention')),
  created_by   text,
  created_at   timestamptz DEFAULT now() NOT NULL,
  updated_at   timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS entity_notes_entity_idx ON entity_notes(entity_type, entity_id);

ALTER TABLE entity_notes ENABLE ROW LEVEL SECURITY;

-- מאפשר לכל משתמש מאומת לנהל הערות
CREATE POLICY "authenticated manage notes" ON entity_notes
  FOR ALL USING (auth.role() = 'authenticated');

-- ─── 2. עמודות ארכיון לכל הישויות ──────────────────────────

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS is_archived  boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at  timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by  text;

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS is_archived  boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at  timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by  text;

ALTER TABLE heavy_equipment
  ADD COLUMN IF NOT EXISTS is_archived  boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at  timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by  text;

ALTER TABLE lifting_equipment
  ADD COLUMN IF NOT EXISTS is_archived  boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at  timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by  text;

ALTER TABLE subcontractors
  ADD COLUMN IF NOT EXISTS is_archived  boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at  timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by  text;

-- אינדקסים לביצועים — מסנן ישויות לא בארכיון
CREATE INDEX IF NOT EXISTS workers_not_archived_idx          ON workers(is_archived)          WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS vehicles_not_archived_idx         ON vehicles(is_archived)         WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS heavy_equipment_not_archived_idx  ON heavy_equipment(is_archived)  WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS lifting_equipment_not_archived_idx ON lifting_equipment(is_archived) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS subcontractors_not_archived_idx   ON subcontractors(is_archived)   WHERE is_archived = false;
