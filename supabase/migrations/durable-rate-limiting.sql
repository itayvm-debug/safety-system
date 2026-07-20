-- ================================================================
-- SafeDoc — Migration: Durable Rate Limiting
-- File: supabase/migrations/durable-rate-limiting.sql
-- Idempotent: safe to run multiple times (IF NOT EXISTS / OR REPLACE throughout)
--
-- WHAT THIS CREATES
-- ─────────────────
--   1. rate_limit_events  — append-only event log (one row per accepted request)
--   2. rate_limit_check() — sliding-window counter + atomic insert
--   3. rate_limit_cleanup() — time-bounded delete of expired rows
--
-- DESIGN DECISIONS
-- ────────────────
-- Event-log (one row per event) vs counter table (one row per window bucket):
--   • Event-log chosen because it enables per-IP / per-user audit queries,
--     does not require a separate cleanup pass to "reset" counters, and
--     naturally supports multiple overlapping windows for the same key.
--   • Trade-off: higher storage use at very high traffic. Acceptable for
--     an admin SaaS with O(100) active users.
--
-- Sliding-window semantics: the window is always [now() - window_seconds, now()].
--   • More accurate than fixed time buckets (no "reset cliff" effect).
--   • Consistent experience: a client who sends 9 requests spread over a
--     15-minute window does not suddenly get 10 more requests the moment
--     the clock ticks to the next bucket.
--
-- Race-condition safety: pg_advisory_xact_lock serializes concurrent calls
--   that share the same (key, action) pair.
--   • Two requests from the same IP for login arrive simultaneously. Both
--     acquire the same advisory lock — one blocks until the other commits,
--     ensuring COUNT + INSERT is atomic.
--   • Different (key, action) pairs use different lock integers — no
--     contention between unrelated callers.
--   • hashtext() produces a 32-bit INT. Collision probability across N
--     concurrent distinct keys ≈ N² / 2³² (birthday paradox). At hundreds
--     of distinct keys this is negligible; collisions only cause unnecessary
--     serialization, never incorrect counts.
--
-- clock_timestamp() vs now():
--   • now() returns the transaction start time (frozen for the duration).
--   • clock_timestamp() returns the actual wall-clock time.
--   • Rate-limiting windows must use wall-clock time so back-to-back
--     requests within the same DB transaction are counted correctly.
--
-- SECURITY DEFINER decision: NOT used.
--   • The application calls this function via the service_role key which
--     already bypasses RLS. SECURITY DEFINER would grant any role (including
--     anon / authenticated) the ability to call the function as postgres,
--     which is unnecessary and widens the attack surface.
--   • The RLS policy (service_role only) blocks direct table access from
--     anon / authenticated roles regardless.
--
-- Privacy (GDPR):
--   • The `key` column stores an opaque identifier. For IP-based limits
--     the application layer MUST hash the IP before passing it as `key`
--     (see lib/rate-limit/db.ts — sha256 of IP).
--   • The `ip` column stores the raw INET address for operational monitoring
--     (blocking decisions, incident response). This is personal data under
--     GDPR Art. 4(1). Retain only as long as necessary; rate_limit_cleanup()
--     enforces the retention window. Ensure this is disclosed in your
--     privacy policy and data retention documentation.
--   • user_id is a UUID (not directly PII) — included for per-user queries.
--
-- ROLLBACK
-- ────────
-- DROP FUNCTION IF EXISTS rate_limit_cleanup(integer);
-- DROP FUNCTION IF EXISTS rate_limit_check(text, text, integer, integer, inet, uuid);
-- DROP TABLE IF EXISTS rate_limit_events CASCADE;
-- ================================================================


-- ── 0. MIGRATION GUARD — legacy schema detection (H2) ────────────────
--
-- The original durable-rate-limiting.sql (superseded) created a counter table
-- with schema (key_hash TEXT, window_start BIGINT, count INT).
-- If that version was ever applied, this migration must not silently continue:
-- CREATE TABLE IF NOT EXISTS would be a no-op (leaving the old schema intact),
-- CREATE OR REPLACE FUNCTION would succeed, but the function would fail at
-- runtime with "column key does not exist".
--
-- Recovery: the table contains only transient operational counters — no
-- business data. Drop it manually and re-run this migration:
--   DROP TABLE rate_limit_events CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE  table_schema = 'public'
      AND  table_name   = 'rate_limit_events'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_schema = 'public'
      AND  table_name   = 'rate_limit_events'
      AND  column_name  = 'action'
  ) THEN
    RAISE EXCEPTION
      E'rate_limit_events exists with the legacy counter schema '
      E'(key_hash / window_start / count).\n'
      E'This table contains only transient rate-limit counters — no business data.\n'
      E'Recovery: run the following statement and then re-apply this migration:\n'
      E'  DROP TABLE rate_limit_events CASCADE;';
  END IF;
