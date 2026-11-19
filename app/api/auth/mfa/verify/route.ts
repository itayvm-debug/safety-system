/**
 * POST /api/auth/mfa/verify  { code }
 * Second sign-in step. Requires the short-lived safedoc_mfa_pending cookie set by
 * /api/auth/login after a correct password; issues the session only for a valid, unused code.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyMfaPending } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimitDb } from '@/lib/rate-limit/db';
import { buildLoginResponse } from '@/lib/auth/login-response';
import { checkAndConsumeCode } from '@/lib/auth/mfa-store';
import { MFA_PENDING_COOKIE_NAME } from '@/lib/auth/mfa-policy';

export const runtime = 'nodejs';

const EXPIRED = 'פג תוקף שלב ההתחברות. היכנס שוב עם שם משתמש וסיסמה.';
const WRONG = 'קוד שגוי. נסה שוב.';

export async function POST(request: NextRequest) {
  try {
    const userId = await verifyMfaPending(request.cookies.get(MFA_PENDING_COOKIE_NAME)?.value);
    if (!userId) return NextResponse.json({ error: EXPIRED }, { status: 401 });

    // 5 code attempts per 5 minutes per user (a 6-digit code must not be guessable).
    // Fail-closed: if the limiter is down, guessing would be unlimited (code review 2026-11-19).
    const rl = await checkRateLimitDb(userId, 'mfa-verify', 5, 5 * 60, undefined, userId, { failClosed: true });
    if (!rl.allowed) {
      return NextResponse.json({ error: 'יותר מדי ניסיונות. נסה שנית בעוד מספר דקות.' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const code = String((body as { code?: unknown }).code ?? '');
    const service = createServiceClient();

    if (!(await checkAndConsumeCode(service, userId, code, true))) {
      return NextResponse.json({ error: WRONG }, { status: 401 });
    }

    // Re-check the account: it may have been disabled between the two steps
    const { data: profile } = await service
      .from('profiles')
      .select('id, email, username, role, is_active')
      .eq('id', userId)
      .single();
    if (!profile || !profile.is_active) {
      return NextResponse.json({ error: 'המשתמש הושבת. פנה למנהל המערכת.' }, { status: 403 });
    }

    return buildLoginResponse(service, profile, request, { mfaVerified: true });
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
