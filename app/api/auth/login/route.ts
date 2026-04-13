import { NextRequest, NextResponse } from 'next/server';
import {
  signSession,
  SESSION_COOKIE_NAME,
  ROLE_COOKIE_NAME,
  COOKIE_MAX_AGE,
} from '@/lib/auth/session';

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)\.]/g, '');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const phone = String(body.phone ?? '').trim();
    const password = String(body.password ?? '');

    if (!phone || !password) {
      return NextResponse.json({ error: 'מספר טלפון וסיסמה נדרשים' }, { status: 400 });
    }

    const normalized = normalizePhone(phone);
    const adminPhone = normalizePhone(process.env.ADMIN_PHONE ?? '');
    const viewerPhone = normalizePhone(process.env.VIEWER_PHONE ?? '');

    let role: 'admin' | 'viewer' | null = null;

    if (normalized === adminPhone && password === process.env.ADMIN_PASSWORD) {
      role = 'admin';
    } else if (normalized === viewerPhone && password === process.env.VIEWER_PASSWORD) {
      role = 'viewer';
    }

    if (!role) {
      // עיכוב קצר — מניעת timing attacks
      await new Promise(r => setTimeout(r, 500));
      return NextResponse.json({ error: 'מספר טלפון או סיסמה שגויים' }, { status: 401 });
    }

    const token = await signSession({ role, phone: normalized, loginAt: Date.now() });
    const isProd = process.env.NODE_ENV === 'production';

    const response = NextResponse.json({ role });

    // session cookie — HttpOnly (server-side validation)
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });

    // role cookie — לא HttpOnly (client-side UI decisions)
    response.cookies.set({
      name: ROLE_COOKIE_NAME,
      value: role,
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