END $$;

-- ── 1. TABLE ──────────────────────────────────────────────────────────

-- One row per accepted (allowed) request.
-- Denied requests are NOT inserted — they do not consume storage.
-- This means storage is naturally bounded by the rate limit window × max_requests.

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id         UUID        NOT NULL DEFAULT gen_random_uuid(),
  -- Opaque rate-limit key. For IP-based limits: sha256(ip). For user-based: user_id string.
  -- Never store raw PII here — use the `ip` and `user_id` columns for that.
  key        TEXT        NOT NULL,
  -- Logical action name (e.g. 'login', 'export', 'upload', 'signed-url').
  -- Separates rate-limit namespaces so the same key can have independent
  -- windows for different actions.
  action     TEXT        NOT NULL,
  -- Raw client IP address. Personal data under GDPR — nullable, populated
  -- only when the application has an IP to record. Used for incident response
  -- and operational monitoring. Deleted by rate_limit_cleanup().
  ip         INET        NULL,
  -- UUID of the authenticated user, if known. NULL for unauthenticated requests.
  user_id    UUID        NULL,
  -- Wall-clock time of the event. Indexed for cleanup and window queries.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rate_limit_events_pkey PRIMARY KEY (id)
);

-- ── 2. INDEXES ────────────────────────────────────────────────────────

-- Primary lookup index: supports the sliding-window COUNT query.
-- Composite (key, action, created_at) allows the planner to:
--   • Equality-scan on key + action  (highly selective for any real traffic)
--   • Range-scan on created_at > now() - window  (avoids full-table scan)
-- DESC on created_at is not needed for COUNT(*) but would help if a
-- future query wants the N most-recent events without a sort step.
CREATE INDEX IF NOT EXISTS idx_rate_limit_key_action_created
  ON rate_limit_events (key, action, created_at);

-- Cleanup index: supports DELETE WHERE created_at < cutoff.
-- Separate index (not the composite above) because cleanup scans
-- created_at independently of key / action.
CREATE INDEX IF NOT EXISTS idx_rate_limit_created_at
  ON rate_limit_events (created_at);

-- ── Autovacuum tuning (M2) ────────────────────────────────────────────
-- rate_limit_events is a high-churn table (append-only inserts + bulk deletes,
-- zero updates). The default autovacuum threshold (20% dead rows) is too coarse:
-- large cleanup runs can leave millions of dead rows between vacuum cycles,
-- causing table bloat and degrading index scans.
-- Trigger autovacuum when 5% of rows are dead instead.
ALTER TABLE rate_limit_events SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

-- Partial index on ip: supports "show all events from this IP" queries
-- in incident-response scenarios. Partial (WHERE ip IS NOT NULL) avoids
-- indexing the majority of rows where ip is null (user-based limits).
CREATE INDEX IF NOT EXISTS idx_rate_limit_ip
  ON rate_limit_events (ip)
  WHERE ip IS NOT NULL;

-- Partial index on user_id: supports per-user audit queries.
CREATE INDEX IF NOT EXISTS idx_rate_limit_user_id
  ON rate_limit_events (user_id)
  WHERE user_id IS NOT NULL;

-- ── 3. RLS ────────────────────────────────────────────────────────────

-- Enable Row-Level Security. No authenticated or anon user may read,
-- insert, update or delete rows directly. All access is via service_role
-- (bypasses RLS) or via the SECURITY INVOKER functions below (called by
-- service_role from the Next.js application).

ALTER TABLE rate_limit_events ENABLE ROW LEVEL SECURITY;

-- Idempotent policy creation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = 'rate_limit_events'
      AND  policyname = 'rate_limit_service_role_only'
  ) THEN
    -- Allow all operations to service_role only.
    -- `USING (true)` — reads allowed; `WITH CHECK (true)` — writes allowed.
    CREATE POLICY rate_limit_service_role_only
      ON rate_limit_events
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ── 4. GRANT: table ───────────────────────────────────────────────────

