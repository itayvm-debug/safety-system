import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME, ROLE_COOKIE_NAME } from '@/lib/auth/session';

/** paths שלא דורשים authentication */
const PUBLIC = ['/login', '/api/auth/login', '/api/auth/logout'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // public paths — עובר ישירות
  if (PUBLIC.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const session = await verifySession(token);

  if (!session) {
    // token פג תוקף / פסול — מחק cookies ושלח ל-login
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.set({ name: SESSION_COOKIE_NAME, value: '', maxAge: 0, path: '/', httpOnly: true, sameSite: 'lax' });
    response.cookies.set({ name: ROLE_COOKIE_NAME, value: '', maxAge: 0, path: '/', httpOnly: false, sameSite: 'lax' });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // כל הנתיבים חוץ מ-static assets ו-PDFs
    '/((?!_next/static|_next/image|favicon\\.ico|logo\\.png|.*\\.pdf|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.ico).*)',
  ],
};
