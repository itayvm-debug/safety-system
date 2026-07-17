import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME, ROLE_COOKIE_NAME } from '@/lib/auth/session';
import { CONSENT_COOKIE_NAME } from '@/lib/auth/consent';
import { LEGAL } from '@/lib/legal/config';

const PUBLIC = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/reports/weekly-status',
  // דפים ציבוריים
  '/terms',
  '/privacy',
  '/accessibility',
  '/about',
  '/subprocessors',
  '/data-retention',
  '/legal-consent',
];
const ADMIN_PATHS = ['/admin', '/api/admin'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const session = await verifySession(token);

  if (!session) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.set({ name: SESSION_COOKIE_NAME, value: '', maxAge: 0, path: '/', httpOnly: true, sameSite: 'lax' });
    response.cookies.set({ name: ROLE_COOKIE_NAME, value: '', maxAge: 0, path: '/', httpOnly: false, sameSite: 'lax' });
    return response;
  }

  // בדיקת הסכמה לתנאים — רק לדפים (לא API) ולא לנתיבי admin שכבר בודקים
  if (!pathname.startsWith('/api/')) {
    const consentVersion = request.cookies.get(CONSENT_COOKIE_NAME)?.value;
    if (consentVersion !== LEGAL.termsVersion) {
      return NextResponse.redirect(new URL('/legal-consent', request.url));
    }
  }

  // נתיבי admin — בדיקת role ברמת middleware לפני שמגיעים לקוד
  const isAdminPath = ADMIN_PATHS.some(p => pathname.startsWith(p));
  if (isAdminPath && session.role !== 'admin') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|logo\\.png|.*\\.pdf|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.ico).*)',
  ],
};
