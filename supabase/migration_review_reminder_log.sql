-- ================================================================
-- SafeDoc — Migration: Review Reminder Log
-- File: supabase/migration_review_reminder_log.sql
-- Idempotent: safe to run multiple times (IF NOT EXISTS throughout)
--
-- PURPOSE
-- ───────
-- Provides durable idempotency for the weekly review reminder cron.
-- One row per (company_id, week_start, reminder_type) ensures the
-- reminder is sent at most once per cycle, even if the cron fires
-- twice (DST double-fire) or the endpoint is invoked manually.
--
-- The INSERT … ON CONFLICT DO NOTHING pattern is atomic at the DB
-- level via the unique constraint, making it race-safe for concurrent
-- invocations.
-- ================================================================

CREATE TABLE IF NOT EXISTS review_reminder_log (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      UUID        NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  week_start      DATE        NOT NULL,
  reminder_type   TEXT        NOT NULL DEFAULT 'weekly_review',
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipients_count INTEGER    NOT NULL DEFAULT 0
);

-- Unique constraint that enforces at-most-once per company/week/type
ALTER TABLE review_reminder_log
  DROP CONSTRAINT IF EXISTS rrl_unique_company_week_type;

ALTER TABLE review_reminder_log
  ADD CONSTRAINT rrl_unique_company_week_type
  UNIQUE (company_id, week_start, reminder_type);

CREATE INDEX IF NOT EXISTS rrl_company_week_idx
  ON review_reminder_log (company_id, week_start);

-- Row Level Security: service_role only (cron runs with service key)
ALTER TABLE review_reminder_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'review_reminder_log'
    AND policyname  = 'service_role_full_access'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY service_role_full_access ON review_reminder_log
        FOR ALL TO service_role USING (true) WITH CHECK (true)
    $policy$;
  END IF;
END $$;

COMMENT ON TABLE review_reminder_log IS
  'Idempotency log for weekly review reminder emails. '
  'One row per (company_id, week_start, reminder_type). '
  'INSERT … ON CONFLICT DO NOTHING prevents duplicate sends.';
