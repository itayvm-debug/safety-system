-- ================================================================
-- PROPOSED, NOT RUN. Legacy phone accounts (P0-2).
-- The routes that created these accounts and returned their credentials are
-- removed in code. Accounts that already exist stay in Supabase Auth, and their
-- passwords can be derived from a phone number. Plan:
--   1. Count them (query 7 of 01_verify_live_state.sql). If 0, nothing to do.
--   2. Confirm none has a profile or company membership (query below).
--   3. After a backup and the owner's approval, delete them from Supabase Auth
--      (Dashboard > Authentication, or the Admin API auth.admin.deleteUser).
--   4. Re-run query 7: expect 0.
--   5. Decide whether authorized_phones is still needed. If not, drop its
--      authenticated SELECT policy and archive the table.
-- ================================================================

-- Step 2 (read only)
SELECT count(*) FILTER (WHERE p.id IS NOT NULL)       AS with_profile,
       count(*) FILTER (WHERE m.user_id IS NOT NULL)  AS with_membership
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
LEFT JOIN company_members m ON m.user_id = u.id
WHERE u.email LIKE '%@safedoc.internal';
