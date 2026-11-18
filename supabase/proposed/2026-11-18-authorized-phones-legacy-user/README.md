# authorized_phones lockdown + legacy phone account ban (2026-11-18)

Owner decision 2026-11-18 ("כן, נעל וחסום") for HANDOFF open items 16–17.

| File | Type | |
|---|---|---|
| `01_preflight.sql` | read only | state before; results below |
| `02_apply.sql` | change | ends in ROLLBACK (dry run); COMMIT to apply |
| `03_verify.sql` | read only | every row `ok = true` |
| `04_rollback.sql` | change | exact pre-change state |

## Preflight result (live, 2026-11-18)
- `public.authorized_phones`: owner postgres, RLS **on**, 1 row, columns `id, phone, created_at`. Not used by application code.
- Grants (grantor postgres, no grant option): `anon` and `authenticated` — DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE. No column grants, no sequences.
- Policy: `authorized_phones_select` — SELECT, roles `{authenticated}`, PERMISSIVE, `USING (true)`. → any Supabase-authenticated user reads every row.
- No dependent views, no functions mentioning the table, no triggers, no publications.
- Legacy account (the only `%@safedoc.internal` user): id `9eb38eab-24da-4dba-b277-0929ffb4ab58`, no profile, no company membership, last sign-in 2026-04-12, `banned_until` NULL, 1 session (`9bd4e902-f909-4181-bbab-d7f92905d908`, `not_after` NULL), refresh tokens 13–16 revoked, **17 active**. Its password is derivable from the phone number (audit P0·2), and the active refresh token can mint new JWTs.
- No other user is banned.

## What 02 changes
1. `DROP POLICY authorized_phones_select` and `REVOKE ALL` on the table from PUBLIC, anon, authenticated (RLS stays on). Server (service_role) unchanged.
2. Legacy account: `banned_until = 2999-12-31` (GoTrue refuses sign-in and token refresh), refresh token 17 `revoked = true`. Nothing is deleted.

## Run log (live, 2026-11-18 ~09:33 UTC, via Supabase connector as postgres)
1. 01 preflight — results above.
2. 02 dry run (ROLLBACK) — all checks passed; state afterwards unchanged (policy present, authenticated SELECT, not banned, token 17 active).
3. 02 with COMMIT — no error.
4. 03 verify — 8/8 ok.
5. Outside: anon REST `authorized_phones` → 401. Site `/api/health` 200, `/login` 200.
