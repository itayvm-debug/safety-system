-- phase3_verify_cross_tenant_data.sql
-- Phase 3 Batch 3 — Consolidated cross-tenant data isolation diagnostic
--
-- OUTPUT  : ONE result table in Supabase SQL Editor.
-- SAFETY  : Strictly read-only. No INSERT / UPDATE / DELETE / DDL.
-- PATTERN : Single CTE chain → UNION ALL → one final SELECT.
-- USAGE   : Paste into Supabase SQL Editor and run.
--           All checks appear in the single Results pane.

WITH

-- ─────────────────────────────────────────────────────────────────────────────
-- Section 1 CTEs — per-company row counts
-- ─────────────────────────────────────────────────────────────────────────────

workers_by_co AS (
  SELECT company_id::text AS co_id, COUNT(*)::bigint AS cnt
  FROM   workers
  GROUP  BY company_id
),
vehicles_by_co AS (
  SELECT company_id::text AS co_id, COUNT(*)::bigint AS cnt
  FROM   vehicles
  GROUP  BY company_id
),
heavy_by_co AS (
  SELECT company_id::text AS co_id, COUNT(*)::bigint AS cnt
  FROM   heavy_equipment
  GROUP  BY company_id
),
lifting_by_co AS (
  SELECT company_id::text AS co_id, COUNT(*)::bigint AS cnt
  FROM   lifting_equipment
  GROUP  BY company_id
),
subs_by_co AS (
  SELECT company_id::text AS co_id, COUNT(*)::bigint AS cnt
  FROM   subcontractors
  GROUP  BY company_id
),
notes_by_co AS (
  SELECT company_id::text AS co_id, COUNT(*)::bigint AS cnt
  FROM   entity_notes
  GROUP  BY company_id
),

-- ─────────────────────────────────────────────────────────────────────────────
-- Section 2 CTE — NULL company_id counts (one row per table)
-- ─────────────────────────────────────────────────────────────────────────────

null_chk AS (
  SELECT 'workers'::text          AS tbl, COUNT(*)::bigint AS cnt FROM workers          WHERE company_id IS NULL
  UNION ALL
  SELECT 'vehicles',                       COUNT(*)::bigint        FROM vehicles          WHERE company_id IS NULL
  UNION ALL
  SELECT 'heavy_equipment',                COUNT(*)::bigint        FROM heavy_equipment   WHERE company_id IS NULL
  UNION ALL
  SELECT 'lifting_equipment',              COUNT(*)::bigint        FROM lifting_equipment WHERE company_id IS NULL
  UNION ALL
  SELECT 'subcontractors',                 COUNT(*)::bigint        FROM subcontractors    WHERE company_id IS NULL
  UNION ALL
  SELECT 'entity_notes',                   COUNT(*)::bigint        FROM entity_notes      WHERE company_id IS NULL
),

-- ─────────────────────────────────────────────────────────────────────────────
-- Section 3 CTE — cross-tenant FK violations
-- ─────────────────────────────────────────────────────────────────────────────

fk_chk AS (
  -- workers.subcontractor_id must belong to the same company as the worker
  SELECT 'workers.subcontractor_id'::text           AS rel, COUNT(*)::bigint AS cnt
  FROM   workers       w
  JOIN   subcontractors s ON s.id = w.subcontractor_id
  WHERE  w.subcontractor_id IS NOT NULL
    AND  w.company_id <> s.company_id

  UNION ALL

  -- vehicles.assigned_manager_id must belong to the same company as the vehicle
  SELECT 'vehicles.assigned_manager_id', COUNT(*)::bigint
  FROM   vehicles v
  JOIN   workers  wk ON wk.id = v.assigned_manager_id
  WHERE  v.assigned_manager_id IS NOT NULL
    AND  v.company_id <> wk.company_id

  UNION ALL

  -- heavy_equipment.subcontractor_id must belong to the same company as the machine
  SELECT 'heavy_equipment.subcontractor_id', COUNT(*)::bigint
  FROM   heavy_equipment he
  JOIN   subcontractors  s  ON s.id = he.subcontractor_id
  WHERE  he.subcontractor_id IS NOT NULL
    AND  he.company_id <> s.company_id
),

-- ─────────────────────────────────────────────────────────────────────────────
-- Section 4 CTE — company membership summary
-- ─────────────────────────────────────────────────────────────────────────────

membership AS (
  SELECT c.id::text           AS co_id,
         c.name               AS co_name,
         c.is_active          AS is_active,
         COUNT(cm.user_id)::bigint AS member_cnt
  FROM   companies c
  LEFT JOIN company_members cm
    ON   cm.company_id = c.id AND cm.is_active = true
  GROUP  BY c.id, c.name, c.is_active
),

