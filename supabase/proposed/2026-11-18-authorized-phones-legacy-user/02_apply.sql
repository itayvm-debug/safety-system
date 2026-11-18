-- CHANGE. Lock public.authorized_phones to the server and ban the legacy phone account.
-- Ends in ROLLBACK (dry run). Replace with COMMIT to apply. Run as postgres.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- 0. Preconditions: the state seen in 01 still holds
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND rolbypassrls) THEN
    RAISE EXCEPTION 'ABORT: service_role does not bypass RLS';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.authorized_phones'::regclass) THEN
    RAISE EXCEPTION 'ABORT: RLS is off on authorized_phones (expected on)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace NOT IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
             AND p.prosrc ~* 'authorized_phones') THEN
    RAISE EXCEPTION 'ABORT: a function references authorized_phones';
  END IF;
  IF (SELECT count(*) FROM auth.users WHERE email LIKE '%@safedoc.internal') <> 1
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '9eb38eab-24da-4dba-b277-0929ffb4ab58'
                    AND email LIKE '%@safedoc.internal' AND banned_until IS NULL) THEN
    RAISE EXCEPTION 'ABORT: legacy account is not in the expected state';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = '9eb38eab-24da-4dba-b277-0929ffb4ab58')
     OR EXISTS (SELECT 1 FROM public.company_members WHERE user_id = '9eb38eab-24da-4dba-b277-0929ffb4ab58') THEN
    RAISE EXCEPTION 'ABORT: legacy account now has a profile or membership';
  END IF;
END $$;

-- 1. authorized_phones: server only
DROP POLICY authorized_phones_select ON public.authorized_phones;
REVOKE ALL ON TABLE public.authorized_phones FROM PUBLIC, anon, authenticated;

-- 2. Legacy account: ban and revoke its active refresh token (nothing deleted)
UPDATE auth.users SET banned_until = '2999-12-31 00:00:00+00', updated_at = now()
WHERE id = '9eb38eab-24da-4dba-b277-0929ffb4ab58' AND banned_until IS NULL;
UPDATE auth.refresh_tokens SET revoked = true, updated_at = now()
WHERE user_id = '9eb38eab-24da-4dba-b277-0929ffb4ab58' AND id = 17 AND NOT revoked;

-- 3. Checks
DO $$
DECLARE bad text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'authorized_phones') THEN
    RAISE EXCEPTION 'CHECK FAILED: a policy remains on authorized_phones';
  END IF;
  SELECT string_agg(r || ' ' || p, ', ') INTO bad
  FROM unnest(ARRAY['anon', 'authenticated']) r,
       unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
  WHERE has_table_privilege(r::name, 'public.authorized_phones'::regclass, p);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'CHECK FAILED: clients keep %', bad; END IF;
  IF NOT has_table_privilege('service_role', 'public.authorized_phones'::regclass, 'SELECT') THEN
    RAISE EXCEPTION 'CHECK FAILED: service_role lost SELECT';
  END IF;
  IF (SELECT count(*) FROM public.authorized_phones) <> 1 THEN
    RAISE EXCEPTION 'CHECK FAILED: row count changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '9eb38eab-24da-4dba-b277-0929ffb4ab58' AND banned_until > now()) THEN
    RAISE EXCEPTION 'CHECK FAILED: legacy account not banned';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.refresh_tokens WHERE user_id = '9eb38eab-24da-4dba-b277-0929ffb4ab58' AND NOT revoked) THEN
    RAISE EXCEPTION 'CHECK FAILED: legacy account keeps an active refresh token';
  END IF;
  IF (SELECT count(*) FROM auth.users WHERE banned_until IS NOT NULL) <> 1 THEN
    RAISE EXCEPTION 'CHECK FAILED: more than one user is banned';
  END IF;
END $$;

ROLLBACK;
-- COMMIT;
