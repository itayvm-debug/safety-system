import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, ROLE_COOKIE_NAME } from '@/lib/auth/session';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete(ROLE_COOKIE_NAME);
  return response;
}
