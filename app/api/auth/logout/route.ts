import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, ROLE_COOKIE_NAME, getSession } from '@/lib/auth/session';
import { CONSENT_COOKIE_NAME } from '@/lib/auth/consent';
import { auditLog } from '@/lib/audit/log';

const EXPIRED_COOKIE = { maxAge: 0, path: '/', httpOnly: false, sameSite: 'lax' as const };

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (session) {
    void auditLog({
      user_id: session.userId,
      user_email: session.email,
      action: 'logout',
      ip_address: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
    });
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set({ name: SESSION_COOKIE_NAME,  value: '', ...EXPIRED_COOKIE, httpOnly: true });
  response.cookies.set({ name: ROLE_COOKIE_NAME,     value: '', ...EXPIRED_COOKIE });
  response.cookies.set({ name: CONSENT_COOKIE_NAME,  value: '', ...EXPIRED_COOKIE, httpOnly: true });
  return response;
}
