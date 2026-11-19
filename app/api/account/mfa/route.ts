/**
 * Two-factor enrolment for the signed-in user.
 *   GET  /api/account/mfa          → status { enabled, pending, required, enforced, daysLeft }
 *   POST /api/account/mfa          → start enrolment: { otpauthUri, qrSvg, secret }
 *   PUT  /api/account/mfa { code } → confirm enrolment with the first code from the app
 * Removing a factor is done by another platform admin (DELETE /api/admin/users/[id]/mfa).
 */
import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getSession, signSession } from '@/lib/auth/session';
import { setSessionCookie } from '@/lib/auth/login-response';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimitDb } from '@/lib/rate-limit/db';
import { auditLog } from '@/lib/audit/log';
import { clientIpOrNull } from '@/lib/rate-limit';
import { generateTotpSecret, otpauthUri } from '@/lib/auth/totp';
import { checkAndConsumeCode, getFactor, startEnrolment } from '@/lib/auth/mfa-store';
import { isMfaCryptoConfigured } from '@/lib/auth/mfa-crypto';
import { daysUntilEnforcement, isMfaEnforced, isMfaRequiredForRole, isRecentLogin } from '@/lib/auth/mfa-policy';

export const runtime = 'nodejs';

async function activeProfile(db: ReturnType<typeof createServiceClient>, userId: string) {
  const { data } = await db
    .from('profiles').select('id, email, username, role, is_active').eq('id', userId).single();
  return data && data.is_active ? data : null;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });
  const db = createServiceClient();
  const [profile, factor] = await Promise.all([activeProfile(db, session.userId), getFactor(db, session.userId)]);
  if (!profile) return NextResponse.json({ error: 'המשתמש הושבת' }, { status: 403 });
  return NextResponse.json({
    enabled: !!factor?.verified_at,
    pending: !!factor && !factor.verified_at,
    required: isMfaRequiredForRole(profile.role),
    enforced: isMfaEnforced(),
    daysLeft: daysUntilEnforcement(),
  });
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });
  const db = createServiceClient();
  const profile = await activeProfile(db, session.userId);
  if (!profile) return NextResponse.json({ error: 'המשתמש הושבת' }, { status: 403 });
  // Only right after a sign-in: a stolen or forgotten-open session must not be able to enable
  // two-factor and lock the real owner out (code review 2026-11-19).
  if (!isRecentLogin(session.loginAt)) {
    return NextResponse.json({ error: 'להפעלת אימות דו-שלבי יש להתנתק ולהתחבר מחדש (אבטחה).', code: 'REAUTH_REQUIRED' }, { status: 403 });
  }
  if (!isMfaCryptoConfigured()) {
    console.error('[mfa] MFA_ENCRYPTION_KEY missing — enrolment refused');
    return NextResponse.json({ error: 'אימות דו-שלבי אינו זמין כרגע. פנה למנהל המערכת.' }, { status: 503 });
  }

  const secret = generateTotpSecret();
  const result = await startEnrolment(db, profile.id, secret);
  if (result === 'already_verified') {
    return NextResponse.json({ error: 'אימות דו-שלבי כבר פעיל בחשבון. לאיפוס פנה למנהל מערכת אחר.' }, { status: 409 });
  }

  const uri = otpauthUri(secret, profile.username || profile.email);
  const qrSvg = await QRCode.toString(uri, { type: 'svg', margin: 1, width: 220 });
  return NextResponse.json({ otpauthUri: uri, qrSvg, secret }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });
  const db = createServiceClient();
  const profile = await activeProfile(db, session.userId);
  if (!profile) return NextResponse.json({ error: 'המשתמש הושבת' }, { status: 403 });

  const rl = await checkRateLimitDb(profile.id, 'mfa-enrol', 10, 10 * 60, undefined, profile.id);
  if (!rl.allowed) return NextResponse.json({ error: 'יותר מדי ניסיונות. נסה שנית בעוד מספר דקות.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const code = String((body as { code?: unknown }).code ?? '');
  if (!(await checkAndConsumeCode(db, profile.id, code, false))) {
    return NextResponse.json({ error: 'קוד שגוי. ודא שהשעה בטלפון נכונה ונסה שוב.' }, { status: 400 });
  }

  void auditLog({ user_id: profile.id, user_email: profile.email, action: 'mfa_enrolled', ip_address: clientIpOrNull(request) });

  const response = NextResponse.json({ enabled: true });
  // An admin who was limited to this page gets a full session now
  if (session.mfaSetupRequired) {
    const { mfaSetupRequired: _drop, ...rest } = session;
    void _drop;
    setSessionCookie(response, await signSession({ ...rest, loginAt: Date.now() }));
  }
  return response;
}
