-- Phase 2 fixes: entity_notes table + archive columns
-- Idempotent: safe to run multiple times

-- ── entity_notes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.entity_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('worker', 'vehicle', 'heavy_equipment', 'lifting_equipment', 'subcontractor')),
  entity_id    UUID NOT NULL,
  content      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'needs_attention')),
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_notes_entity ON public.entity_notes (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_notes_status  ON public.entity_notes (status);

ALTER TABLE public.entity_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'entity_notes' AND policyname = 'authenticated_all'
  ) THEN
    CREATE POLICY authenticated_all ON public.entity_notes
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── archive columns: workers ──────────────────────────────────────────────────
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS is_archived  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  TEXT;

CREATE INDEX IF NOT EXISTS idx_workers_is_archived ON public.workers (is_archived);

-- ── archive columns: vehicles ─────────────────────────────────────────────────
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS is_archived  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  TEXT;

CREATE INDEX IF NOT EXISTS idx_vehicles_is_archived ON public.vehicles (is_archived);

-- ── archive columns: heavy_equipment ─────────────────────────────────────────
ALTER TABLE public.heavy_equipment
  ADD COLUMN IF NOT EXISTS is_archived  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  TEXT;

CREATE INDEX IF NOT EXISTS idx_heavy_equipment_is_archived ON public.heavy_equipment (is_archived);

-- ── archive columns: lifting_equipment ───────────────────────────────────────
ALTER TABLE public.lifting_equipment
  ADD COLUMN IF NOT EXISTS is_archived  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  TEXT;

CREATE INDEX IF NOT EXISTS idx_lifting_equipment_is_archived ON public.lifting_equipment (is_archived);

-- ── archive columns: subcontractors ──────────────────────────────────────────
ALTER TABLE public.subcontractors
  ADD COLUMN IF NOT EXISTS is_archived  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  TEXT;

CREATE INDEX IF NOT EXISTS idx_subcontractors_is_archived ON public.subcontractors (is_archived);
