# Two-factor sign-in — DB change applied in production 2026-11-18

Owner decision 2026-11-18 (accepted recommendations: mandatory for platform admins, admin reset, 14-day transition).

## Applied (via Supabase connector, as postgres)
1. Dry run (ROLLBACK) of `supabase/migrations/user-mfa-factors.sql`: RLS on, anon/authenticated SELECT false, service_role INSERT/UPDATE true.
2. COMMIT: table `public.user_mfa_factors` + `updated_at` trigger; `safedoc_health_check()` replaced to require the table; `NOTIFY pgrst, 'reload schema'`.
3. `SELECT * FROM safedoc_health_check()` → 10/10 ok.
The table was created **before** the code was deployed (login reads it; a missing table would fail every sign-in).

## Environment
`MFA_ENCRYPTION_KEY` (32 random bytes, base64) added in Vercel as Sensitive for Production, Preview and Development
(one value: all environments share the same database). Generated and piped directly; never printed or stored elsewhere.
**Losing or changing it makes every enrolled factor undecryptable** — users with MFA could no longer sign in until an admin resets them.

## Rollback
Code first (revert the MFA commit), then: `DROP TABLE IF EXISTS public.user_mfa_factors;` and restore the previous health check
(remove `'user_mfa_factors'` from the required-tables array in `supabase/migrations/safedoc-health-check.sql` and re-run it).
