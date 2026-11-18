# DB hardening — applied in production 2026-11-18

Owner instruction 2026-11-18 ("תתקן הכל כולל הכל"), HANDOFF open item 12 and audit follow-ups.

## Why
- Every new table in `public` was created with full privileges for `anon` and `authenticated` (Supabase default
  privileges). RLS was the only barrier; the three tables locked earlier today were exposed exactly this way.
- The application never uses those roles on tables: the anon key is used only for
  `supabase.auth.signInWithPassword` (Auth API) in `app/api/auth/login/route.ts`; all table access is `createServiceClient()`.
- Nothing checked the live DB for such states, so a missing migration (rate limiting) went unnoticed.

## Preflight (live, read only)
- 30 tables in `public`, all with RLS on. 25 of them: all 8 privileges for anon and authenticated (400 ACL entries,
  grantor postgres, no grant option). No sequences. 9 trigger functions: EXECUTE for PUBLIC, anon, authenticated.
- Default privileges (by postgres in public): tables 8 privileges, sequences SELECT/UPDATE/USAGE, functions EXECUTE — for anon and authenticated.
- 9 trigger functions without a fixed `search_path` (advisor `function_search_path_mutable`).

## Changes (02_apply.sql + supabase/migrations/safedoc-health-check.sql)
1. `REVOKE ALL ON ALL TABLES / SEQUENCES / FUNCTIONS IN SCHEMA public FROM anon, authenticated`.
2. `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ... FROM anon, authenticated` (tables, sequences, functions).
3. `SET search_path = public, pg_temp` on the 9 trigger functions.
4. `public.safedoc_health_check()` — 10 read-only checks, EXECUTE for service_role only.
Not changed: RLS policies, data, service_role, storage, `supabase_admin` default privileges (not alterable by postgres; the health check would flag any table they produce).

## Run log
1. Dry run with ROLLBACK, health check run as `service_role` inside it: 10/10 ok. (First attempt had a syntax error in my
   summary SELECT; the transaction aborted and nothing was kept — verified.)
2. Negative test: the check alone against the pre-change state → "no client table access" false, "closed defaults" false.
3. Applied with COMMIT + `NOTIFY pgrst, 'reload schema'`.
4. `SELECT * FROM safedoc_health_check()` → 10/10 ok.
5. Outside with the public anon key: workers, companies, profiles, documents, safety_briefings, rpc/safedoc_health_check → 401.
6. App after the change (Internal QA session): /api/workers 200 (6), /dashboard 200; Supabase logs: 32 server requests, all 200.

## Rollback
`04_rollback.sql` — restores the exact grants and default privileges recorded above (ends in ROLLBACK; switch to COMMIT).