-- ─────────────────────────────────────────────────────────────────────────────
-- Section 5 CTE — multi-tenant users (platform admin candidates)
-- ─────────────────────────────────────────────────────────────────────────────

multi_tenant AS (
  SELECT p.username,
         p.role                          AS platform_role,
         COUNT(cm.company_id)::bigint    AS co_count
  FROM   profiles p
  JOIN   company_members cm ON cm.user_id = p.id AND cm.is_active = true
  GROUP  BY p.id, p.username, p.role
  HAVING COUNT(cm.company_id) > 1
),

-- ─────────────────────────────────────────────────────────────────────────────
-- Section 6 CTE — site_feedback (platform-level table, no company_id by design)
-- ─────────────────────────────────────────────────────────────────────────────

feedback AS (
  SELECT COUNT(*)::bigint                                 AS total,
         (COUNT(*) FILTER (WHERE NOT is_handled))::bigint AS unhandled
  FROM   site_feedback
),

-- ─────────────────────────────────────────────────────────────────────────────
-- all_checks — every individual check as a single UNION ALL
-- Columns: section · table_name · check_name · company_id ·
--          row_count · expected_value · status · details
-- ─────────────────────────────────────────────────────────────────────────────

all_checks AS (

  -- ── 1a. Workers — rows per company ────────────────────────────────────────
  SELECT
    '1_row_counts'::text    AS section,
    'workers'::text         AS table_name,
    'rows_by_company'::text AS check_name,
    w.co_id                 AS company_id,
    w.cnt                   AS row_count,
    NULL::bigint            AS expected_value,
    'INFO'::text            AS status,
    COALESCE(c.name, '(unknown)') || ': ' || w.cnt::text || ' worker row(s)' AS details
  FROM workers_by_co w
  LEFT JOIN companies c ON c.id::text = w.co_id

  UNION ALL

  -- ── 1b. Vehicles — rows per company ───────────────────────────────────────
  SELECT '1_row_counts', 'vehicles', 'rows_by_company',
    v.co_id, v.cnt, NULL, 'INFO',
    COALESCE(c.name, '(unknown)') || ': ' || v.cnt::text || ' vehicle row(s)'
  FROM vehicles_by_co v
  LEFT JOIN companies c ON c.id::text = v.co_id

  UNION ALL

  -- ── 1c. Heavy equipment — rows per company ────────────────────────────────
  SELECT '1_row_counts', 'heavy_equipment', 'rows_by_company',
    h.co_id, h.cnt, NULL, 'INFO',
    COALESCE(c.name, '(unknown)') || ': ' || h.cnt::text || ' heavy equipment row(s)'
  FROM heavy_by_co h
  LEFT JOIN companies c ON c.id::text = h.co_id

  UNION ALL

  -- ── 1d. Lifting equipment — rows per company ──────────────────────────────
  SELECT '1_row_counts', 'lifting_equipment', 'rows_by_company',
    l.co_id, l.cnt, NULL, 'INFO',
    COALESCE(c.name, '(unknown)') || ': ' || l.cnt::text || ' lifting equipment row(s)'
  FROM lifting_by_co l
  LEFT JOIN companies c ON c.id::text = l.co_id

  UNION ALL

  -- ── 1e. Subcontractors — rows per company ─────────────────────────────────
  SELECT '1_row_counts', 'subcontractors', 'rows_by_company',
    s.co_id, s.cnt, NULL, 'INFO',
    COALESCE(c.name, '(unknown)') || ': ' || s.cnt::text || ' subcontractor row(s)'
  FROM subs_by_co s
  LEFT JOIN companies c ON c.id::text = s.co_id

  UNION ALL

  -- ── 1f. Entity notes — rows per company ───────────────────────────────────
  SELECT '1_row_counts', 'entity_notes', 'rows_by_company',
    n.co_id, n.cnt, NULL, 'INFO',
    COALESCE(c.name, '(unknown)') || ': ' || n.cnt::text || ' entity note row(s)'
  FROM notes_by_co n
  LEFT JOIN companies c ON c.id::text = n.co_id

  UNION ALL

  -- ── 2. NULL company_id counts ─────────────────────────────────────────────
  SELECT
    '2_null_company_id',
    nc.tbl,
    'null_company_id_count',
    'N/A',
    nc.cnt,
    0::bigint,
    CASE WHEN nc.cnt > 0 THEN 'FAIL' ELSE 'PASS' END,
    CASE
      WHEN nc.cnt > 0
        THEN nc.cnt::text || ' row(s) in ' || nc.tbl || ' have NULL company_id — isolation BROKEN'
      ELSE nc.tbl || ': no NULL company_id rows ✓'
    END
  FROM null_chk nc

  UNION ALL

  -- ── 3. Cross-tenant FK violations ─────────────────────────────────────────
  SELECT
    '3_fk_violations',
    'cross_tenant_check',
    fk.rel,
    'N/A',
    fk.cnt,
    0::bigint,
    CASE WHEN fk.cnt > 0 THEN 'FAIL' ELSE 'PASS' END,
    CASE
      WHEN fk.cnt > 0
        THEN fk.cnt::text || ' cross-tenant FK violation(s) on ' || fk.rel
      ELSE 'No cross-tenant violations in ' || fk.rel || ' ✓'
    END
  FROM fk_chk fk

  UNION ALL

  -- ── 4. Company membership summary ─────────────────────────────────────────
  SELECT
    '4_memberships',
    'companies',
    'active_members_per_company',
    ms.co_id,
    ms.member_cnt,
    NULL,
    'INFO',
    ms.co_name
      || ' | is_active=' || ms.is_active::text
      || ' | active_members=' || ms.member_cnt::text
  FROM membership ms

  UNION ALL

  -- ── 5. Multi-tenant users (one aggregate row; status INFO/REVIEW) ──────────
  SELECT
    '5_multi_tenant_users',
    'profiles',
    'users_with_multiple_memberships',
    'N/A',
    COUNT(*)::bigint,
    NULL,
    CASE
      WHEN COUNT(*) = 0    THEN 'PASS'
      WHEN COUNT(*) <= 5   THEN 'INFO'   -- small count — expected for platform admins
      ELSE                      'REVIEW' -- unexpectedly large — verify intent
    END,
    CASE
      WHEN COUNT(*) = 0
        THEN 'No users belong to multiple companies ✓'
      ELSE COUNT(*)::text || ' user(s) with 2+ memberships: '
             || STRING_AGG(
                  username || ' (platform_role=' || platform_role
                           || ', companies=' || co_count::text || ')',
                  '; '
                )
    END
  FROM multi_tenant

  UNION ALL

  -- ── 6a. Site feedback — total rows ────────────────────────────────────────
  SELECT
    '6_site_feedback',
    'site_feedback',
    'total_rows',
    'PLATFORM',
    f.total,
    NULL,
    'INFO',
    'Platform-wide table (no company_id by design). Total rows: ' || f.total::text
  FROM feedback f

  UNION ALL

  -- ── 6b. Site feedback — unhandled rows ────────────────────────────────────
  SELECT
    '6_site_feedback',
    'site_feedback',
    'unhandled_count',
    'PLATFORM',
    f.unhandled,
    NULL,
    'INFO',
    'Unhandled feedback (is_handled=false): ' || f.unhandled::text
      || ' of ' || f.total::text || ' total'
  FROM feedback f

),

