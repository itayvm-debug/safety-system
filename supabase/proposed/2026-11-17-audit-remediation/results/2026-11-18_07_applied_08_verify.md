# 07 applied + 08 verification (live)

Project `rwpahefpexizaicrrxoc` (SafeDoc, Production), via the Supabase connector (`execute_sql`, role `postgres`), 2026-11-18 UTC.

## Sequence
1. 06 preflight (read only) → `2026-11-18_06_preflight_results.md`, rollback → `2026-11-18_06_section15_rollback.sql`.
2. Client probe BEFORE (anon + publishable key, `HEAD ... Prefer: count=exact`, status/count only):
   all three tables `200 OK`; `legal_acceptances_dedup_backup` `Content-Range: 0-8/9` → the 9 rows were reachable with the public key.
3. 07 dry run (file body as committed in `a15e2c3`, sha256 `ea98287…d22174`, ending in ROLLBACK): every precondition and check passed;
   after it, RLS was still off and anon still had SELECT → the dry run left nothing.
4. 07 applied (same body, COMMIT): no error.
5. 08 (read only): **17/17 ok**.
6. Client probe AFTER: all three tables, both keys → `401 Unauthorized`.

## 08 result
| check | object | value | ok |
|---|---|---|---|
| RLS enabled | all three | true | ✓ |
| client grants (table + column) | all three | 0 | ✓ |
| client effective access | 3 tables × anon/authenticated | none | ✓ |
| server privilege | site_feedback / service_role SELECT, INSERT, UPDATE, DELETE | true | ✓ |
| server bypasses RLS | service_role | true | ✓ |
| policies (unchanged) | all three | 0 (preflight: none) | = |
| rows (unchanged) | legal_acceptances_dedup_backup / manager_insurances / site_feedback | 9 / 0 / 0 (preflight: 9 / 0 / 0) | = |

No sequences on these tables, so no sequence rows.

## Rollback
`09_service_only_tables_rollback.sql` — Level A (site_feedback RLS off only) or Level B (exact pre-07 state, from section 15).
