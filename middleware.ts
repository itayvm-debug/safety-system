import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME, ROLE_COOKIE_NAME } from '@/lib/auth/session';
import { CONSENT_COOKIE_NAME, CURRENT_CONSENT_VERSION } from '@/lib/auth/consent';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Origins allowed for cross-site mutations (never allow unknown origins)
function isAllowedOrigin(origin: string | null, host: string | null, appUrl: string): boolean {
  if (!origin) return true; // same-site — no Origin header is normal for same-site requests
  if (appUrl && origin === appUrl) return true;
  if (host) {
    if (origin === `https://${host}`) return true;
    if (origin === `http://${host}`) return true;
  }
  return false;
}

const PUBLIC = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/reports/weekly-status',
  '/api/health',
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
  const reqMethod = request.method;

  // ── CSRF / Origin check for all API mutations ────────────────────
  if (pathname.startsWith('/api/') && MUTATION_METHODS.has(reqMethod)) {
    const authHeader = request.headers.get('authorization') ?? '';
    // Allow Vercel Cron and signed workflows that carry Bearer token
    if (!authHeader.startsWith('Bearer ')) {
      const origin = request.headers.get('origin');
      const host   = request.headers.get('host');
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
      if (!isAllowedOrigin(origin, host, appUrl)) {
        return NextResponse.json(
          { error: 'Cross-site request rejected' },
          { status: 403 }
        );
      }
    }
  }

  if (PUBLIC.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'לא מורשה — יש להתחבר תחילה' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const session = await verifySession(token);

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'לא מורשה — סשן לא תקף' }, { status: 401 });
    }
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.set({ name: SESSION_COOKIE_NAME, value: '', maxAge: 0, path: '/', httpOnly: true, sameSite: 'lax' });
    response.cookies.set({ name: ROLE_COOKIE_NAME, value: '', maxAge: 0, path: '/', httpOnly: false, sameSite: 'lax' });
    return response;
  }

  // בדיקת הסכמה לתנאים — רק לדפים (לא API) ולא לנתיבי admin שכבר בודקים
  if (!pathname.startsWith('/api/')) {
    const consentVersion = request.cookies.get(CONSENT_COOKIE_NAME)?.value;
    if (consentVersion !== CURRENT_CONSENT_VERSION) {
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
