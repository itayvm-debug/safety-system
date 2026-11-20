-- 2026-11-20 error monitoring — read-only preflight.
-- Expect: app_error_events does not exist yet; safedoc_health_check exists (its current body is saved in 04_rollback.sql).
SELECT to_regclass('public.app_error_events') AS app_error_events_exists,
       to_regprocedure('public.safedoc_health_check()') AS health_check_exists;