-- Remove any default privileges granted to PUBLIC, anon, or authenticated.
-- service_role bypasses RLS entirely and needs no explicit GRANT.
REVOKE ALL ON TABLE rate_limit_events FROM PUBLIC;
REVOKE ALL ON TABLE rate_limit_events FROM anon;
REVOKE ALL ON TABLE rate_limit_events FROM authenticated;

-- ── 5. FUNCTION: rate_limit_check ────────────────────────────────────
--
-- Atomically counts events in the sliding window, and if allowed, inserts
-- the new event. Returns whether the request is allowed, how many requests
-- remain in the window, and when the window resets.
--
-- Parameters
-- ──────────
--   p_key           TEXT     — opaque rate-limit key (hashed IP, user_id, etc.)
--   p_action        TEXT     — action name ('login', 'export', ...)
--   p_window_seconds INT     — window size in seconds (e.g. 900 for 15 minutes)
--   p_max_requests  INT      — maximum allowed requests in the window
--   p_ip            INET     — raw client IP for the ip column (nullable)
--   p_user_id       UUID     — authenticated user UUID for the user_id col (nullable)
--
-- Returns (single row)
-- ───────────────────
--   allowed    BOOLEAN     — true if the request should proceed
--   remaining  INT         — requests remaining in the current window (0 if denied)
--   reset_at   TIMESTAMPTZ — time at which a new request will be accepted
--                            (when allowed: when this request's slot expires;
--                             when denied: when the oldest slot in the window expires)
--
-- Atomicity
-- ─────────
-- pg_advisory_xact_lock(hashtext(key), hashtext(action)) serializes concurrent
-- calls for the same (key, action) pair using the two-argument INT4 overload.
-- The two-argument form avoids hash collisions that arise when a separator
-- character is used (e.g. key='a:b' + action='c' ≡ key='a' + action='b:c').
-- The lock is held for the duration of the transaction and released on COMMIT
-- or ROLLBACK. This ensures COUNT + INSERT is effectively atomic — no two
-- calls for the same (key, action) pair can interleave their read-then-write.

