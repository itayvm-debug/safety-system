-- CHANGE. Restores the exact state recorded by 01 on 2026-11-18 (including the exposure).
-- Use only on an explicit decision. Ends in ROLLBACK; replace with COMMIT to apply.
BEGIN;

CREATE POLICY authorized_phones_select ON public.authorized_phones
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.authorized_phones TO anon, authenticated;

UPDATE auth.users SET banned_until = NULL, updated_at = now()
WHERE id = '9eb38eab-24da-4dba-b277-0929ffb4ab58';
UPDATE auth.refresh_tokens SET revoked = false, updated_at = now()
WHERE user_id = '9eb38eab-24da-4dba-b277-0929ffb4ab58' AND id = 17;

ROLLBACK;
-- COMMIT;
