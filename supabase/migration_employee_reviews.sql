-- =============================================================================
-- Employee Reviews Module — DB Migration
-- Tables: manager_user_mappings, worker_review_assignments,
--         worker_weekly_reviews, worker_transfer_audit
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. manager_user_mappings
--    Links a worker row (site manager) to a SafeDoc profile (auth user).
--    One worker <-> one user per company (both sides unique within company).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manager_user_mappings (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID        NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  manager_worker_id  UUID        NOT NULL REFERENCES workers(id)    ON DELETE CASCADE,
  user_id            UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  created_by         UUID                 REFERENCES profiles(id)   ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT mum_unique_manager  UNIQUE (company_id, manager_worker_id),
  CONSTRAINT mum_unique_user     UNIQUE (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS mum_company_idx        ON manager_user_mappings (company_id);
CREATE INDEX IF NOT EXISTS mum_user_idx           ON manager_user_mappings (user_id);
CREATE INDEX IF NOT EXISTS mum_manager_worker_idx ON manager_user_mappings (manager_worker_id);

ALTER TABLE manager_user_mappings ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; app layer enforces company_id isolation.
CREATE POLICY "service_role_all_mum"
  ON manager_user_mappings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. worker_review_assignments
--    Weekly snapshot: which manager is assigned to evaluate which worker.
--    One assignment per (company, worker, week_start). week_start is always
--    the Sunday that begins the Israeli business week (stored as DATE).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS worker_review_assignments (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID        NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  worker_id            UUID        NOT NULL REFERENCES workers(id)    ON DELETE CASCADE,
  evaluator_manager_id UUID                 REFERENCES workers(id)    ON DELETE SET NULL,
  week_start           DATE        NOT NULL,
  assignment_source    TEXT        NOT NULL
    CHECK (assignment_source IN ('responsible_manager', 'manual_override', 'snapshot')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT wra_unique_worker_week UNIQUE (company_id, worker_id, week_start)
);

CREATE INDEX IF NOT EXISTS wra_company_week_idx   ON worker_review_assignments (company_id, week_start);
CREATE INDEX IF NOT EXISTS wra_manager_week_idx   ON worker_review_assignments (evaluator_manager_id, week_start);
CREATE INDEX IF NOT EXISTS wra_worker_idx         ON worker_review_assignments (worker_id);

ALTER TABLE worker_review_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_wra"
  ON worker_review_assignments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. worker_weekly_reviews
--    Actual review data: 6 ratings (1-5) per worker per week.
--    is_not_evaluable=true marks workers the manager could not assess this week.
--    submitted_at is NULL while the review is a draft; set on final submit.
--    Unique per (company, worker, week_start) — one review per worker per week.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS worker_weekly_reviews (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID        NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  worker_id            UUID        NOT NULL REFERENCES workers(id)    ON DELETE CASCADE,
  evaluator_manager_id UUID                 REFERENCES workers(id)    ON DELETE SET NULL,
  reviewer_user_id     UUID                 REFERENCES profiles(id)   ON DELETE SET NULL,
  week_start           DATE        NOT NULL,

  productivity_rating  SMALLINT    CHECK (productivity_rating  BETWEEN 1 AND 5),
  quality_rating       SMALLINT    CHECK (quality_rating       BETWEEN 1 AND 5),
  reliability_rating   SMALLINT    CHECK (reliability_rating   BETWEEN 1 AND 5),
  discipline_rating    SMALLINT    CHECK (discipline_rating    BETWEEN 1 AND 5),
  teamwork_rating      SMALLINT    CHECK (teamwork_rating      BETWEEN 1 AND 5),
  safety_rating        SMALLINT    CHECK (safety_rating        BETWEEN 1 AND 5),

  is_not_evaluable     BOOLEAN     NOT NULL DEFAULT FALSE,
  not_evaluable_reason TEXT,
  manager_comment      TEXT,

  submitted_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT wwr_unique_worker_week UNIQUE (company_id, worker_id, week_start),

  -- If a review is submitted it must either have all 6 ratings or be marked not-evaluable.
  CONSTRAINT wwr_submitted_completeness CHECK (
    submitted_at IS NULL
    OR is_not_evaluable = TRUE
    OR (
      productivity_rating IS NOT NULL AND
      quality_rating      IS NOT NULL AND
      reliability_rating  IS NOT NULL AND
      discipline_rating   IS NOT NULL AND
      teamwork_rating     IS NOT NULL AND
      safety_rating       IS NOT NULL
    )
  ),

  -- not_evaluable_reason only makes sense when is_not_evaluable is true.
  CONSTRAINT wwr_not_evaluable_reason CHECK (
    NOT_evaluable_reason IS NULL OR is_not_evaluable = TRUE
  )
);

CREATE INDEX IF NOT EXISTS wwr_company_week_idx   ON worker_weekly_reviews (company_id, week_start);
CREATE INDEX IF NOT EXISTS wwr_manager_week_idx   ON worker_weekly_reviews (evaluator_manager_id, week_start);
CREATE INDEX IF NOT EXISTS wwr_worker_idx         ON worker_weekly_reviews (worker_id);
CREATE INDEX IF NOT EXISTS wwr_submitted_idx      ON worker_weekly_reviews (company_id, submitted_at)
  WHERE submitted_at IS NOT NULL;

ALTER TABLE worker_weekly_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_wwr"
  ON worker_weekly_reviews
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Automatically update updated_at on every row change.
CREATE OR REPLACE FUNCTION update_wwr_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER wwr_updated_at_trigger
  BEFORE UPDATE ON worker_weekly_reviews
  FOR EACH ROW EXECUTE FUNCTION update_wwr_updated_at();

-- ---------------------------------------------------------------------------
-- 4. worker_transfer_audit
--    Immutable audit trail for worker claim / transfer / unassign actions.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS worker_transfer_audit (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  worker_id       UUID        NOT NULL REFERENCES workers(id)    ON DELETE CASCADE,
  week_start      DATE        NOT NULL,
  from_manager_id UUID                 REFERENCES workers(id)    ON DELETE SET NULL,
  to_manager_id   UUID                 REFERENCES workers(id)    ON DELETE SET NULL,
  action          TEXT        NOT NULL
    CHECK (action IN ('claim', 'transfer', 'unassign')),
  performed_by    UUID                 REFERENCES profiles(id)   ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wta_company_week_idx ON worker_transfer_audit (company_id, week_start);
CREATE INDEX IF NOT EXISTS wta_worker_idx       ON worker_transfer_audit (worker_id);
CREATE INDEX IF NOT EXISTS wta_performed_by_idx ON worker_transfer_audit (performed_by);

ALTER TABLE worker_transfer_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_wta"
  ON worker_transfer_audit
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
