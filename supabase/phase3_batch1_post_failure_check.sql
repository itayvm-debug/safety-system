-- Phase 3 Batch 1 — Post-Deployment Health Check
-- Run on Supabase SQL Editor AFTER deploying Phase 3 Batch 1 to verify state.
-- All queries are READ-ONLY.

-- 1. Verify companies table is accessible and slug uniqueness index exists
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'companies'
  AND indexdef ILIKE '%slug%';

-- 2. Verify company_members unique constraint exists
SELECT
  conname AS constraint_name,
  contype AS constraint_type
FROM pg_constraint
WHERE conrelid = 'company_members'::regclass
  AND contype = 'u';

-- 3. Count companies with no active members (orphaned companies — should be 0 after onboarding)
SELECT
  c.id,
  c.name,
  c.slug,
  c.is_active,
  COALESCE(active_count.cnt, 0) AS active_member_count
FROM companies c
LEFT JOIN (
  SELECT company_id, COUNT(*) AS cnt
  FROM company_members
  WHERE is_active = TRUE
  GROUP BY company_id
) active_count ON active_count.company_id = c.id
ORDER BY c.created_at;

-- 4. Verify no users exist without any company_members row
SELECT
  p.id,
  p.email,
  p.is_active
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM company_members cm WHERE cm.user_id = p.id
);
