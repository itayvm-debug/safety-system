-- phase3_verify_cross_tenant_data.sql
-- Phase 3 Batch 3 — Read-only cross-tenant data isolation diagnostic
--
-- PURPOSE: Verify that each tenant-scoped table is correctly filtered
--          and identify any records that might cross company boundaries.
--
-- SAFETY: All statements are SELECT only. No mutations.
-- RUN AS: Supabase service role or postgres superuser (read-only diagnostic).

-- ─── 1. Record counts per company ──────────────────────────────────────────────

SELECT 'workers'::text AS table_name, company_id, COUNT(*) AS row_count
FROM workers
GROUP BY company_id
ORDER BY table_name, company_id;

SELECT 'vehicles'::text AS table_name, company_id, COUNT(*) AS row_count
FROM vehicles
GROUP BY company_id
ORDER BY table_name, company_id;

SELECT 'heavy_equipment'::text AS table_name, company_id, COUNT(*) AS row_count
FROM heavy_equipment
GROUP BY company_id
ORDER BY table_name, company_id;

SELECT 'lifting_equipment'::text AS table_name, company_id, COUNT(*) AS row_count
FROM lifting_equipment
GROUP BY company_id
ORDER BY table_name, company_id;

SELECT 'subcontractors'::text AS table_name, company_id, COUNT(*) AS row_count
FROM subcontractors
GROUP BY company_id
ORDER BY table_name, company_id;

SELECT 'entity_notes'::text AS table_name, company_id, COUNT(*) AS row_count
FROM entity_notes
GROUP BY company_id
ORDER BY table_name, company_id;

-- ─── 2. Check for orphaned records (missing company_id) ────────────────────────

SELECT 'vehicles_orphaned' AS check_name, COUNT(*) AS orphan_count
FROM vehicles WHERE company_id IS NULL;

SELECT 'subcontractors_orphaned' AS check_name, COUNT(*) AS orphan_count
FROM subcontractors WHERE company_id IS NULL;

SELECT 'entity_notes_orphaned' AS check_name, COUNT(*) AS orphan_count
FROM entity_notes WHERE company_id IS NULL;

SELECT 'workers_orphaned' AS check_name, COUNT(*) AS orphan_count
FROM workers WHERE company_id IS NULL;

-- ─── 3. Cross-tenant FK violation check ────────────────────────────────────────
-- workers.subcontractor_id must reference a subcontractor in the same company

SELECT
  'workers.subcontractor_id_cross_tenant' AS check_name,
  COUNT(*) AS violation_count
FROM workers w
JOIN subcontractors s ON s.id = w.subcontractor_id
WHERE w.company_id <> s.company_id;

-- vehicle.assigned_manager_id must reference a worker in the same company

SELECT
  'vehicles.assigned_manager_id_cross_tenant' AS check_name,
  COUNT(*) AS violation_count
FROM vehicles v
JOIN workers wk ON wk.id = v.assigned_manager_id
WHERE v.company_id <> wk.company_id;

-- heavy_equipment.subcontractor_id must reference subcontractor in same company

SELECT
  'heavy_equipment.subcontractor_id_cross_tenant' AS check_name,
  COUNT(*) AS violation_count
FROM heavy_equipment he
JOIN subcontractors s ON s.id = he.subcontractor_id
WHERE he.company_id <> s.company_id;

-- ─── 4. Company membership summary ─────────────────────────────────────────────

SELECT
  c.id AS company_id,
  c.name AS company_name,
  c.is_active,
  COUNT(cm.user_id) AS active_member_count
FROM companies c
LEFT JOIN company_members cm ON cm.company_id = c.id AND cm.is_active = true
GROUP BY c.id, c.name, c.is_active
ORDER BY c.name;

-- ─── 5. Multi-tenant users (platform admin candidates) ─────────────────────────

SELECT
  p.id AS user_id,
  p.username,
  p.role AS platform_role,
  COUNT(cm.company_id) AS company_count,
  ARRAY_AGG(c.name ORDER BY c.name) AS companies
FROM profiles p
JOIN company_members cm ON cm.user_id = p.id AND cm.is_active = true
JOIN companies c ON c.id = cm.company_id
GROUP BY p.id, p.username, p.role
HAVING COUNT(cm.company_id) > 1
ORDER BY company_count DESC;

-- ─── 6. Site feedback (platform-level, no company_id) ──────────────────────────
-- site_feedback is intentionally platform-wide.
-- Verify it has no company_id column leaking tenant data.

SELECT 'site_feedback_total' AS check_name, COUNT(*) AS row_count FROM site_feedback;
SELECT 'site_feedback_unhandled' AS check_name, COUNT(*) AS row_count FROM site_feedback WHERE is_handled = false;

-- ─── SUMMARY ───────────────────────────────────────────────────────────────────
-- All violation_count fields above must be 0 for the system to be in a
-- clean cross-tenant isolation state. Orphan counts must also be 0.
