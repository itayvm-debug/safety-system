import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, ROLE_COOKIE_NAME } from '@/lib/auth/session';

const EXPIRED_COOKIE = { maxAge: 0, path: '/', httpOnly: false, sameSite: 'lax' as const };

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({ name: SESSION_COOKIE_NAME, value: '', ...EXPIRED_COOKIE, httpOnly: true });
  response.cookies.set({ name: ROLE_COOKIE_NAME, value: '', ...EXPIRED_COOKIE });
  return response;
}
