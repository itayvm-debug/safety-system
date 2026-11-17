-- ================================================================
-- SafeDoc: live state verification (READ ONLY)
-- Run in the Supabase SQL Editor of each environment. Nothing here writes.
-- Findings: P0-1 (Storage/RLS), P0-2 (legacy accounts), P0-4 (visa rows), B-06/B-07.
-- ================================================================

-- 1. Bucket must exist and be private.  Expected: worker-files | public = false
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY id;

-- 2. Policies on storage.objects.  Expected: no policy for anon/authenticated on worker-files
--    (in the repository, the application reads and writes Storage only with the service role).
SELECT policyname, cmd, roles, permissive, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

-- 3. Policies in public/storage that give a non-service role broad or write access.
--    Expected: only SELECT policies scoped by company membership in the public schema.
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
  AND NOT (roles = ARRAY['service_role']::name[])
  AND (qual = 'true' OR with_check = 'true' OR cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE'))
ORDER BY schemaname, tablename, policyname;

-- 4. Public tables without RLS.  Expected: no rows
SELECT c.relname AS table_name
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
ORDER BY 1;

-- 5. Grants to anon/authenticated on tables WITHOUT RLS (direct exposure).  Expected: no rows
SELECT g.table_name, g.grantee, string_agg(g.privilege_type, ', ' ORDER BY g.privilege_type) AS privileges
FROM information_schema.role_table_grants g
JOIN pg_class c ON c.relname = g.table_name AND c.relnamespace = 'public'::regnamespace
WHERE g.table_schema = 'public'
  AND g.grantee IN ('anon', 'authenticated')
  AND NOT c.relrowsecurity
GROUP BY g.table_name, g.grantee
ORDER BY 1, 2;

-- 6. RLS state of tables the repository does not fully declare.
SELECT c.relname, c.relrowsecurity,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname IN ('site_feedback', 'manager_insurances', 'legal_acceptances_dedup_backup',
                    'authorized_phones', 'professional_licenses', 'manager_licenses');

-- 7. Accounts created by the removed phone-login route (P0-2). Counts only, no addresses.
SELECT count(*) AS legacy_phone_accounts,
       count(*) FILTER (WHERE last_sign_in_at > now() - interval '90 days') AS signed_in_last_90_days
FROM auth.users
WHERE email LIKE '%@safedoc.internal';

-- 8. Foreign workers whose work visa row is stored as "not required" (P0-4). Count per company.
SELECT w.company_id, count(*) AS visa_rows_marked_not_required
FROM documents d
JOIN workers w ON w.id = d.worker_id
WHERE d.doc_type = 'work_visa'
  AND d.is_required = false
  AND w.is_foreign_worker
GROUP BY w.company_id;

-- 9. Deactivated profiles that still hold active memberships (B-07).
SELECT count(*) AS inactive_profiles_with_active_membership
FROM profiles p
JOIN company_members m ON m.user_id = p.id AND m.is_active
WHERE NOT p.is_active;

-- 10. Active companies (affects the legacy storage compatibility mode).
SELECT count(*) AS active_companies FROM companies WHERE is_active;

-- 11. SECURITY DEFINER functions in public (review any result).
SELECT p.proname, pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef;