-- ─────────────────────────────────────────────────────────────────────────────
-- summary — single row aggregating PASS / FAIL / REVIEW / INFO counts
-- ─────────────────────────────────────────────────────────────────────────────

summary AS (
  SELECT
    '9_SUMMARY'::text      AS section,
    'ALL'::text            AS table_name,
    'overall_result'::text AS check_name,
    'N/A'::text            AS company_id,
    COUNT(*)::bigint       AS row_count,       -- total individual checks
    NULL::bigint           AS expected_value,
    CASE
      WHEN COUNT(*) FILTER (WHERE status = 'FAIL')   > 0 THEN 'ISSUES FOUND'
      WHEN COUNT(*) FILTER (WHERE status = 'REVIEW') > 0 THEN 'REVIEW REQUIRED'
      ELSE                                                     'CLEAN'
    END::text              AS status,
    'total_checks='  || COUNT(*)::text
    || ' | PASS='    || (COUNT(*) FILTER (WHERE status = 'PASS'))::text
    || ' | FAIL='    || (COUNT(*) FILTER (WHERE status = 'FAIL'))::text
    || ' | REVIEW='  || (COUNT(*) FILTER (WHERE status = 'REVIEW'))::text
    || ' | INFO='    || (COUNT(*) FILTER (WHERE status = 'INFO'))::text
                         AS details
  FROM all_checks
)

-- ─────────────────────────────────────────────────────────────────────────────
-- Final output: all_checks rows + summary row, ordered by section
-- ─────────────────────────────────────────────────────────────────────────────

SELECT section, table_name, check_name, company_id,
       row_count, expected_value, status, details
FROM   all_checks

UNION ALL

SELECT section, table_name, check_name, company_id,
       row_count, expected_value, status, details
FROM   summary

ORDER BY section, table_name, check_name, company_id NULLS LAST;
