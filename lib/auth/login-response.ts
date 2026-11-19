/**
 * Issues the SafeDoc session after every sign-in factor has passed.
 * Shared by POST /api/auth/login (no second factor) and POST /api/auth/mfa/verify.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signSession, SESSION_COOKIE_NAME, ROLE_COOKIE_NAME, COOKIE_MAX_AGE } from '@/lib/auth/session';
import { ACTIVE_COMPANY_COOKIE_NAME, ACTIVE_COMPANY_MAX_AGE } from '@/lib/auth/active-company';
import { CONSENT_COOKIE_NAME, CONSENT_COOKIE_MAX_AGE, CURRENT_CONSENT_VERSION } from '@/lib/auth/consent';
import { LEGAL } from '@/lib/legal/config';
import { auditLog } from '@/lib/audit/log';
import { clientIpOrNull } from '@/lib/rate-limit';
import { MFA_PENDING_COOKIE_NAME, isMfaEnforced, isMfaRequiredForRole } from '@/lib/auth/mfa-policy';
import { hasVerifiedFactor } from '@/lib/auth/mfa-store';

export interface LoginProfile {
  id: string;
  email: string;
  username: string | null;
  role: string;
}

/** The one place that sets the session cookie's options (also used after enrolling two-factor). */
export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME, value: token, httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', maxAge: COOKIE_MAX_AGE, path: '/',
  });
}

export async function buildLoginResponse(
  service: SupabaseClient,
  profile: LoginProfile,
  request: NextRequest,
  opts: { mfaVerified: boolean },
): Promise<NextResponse> {
  // A platform admin past the deadline without a factor may sign in only to enrol one.
  const mfaSetupRequired =
    !opts.mfaVerified && isMfaRequiredForRole(profile.role) && isMfaEnforced() && !(await hasVerifiedFactor(service, profile.id));

  const token = await signSession({
    userId: profile.id,
    email: profile.email,
    username: profile.username ?? '',
    role: profile.role as 'admin' | 'user',
    loginAt: Date.now(),
    ...(mfaSetupRequired ? { mfaSetupRequired: true } : {}),
  });

  const [{ data: memberships }, { data: existingConsent }] = await Promise.all([
    // Auto-select the active company for single-membership users
    service
      .from('company_members')
      .select('company_id')
      .eq('user_id', profile.id)
      .eq('is_active', true),
    // The DB is the source of truth — restore the consent cookie only for the current terms version
    service
    .from('legal_acceptances')
    .select('id')
    .eq('user_id', profile.id)
    .eq('terms_version', LEGAL.termsVersion)
    .eq('privacy_version', LEGAL.privacyVersion)
    .eq('accepted_terms', true)
    .eq('accepted_privacy', true)
    .limit(1)
    .maybeSingle(),
  ]);

  const isProd = process.env.NODE_ENV === 'production';
  const response = NextResponse.json({ role: profile.role, ...(mfaSetupRequired ? { mfaSetupRequired: true } : {}) });

  setSessionCookie(response, token);
  response.cookies.set({ name: ROLE_COOKIE_NAME, value: profile.role, httpOnly: false, secure: isProd, sameSite: 'lax', maxAge: COOKIE_MAX_AGE, path: '/' });
  response.cookies.set({ name: MFA_PENDING_COOKIE_NAME, value: '', maxAge: 0, path: '/', httpOnly: true, sameSite: 'strict' });

  if (existingConsent) {
    response.cookies.set({ name: CONSENT_COOKIE_NAME, value: CURRENT_CONSENT_VERSION, httpOnly: true, secure: isProd, sameSite: 'lax', maxAge: CONSENT_COOKIE_MAX_AGE, path: '/' });
  }

  if (memberships && memberships.length === 1) {
    response.cookies.set({ name: ACTIVE_COMPANY_COOKIE_NAME, value: memberships[0].company_id, httpOnly: true, secure: isProd, sameSite: 'lax', maxAge: ACTIVE_COMPANY_MAX_AGE, path: '/' });
  } else {
    response.cookies.set({ name: ACTIVE_COMPANY_COOKIE_NAME, value: '', maxAge: 0, path: '/', httpOnly: true, sameSite: 'lax' });
  }

  void auditLog({
    user_id: profile.id,
    user_email: profile.email,
    action: 'login',
    ip_address: clientIpOrNull(request),
  });

  return response;
}
