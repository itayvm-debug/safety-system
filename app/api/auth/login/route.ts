import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { signMfaPending } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { rateLimitLoginDb, rateLimitLoginAccountDb } from '@/lib/rate-limit/db';
import { getClientIp } from '@/lib/rate-limit';
import { buildLoginResponse } from '@/lib/auth/login-response';
import { hasVerifiedFactor } from '@/lib/auth/mfa-store';
import { MFA_PENDING_COOKIE_NAME, MFA_PENDING_MAX_AGE_SECONDS } from '@/lib/auth/mfa-policy';
import { readJsonObject } from '@/lib/http/json-body';

const GENERIC_ERROR = 'שם משתמש או סיסמה שגויים';
const INACTIVE_ERROR = 'המשתמש הושבת. פנה למנהל המערכת.';

function tooManyAttempts(resetAt: number): NextResponse {
  return NextResponse.json(
    { error: 'יותר מדי ניסיונות כניסה. נסה שנית בעוד מספר דקות.' },
    { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)), 'X-RateLimit-Remaining': '0' } },
  );
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await rateLimitLoginDb(ip);
    if (!rl.allowed) return tooManyAttempts(rl.resetAt);

    const jsonIn = await readJsonObject(request);
    if (!jsonIn.ok) return jsonIn.error;
    const body = jsonIn.body;
    const identifier = String(body.identifier ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');

    if (!identifier || !password) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    // Per-account limit, independent of IP (checked for unknown identifiers too, so the
    // response does not reveal which accounts exist).
    const accountRl = await rateLimitLoginAccountDb(identifier);
    if (!accountRl.allowed) return tooManyAttempts(accountRl.resetAt);

    const service = createServiceClient();

    // username → email: אם אין @ בקלט, חפש לפי username בטבלת profiles
    let email = identifier;
    if (!identifier.includes('@')) {
      const { data: profileByUsername } = await service
        .from('profiles')
        .select('email')
        .eq('username', identifier) // username מאוחסן lowercase
        .single();

      if (!profileByUsername?.email) {
        await new Promise(r => setTimeout(r, 500));
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
      }
      email = profileByUsername.email;
    }

    // אימות credentials מול Supabase Auth (anon key — לא service role)
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      await new Promise(r => setTimeout(r, 500));
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    // קריאת profile מהטבלה — role + is_active
    const { data: profile } = await service
      .from('profiles')
      .select('id, full_name, username, email, role, is_active')
      .eq('id', authData.user.id)
      .single();

    if (!profile) {
      await new Promise(r => setTimeout(r, 500));
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    if (!profile.is_active) {
      return NextResponse.json({ error: INACTIVE_ERROR }, { status: 403 });
    }

    // Second factor: with a verified TOTP factor the password alone does not sign in.
    // A short-lived signed cookie carries the user to POST /api/auth/mfa/verify.
    if (await hasVerifiedFactor(service, profile.id)) {
      const pending = await signMfaPending(profile.id, MFA_PENDING_MAX_AGE_SECONDS);
      const response = NextResponse.json({ mfaRequired: true });
      response.cookies.set({
        name: MFA_PENDING_COOKIE_NAME,
        value: pending,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: MFA_PENDING_MAX_AGE_SECONDS,
        path: '/',
      });
      return response;
    }

    return buildLoginResponse(service, profile, request, { mfaVerified: false });
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
