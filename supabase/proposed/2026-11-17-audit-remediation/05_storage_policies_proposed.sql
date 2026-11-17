-- ================================================================
-- PROPOSED, NOT RUN. Storage hardening for P0-1.
-- Apply ONLY if queries 1-2 of 01_verify_live_state.sql show the bucket is public
-- or that anon/authenticated policies exist on worker-files, and after confirming
-- no client uses Supabase Storage directly. In the repository all Storage access
-- is server-side with the service role (/api/upload, /api/signed-url,
-- generate-pdf, entity routes). The path layout is unchanged; nothing is moved.
-- ================================================================
BEGIN;

-- 1. Keep the bucket private.
UPDATE storage.buckets SET public = false WHERE id = 'worker-files';

-- 2. Drop each policy on storage.objects that gives a role other than
--    service_role access to worker-files. Copy the exact names printed by
--    query 2; do not guess them.
-- DROP POLICY IF EXISTS "<policy name from query 2>" ON storage.objects;

-- 3. Re-run query 2: no anon/authenticated policy may remain for worker-files.
-- COMMIT;   -- or ROLLBACK;
