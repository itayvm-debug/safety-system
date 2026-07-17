import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  signSession,
  SESSION_COOKIE_NAME,
  ROLE_COOKIE_NAME,
  COOKIE_MAX_AGE,
} from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { rateLimitLogin, getClientIp } from '@/lib/rate-limit';
import { auditLog } from '@/lib/audit/log';

const GENERIC_ERROR = 'שם משתמש או סיסמה שגויים';
const INACTIVE_ERROR = 'המשתמש הושבת. פנה למנהל המערכת.';

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = rateLimitLogin(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'יותר מדי ניסיונות כניסה. נסה שנית בעוד מספר דקות.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    const body = await request.json();
    const identifier = String(body.identifier ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');

    if (!identifier || !password) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

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

    const token = await signSession({
      userId: profile.id,
      email: profile.email,
      username: profile.username ?? '',
      role: profile.role as 'admin' | 'user',
      loginAt: Date.now(),
    });

    const isProd = process.env.NODE_ENV === 'production';
    const response = NextResponse.json({ role: profile.role });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });

    response.cookies.set({
      name: ROLE_COOKIE_NAME,
      value: profile.role,
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });

    void auditLog({
      user_id: profile.id,
      user_email: profile.email,
      action: 'login',
      ip_address: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
