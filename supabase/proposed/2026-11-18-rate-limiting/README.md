# Durable rate limiting — applied in production 2026-11-18

Owner decision 2026-11-18 ("כן, הפעל"), HANDOFF open item 20.

## Why
`supabase/migrations/durable-rate-limiting.sql` had never been applied: no `rate_limit_events`, no `rate_limit_check()`.
Every call from `lib/rate-limit/db.ts` returned 404 (≈600/hour of traffic on 17.11, 187 in 15 min on 18.11) and the code
fails open, so login (10 / 15 min / IP), upload (30 / 10 min / user), export (5 / 5 min / user) and signed URLs
(200 / min / user) were never limited.

## Preflight (live, read only)
- No `rate_limit*` table or function. `gen_random_uuid` available (PG17). Run as `postgres`.
- Default privileges in `public` (set by postgres): new **functions** get EXECUTE for anon and authenticated **by name**;
  new tables get all privileges for anon/authenticated/service_role.
  → the migration's `REVOKE ... FROM PUBLIC` alone would have left both functions callable from the browser.

## Changes to the migration file before applying
- `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated` (both functions).
- `SET search_path = public, pg_temp` on both functions (Supabase advisor `function_search_path_mutable`).

## Run log (via Supabase connector as postgres)
1. Dry run (sections 0–7 + checks + self-test, ROLLBACK): passed. Self-test with max 2 / 60 s → allow, allow, deny;
   `rate_limit_cleanup(0)` deleted exactly the 2 test rows.
2. Applied (same SQL without the self-test, COMMIT) + `NOTIFY pgrst, 'reload schema'`.
3. Checks inside the transaction: RLS on; anon/authenticated have no table privileges and cannot EXECUTE either
   function; service_role can EXECUTE both and has SELECT/INSERT/DELETE.
4. Outside with the public anon key: `rpc/rate_limit_check` 401, `rpc/rate_limit_cleanup` 401, `rate_limit_events` 401.

## Retention
`GET /api/maintenance/rate-limit-cleanup` (Vercel Cron, daily 02:30 UTC, `CRON_SECRET`) calls
`rate_limit_cleanup(24)`: events — including raw IPs — are kept at most ~48 h (24 h + up to one day between runs).

## Rollback
From the migration header (removes the limiter; the code fails open again):
```sql
DROP FUNCTION IF EXISTS rate_limit_cleanup(integer);
DROP FUNCTION IF EXISTS rate_limit_check(text, text, integer, integer, inet, uuid);
DROP TABLE IF EXISTS rate_limit_events CASCADE;
```
Quick relief without dropping anything (e.g. users locked out): `DELETE FROM rate_limit_events WHERE action = 'login';`
