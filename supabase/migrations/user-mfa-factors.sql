-- ================================================================
-- SafeDoc — two-factor sign-in (TOTP) factors. One row per user.
--   secret_enc      AES-256-GCM ciphertext of the base32 secret (key MFA_ENCRYPTION_KEY, bound to user_id)
--   verified_at     NULL = enrolment started, not confirmed with a first code
--   last_used_step  last accepted 30-second step (each code is accepted once)
-- Server only: RLS on, no policy, no client privileges. Idempotent.
-- Rollback: DROP TABLE IF EXISTS public.user_mfa_factors;  (removes every user's second factor)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.user_mfa_factors (
  user_id        uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  secret_enc     text        NOT NULL,
  verified_at    timestamptz NULL,
  last_used_step bigint      NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_mfa_factors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_mfa_factors FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_mfa_factors TO service_role;

DROP TRIGGER IF EXISTS user_mfa_factors_updated_at ON public.user_mfa_factors;
CREATE TRIGGER user_mfa_factors_updated_at
  BEFORE UPDATE ON public.user_mfa_factors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