CREATE OR REPLACE FUNCTION rate_limit_check(
  p_key            TEXT,
  p_action         TEXT,
  p_window_seconds INT,
  p_max_requests   INT,
  p_ip             INET DEFAULT NULL,
  p_user_id        UUID DEFAULT NULL
)
RETURNS TABLE(
  allowed   BOOLEAN,
  remaining INT,
  reset_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
-- SECURITY INVOKER (default): runs as the calling role (service_role).
-- service_role bypasses RLS so no SECURITY DEFINER is required.
AS $$
DECLARE
  v_now          TIMESTAMPTZ;
  v_window_start TIMESTAMPTZ;
  v_current_count INT;
  v_oldest       TIMESTAMPTZ;
BEGIN
  -- 1. Validate required parameters (H1).
  --    NULL in any required parameter produces silent misbehavior:
  --    NULL key/action skips the advisory lock entirely (pg_advisory_xact_lock
  --    on NULL is a no-op), and NULL window/max causes COUNT to return 0,
  --    effectively making every request allowed regardless of history.
  IF p_key IS NULL OR p_action IS NULL OR p_window_seconds IS NULL OR p_max_requests IS NULL THEN
    RAISE EXCEPTION
      'rate_limit_check: required parameter is NULL '
      '(key=%, action=%, window_seconds=%, max_requests=%)',
      p_key, p_action, p_window_seconds, p_max_requests;
  END IF;

  -- 2. Serialize concurrent calls for this (key, action) pair.
  --    Two-argument form (M1): avoids hash collision from separator characters.
  --    key='a:b', action='c'  and  key='a', action='b:c'  produced the same
  --    hash with the concatenation approach; the two-argument overload uses
  --    independent hash spaces, eliminating that ambiguity.
  --    Each argument is INT4 — no cast required for the (int4, int4) overload.
  PERFORM pg_advisory_xact_lock(hashtext(p_key), hashtext(p_action));

  -- 2. Capture wall-clock time AFTER acquiring the lock so all
  --    time comparisons within this serialized section are consistent.
  v_now          := clock_timestamp();
  v_window_start := v_now - (p_window_seconds * INTERVAL '1 second');

  -- 3. Count events in the current sliding window.
  SELECT COUNT(*) INTO v_current_count
  FROM   rate_limit_events
  WHERE  key        = p_key
    AND  action     = p_action
    AND  created_at > v_window_start;

  IF v_current_count < p_max_requests THEN
    -- ── ALLOWED ──────────────────────────────────────────────────────
    -- Insert the event with the captured wall-clock time so that
    -- the created_at value is consistent with v_window_start above.
    INSERT INTO rate_limit_events (key, action, ip, user_id, created_at)
    VALUES (p_key, p_action, p_ip, p_user_id, v_now);

    -- reset_at: when THIS request's slot will leave the window.
    -- Informational — tells the client the window horizon for this request.
    RETURN QUERY
    SELECT
      TRUE,
      (p_max_requests - v_current_count - 1)::INT,
      (v_now + (p_window_seconds * INTERVAL '1 second'))::TIMESTAMPTZ;

  ELSE
    -- ── DENIED ───────────────────────────────────────────────────────
    -- Do NOT insert — denied requests are not recorded.
    -- reset_at: when the oldest event in the window will expire.
    -- That is the earliest moment a new request will be allowed.
    SELECT MIN(created_at) INTO v_oldest
    FROM   rate_limit_events
    WHERE  key        = p_key
      AND  action     = p_action
      AND  created_at > v_window_start;

    RETURN QUERY
    SELECT
      FALSE,
      0::INT,
      (COALESCE(v_oldest, v_now) + (p_window_seconds * INTERVAL '1 second'))::TIMESTAMPTZ;
  END IF;
END;
$$;

-- ── 6. FUNCTION: rate_limit_cleanup ──────────────────────────────────
--
-- Deletes events older than p_max_age_hours hours.
-- Returns the number of rows deleted.
--
-- Design notes
-- ─────────────
-- • p_max_age_hours DEFAULT 24 means that at least 24 hours of history
--   is retained. Set higher for longer audit trails.
-- • The DELETE uses `created_at < cutoff` which is served by
--   idx_rate_limit_created_at — no sequential scan.
-- • Intended to be called periodically (e.g. Vercel Cron or scheduled
--   Supabase function) to keep the table small.
-- • Do not set p_max_age_hours below your longest rate-limit window,
--   or you will delete events that are still within an active window,
--   causing the rate limiter to under-count.

CREATE OR REPLACE FUNCTION rate_limit_cleanup(
  p_max_age_hours INT DEFAULT 24
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_cutoff  TIMESTAMPTZ;
  v_deleted INT;
BEGIN
  -- Retain recent history: only delete rows older than the retention window.
  v_cutoff := clock_timestamp() - (p_max_age_hours * INTERVAL '1 hour');

  DELETE FROM rate_limit_events
  WHERE  created_at < v_cutoff;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ── 7. GRANT: functions ───────────────────────────────────────────────

-- Revoke default PUBLIC execute privilege, then grant to service_role only.
-- anon and authenticated roles must never call these functions directly.

REVOKE ALL ON FUNCTION rate_limit_check(text, text, integer, integer, inet, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION rate_limit_cleanup(integer)                                FROM PUBLIC;

GRANT EXECUTE ON FUNCTION rate_limit_check(text, text, integer, integer, inet, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION rate_limit_cleanup(integer)                                TO service_role;

-- ── 8. VERIFICATION (SELECT only) ────────────────────────────────────
-- Run these statements after applying the migration to confirm success.
-- These do not modify any data.

-- 8a. Table exists
SELECT
  'rate_limit_events table' AS check_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE  table_schema = 'public' AND table_name = 'rate_limit_events'
    ) THEN 'PRESENT'
    ELSE 'MISSING'
  END AS status;

-- 8b. Indexes exist
SELECT
  indexname  AS index_name,
  tablename  AS table_name,
  indexdef   AS definition
FROM   pg_indexes
WHERE  schemaname = 'public'
  AND  tablename  = 'rate_limit_events'
ORDER BY indexname;

-- 8c. Functions exist with correct signatures
SELECT
  p.proname                                        AS function_name,
  pg_get_function_identity_arguments(p.oid)        AS arguments,
  CASE p.prosecdef WHEN true THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security
FROM   pg_proc      p
JOIN   pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public'
  AND  p.proname IN ('rate_limit_check', 'rate_limit_cleanup')
ORDER BY p.proname;

-- 8d. RLS policy
SELECT
  policyname,
  cmd,
  roles,
  qual
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  tablename  = 'rate_limit_events';

-- 8e. Row count, oldest event, newest event (all zero/null after fresh migration)
SELECT
  COUNT(*)   AS row_count,
  MIN(created_at) AS oldest_event,
  MAX(created_at) AS newest_event
FROM   rate_limit_events;
