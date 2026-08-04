-- phase3_verify_platform_admins.sql
-- READ-ONLY verification query: Platform admin population audit
--
-- Purpose: inspect which users have profiles.role='admin', whether they have
--   company memberships (expected: none for pure platform admins), and flag any
--   unexpected states.
--
-- DO NOT run as a migration. Run in the Supabase SQL editor or psql
-- for read-only verification only. No INSERT / UPDATE / DELETE is issued.
--
-- Classification rules:
--   PLATFORM_ADMIN        profiles.role='admin', is_active=true, no company memberships
--   PLATFORM_ADMIN_W_CO   profiles.role='admin', is_active=true, has ≥1 active company membership
--                         (not an error, but warrants review — platform admin does not need a
--                          company membership to administer companies)
--   INACTIVE_ADMIN        profiles.role='admin', is_active=false
--   COMPANY_ONLY_USER     profiles.role='user', has ≥1 active company membership
--   ORDINARY_USER         profiles.role='user', no active company membership
--   UNEXPECTED_ROLE       profiles.role not in ('admin','user')
--
-- PostgreSQL aggregate FILTER syntax rule (applied throughout):
--   CORRECT:   AGGREGATE(expression [ORDER BY ...]) FILTER (WHERE condition)
--   INCORRECT: AGGREGATE(expression FILTER (WHERE condition) [ORDER BY ...])
--
-- All aggregates with FILTER have been verified to follow the correct form.

SELECT
  p.id                                                        AS profile_id,
  p.email,
  p.username,
  p.role                                                      AS profile_role,
  p.is_active                                                 AS profile_is_active,

  -- COUNT: FILTER after closing paren — correct PostgreSQL syntax
  COUNT(cm.company_id) FILTER (WHERE cm.is_active = true)     AS active_membership_count,

  -- ARRAY_AGG: FILTER after closing paren, ORDER BY inside the parens — correct syntax
  -- COALESCE converts NULL (no matching rows) to an empty array
  COALESCE(
    ARRAY_AGG(cm.role ORDER BY cm.role) FILTER (WHERE cm.is_active = true),
    ARRAY[]::text[]
  )                                                           AS active_company_roles,

  COALESCE(
    ARRAY_AGG(c.name ORDER BY c.name) FILTER (WHERE cm.is_active = true),
    ARRAY[]::text[]
  )                                                           AS active_company_names,

  CASE
    WHEN p.role = 'admin' AND p.is_active = true
         AND COUNT(cm.company_id) FILTER (WHERE cm.is_active = true) = 0
      THEN 'PLATFORM_ADMIN'

    WHEN p.role = 'admin' AND p.is_active = true
         AND COUNT(cm.company_id) FILTER (WHERE cm.is_active = true) > 0
      THEN 'PLATFORM_ADMIN_W_CO'

    WHEN p.role = 'admin' AND p.is_active = false
      THEN 'INACTIVE_ADMIN'

    WHEN p.role = 'user'
         AND COUNT(cm.company_id) FILTER (WHERE cm.is_active = true) > 0
      THEN 'COMPANY_ONLY_USER'

    WHEN p.role = 'user'
         AND COUNT(cm.company_id) FILTER (WHERE cm.is_active = true) = 0
      THEN 'ORDINARY_USER'

    ELSE 'UNEXPECTED_ROLE'
  END                                                         AS classification

FROM profiles p
-- LEFT JOIN preserves users with no company memberships (e.g. pure platform admins)
LEFT JOIN company_members cm ON cm.user_id = p.id
LEFT JOIN companies c        ON c.id = cm.company_id AND cm.is_active = true

GROUP BY p.id, p.email, p.username, p.role, p.is_active
ORDER BY
  -- Platform admins first, then users; active before inactive; alphabetical within group
  CASE p.role WHEN 'admin' THEN 0 ELSE 1 END,
  p.is_active DESC,
  p.email;

-- ─── Optional quick-check queries (copy out separately if needed) ─────────────

-- List platform admins who also have company memberships (advisory, not an error)
/*
SELECT p.id, p.email, p.role AS profile_role, cm.company_id, cm.role AS company_role
FROM profiles p
JOIN company_members cm ON cm.user_id = p.id AND cm.is_active = true
WHERE p.role = 'admin'
ORDER BY p.email;
*/

-- Count of platform admins with any active company membership
/*
SELECT COUNT(*) AS platform_admins_with_company_memberships
FROM profiles p
JOIN company_members cm ON cm.user_id = p.id AND cm.is_active = true
WHERE p.role = 'admin';
*/
