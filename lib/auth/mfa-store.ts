/**
 * Storage of TOTP factors (table public.user_mfa_factors, service_role only).
 * One row per user: verified_at NULL = enrolment started but not confirmed.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret, encryptSecret } from '@/lib/auth/mfa-crypto';
import { verifyTotp } from '@/lib/auth/totp';

export interface MfaFactorRow {
  user_id: string;
  secret_enc: string;
  verified_at: string | null;
  last_used_step: number | null;
}

export async function getFactor(db: SupabaseClient, userId: string): Promise<MfaFactorRow | null> {
  const { data, error } = await db
    .from('user_mfa_factors')
    .select('user_id, secret_enc, verified_at, last_used_step')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`mfa factor lookup failed: ${error.message}`);
  return (data as MfaFactorRow | null) ?? null;
}

export async function hasVerifiedFactor(db: SupabaseClient, userId: string): Promise<boolean> {
  return !!(await getFactor(db, userId))?.verified_at;
}

/** Starts (or restarts) enrolment. Refuses to overwrite a verified factor. */
export async function startEnrolment(db: SupabaseClient, userId: string, secretBase32: string): Promise<'ok' | 'already_verified'> {
  const existing = await getFactor(db, userId);
  if (existing?.verified_at) return 'already_verified';
  const row = { user_id: userId, secret_enc: encryptSecret(secretBase32, userId), verified_at: null, last_used_step: null };
  const { error } = await db.from('user_mfa_factors').upsert(row, { onConflict: 'user_id' });
  if (error) throw new Error(`mfa enrolment failed: ${error.message}`);
  return 'ok';
}

/**
 * Checks a code against the user's factor and consumes its time step (one use per code).
 * `requireVerified`: true for sign-in, false for confirming a new enrolment.
 */
export async function checkAndConsumeCode(
  db: SupabaseClient, userId: string, code: string, requireVerified: boolean, nowMs = Date.now(),
): Promise<boolean> {
  const factor = await getFactor(db, userId);
  if (!factor) return false;
  if (requireVerified !== !!factor.verified_at) return false;
  const step = verifyTotp(decryptSecret(factor.secret_enc, userId), code, { nowMs, lastUsedStep: factor.last_used_step });
  if (step === null) return false;

  // Consume the step atomically: a parallel request with the same code loses the race.
  let q = db.from('user_mfa_factors')
    .update({ last_used_step: step, ...(requireVerified ? {} : { verified_at: new Date(nowMs).toISOString() }) })
    .eq('user_id', userId);
  q = factor.last_used_step === null ? q.is('last_used_step', null) : q.eq('last_used_step', factor.last_used_step);
  const { data, error } = await q.select('user_id');
  if (error) throw new Error(`mfa step update failed: ${error.message}`);
  return Array.isArray(data) && data.length === 1;
}

export async function deleteFactor(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db.from('user_mfa_factors').delete().eq('user_id', userId).select('user_id');
  if (error) throw new Error(`mfa reset failed: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}
