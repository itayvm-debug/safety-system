# 06 preflight — results (live, read only)

- Run: 2026-11-18 ~08:30 UTC, by Claude Code via the Supabase connector (`execute_sql`), project `rwpahefpexizaicrrxoc` (SafeDoc, Production), role `postgres`.
- Query: `06_service_only_tables_preflight.sql` exactly (comments trimmed). No row content was returned.
- Exact rollback statements (section 15): `2026-11-18_06_section15_rollback.sql` in this folder.

## Raw result, by section

### 01 table
| table | kind | owner | rls | force_rls | rows |
|---|---|---|---|---|---|
| legal_acceptances_dedup_backup | r | postgres | f | f | 9 |
| manager_insurances | r | postgres | f | f | 0 |
| site_feedback | r | postgres | f | f | 0 |

### 02 table grant (all grantor `postgres`, none WITH GRANT OPTION; identical for the three tables)
| grantee | privileges |
|---|---|
| anon | DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| authenticated | DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| postgres | DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| service_role | DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |

No PUBLIC grant.

### 03 column grant
none (all three tables)

### 04 sequence
none (all three tables)

### 05 effective (identical for the three tables)
- anon: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE | any column privilege: true
- authenticated: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE | any column privilege: true
- service_role: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE | any column privilege: true

### 06 role membership
- anon: none
- authenticated: none

### 07 server
- service_role: bypassrls=t inherit=t
- current_user: postgres | can act as owner: all three = true

### 08 policy
none (all three tables)

### 09 dependent view / 10 function / 11 trigger / 12 publication / 13 inheritance
no rows (none exist)

### 14 default privilege (info)
- set by postgres: new tables -> anon: DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
- set by postgres: new tables -> authenticated: same
- set by supabase_admin: new tables -> anon: same
- set by supabase_admin: new tables -> authenticated: same

### 15 rollback sql
51 statements: 3 × `DISABLE ROW LEVEL SECURITY` + 3 tables × 2 roles × 8 privileges. Saved verbatim in `2026-11-18_06_section15_rollback.sql`.

## Analysis

1. **Exposure confirmed, still open:** RLS off and full anon/authenticated grants on all three tables. The anon key is public (it ships to the browser), so anyone could read, change or delete these tables through the REST API, including `TRUNCATE`.
2. **Real data at risk:** only `legal_acceptances_dedup_backup` has rows (9; according to the audit these hold emails and IPs). `site_feedback` and `manager_insurances` are empty.
3. **07 can run as written:** all preconditions hold — ordinary tables, owner `postgres` = current user, `service_role` has BYPASSRLS, no views, no functions, no triggers, no publications, no inheritance, no sequences, no column grants. Nothing can block or bypass the change.
4. **PG17 `MAINTAIN` privilege:** in 02 and in the rollback, not in the `privs` list of 05/07-3d/08. `REVOKE ALL` removes it, and 07 check 3b / 08 "client grants" count every ACL entry of any type, so it is covered. 09 Level B was updated to the exact section 15 (includes MAINTAIN).
5. **App impact: none expected.** Live code (`cd6cb91`) and local code use `site_feedback` only through `createServiceClient()` (service role, bypasses RLS, privileges unchanged); the other two tables have no code use. The API logs confirm it (next point).
6. **Actual access (open decision 13):** Supabase API logs cover only 2026-11-17 11:02 UTC → 2026-11-18 08:27 UTC (retention). In that window the only requests to these tables were 5 `HEAD` count requests to `site_feedback` from the app server with the secret (service) key. No anon/authenticated requests. Earlier access cannot be checked from here.
7. **Default privileges (open decision 12):** every new table in `public` is created fully open to anon/authenticated. Not changed by 07; any new table needs RLS/REVOKE in its own migration until this is decided.
