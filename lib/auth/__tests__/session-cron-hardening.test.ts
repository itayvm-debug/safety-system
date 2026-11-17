/**
 * P1·2 (session lifetime), P1·3 / P1·4 (cron), A-08 (matcher).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { signSession, verifySession, isSessionFresh, SESSION_MAX_AGE_MS, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { isAuthorizedCronRequest } from '@/lib/auth/cron';
import { CONSENT_COOKIE_NAME, CURRENT_CONSENT_VERSION } from '@/lib/auth/consent';

const fromSpy = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ from: fromSpy }) }));

import { middleware, config as middlewareConfig } from '@/middleware';
import { GET as snapshotCron } from '@/app/api/reviews/weekly-snapshot-cron/route';
import { GET as reminderCron } from '@/app/api/reviews/reminder-cron/route';
import { GET as weeklyStatusCron } from '@/app/api/reports/weekly-status/route';

const DAY = 24 * 60 * 60 * 1000;
const base = { userId: 'u1', email: 'a@example.test', username: 'a', role: 'user' as const };

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret';
  delete process.env.CRON_SECRET;
  fromSpy.mockReset();
});

describe('session lifetime is enforced on the server (P1·2)', () => {
  it('accepts a fresh session', async () => {
    const token = await signSession({ ...base, loginAt: Date.now() - DAY });
    expect(await verifySession(token)).toMatchObject({ userId: 'u1' });
  });

  it('refuses a correctly signed token older than 7 days (a copied cookie)', async () => {
    const token = await signSession({ ...base, loginAt: Date.now() - 8 * DAY });
    expect(await verifySession(token)).toBeNull();
  });

  it('refuses a token without loginAt or with a loginAt in the future', async () => {
    const noLogin = await signSession({ ...base } as never);
    expect(await verifySession(noLogin)).toBeNull();
    const future = await signSession({ ...base, loginAt: Date.now() + DAY });
    expect(await verifySession(future)).toBeNull();
  });

  it('boundary: exactly 7 days is still valid, one minute later is not', () => {
    const now = 1_800_000_000_000;
    expect(isSessionFresh({ loginAt: now - SESSION_MAX_AGE_MS }, now)).toBe(true);
    expect(isSessionFresh({ loginAt: now - SESSION_MAX_AGE_MS - 60_000 }, now)).toBe(false);
  });

  it('middleware sends an expired session to /login', async () => {
    const token = await signSession({ ...base, loginAt: Date.now() - 8 * DAY });
    const req = new NextRequest('https://app.example.test/dashboard', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}; ${CONSENT_COOKIE_NAME}=${encodeURIComponent(CURRENT_CONSENT_VERSION)}` },
    });
    const res = await middleware(req);
    expect(res.headers.get('location')).toContain('/login');
  });
});

describe('cron authorization (P1·4)', () => {
  it('refuses "Bearer undefined" when CRON_SECRET is not configured', () => {
    expect(isAuthorizedCronRequest('Bearer undefined')).toBe(false);
    expect(isAuthorizedCronRequest(null)).toBe(false);
  });

  it('accepts only the exact secret', () => {
    expect(isAuthorizedCronRequest('Bearer s3cret', 's3cret')).toBe(true);
    expect(isAuthorizedCronRequest('Bearer s3cre', 's3cret')).toBe(false);
    expect(isAuthorizedCronRequest('bearer s3cret', 's3cret')).toBe(false);
  });

  it.each([
    ['weekly-snapshot-cron', snapshotCron],
    ['reminder-cron', reminderCron],
    ['weekly-status', weeklyStatusCron],
  ])('%s returns 401 and touches no data when CRON_SECRET is missing', async (_n, handler) => {
    const req = new NextRequest('https://app.example.test/x', { headers: { authorization: 'Bearer undefined' } });
    const res = await handler(req);
    expect(res.status).toBe(401);
    expect(fromSpy).not.toHaveBeenCalled();
  });
});

describe('middleware', () => {
  it('lets the weekly review cron reach its own CRON_SECRET check (P1·3)', async () => {
    const req = new NextRequest('https://app.example.test/api/reviews/weekly-snapshot-cron', {
      headers: { authorization: 'Bearer x' },
    });
    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('still requires a session for ordinary API routes', async () => {
    const res = await middleware(new NextRequest('https://app.example.test/api/workers'));
    expect(res.status).toBe(401);
  });

  it('matcher skips static files but not paths that only contain a static extension (A-08)', () => {
    const pattern = new RegExp(`^${middlewareConfig.matcher[0]}$`);
    expect(pattern.test('/briefing-templates/hebrew.pdf')).toBe(false);
    expect(pattern.test('/icons/icon-192.png')).toBe(false);
    expect(pattern.test('/api/signed-url/x.pdf/extra')).toBe(true);
    expect(pattern.test('/admin/companies/x.png/members')).toBe(true);
    expect(pattern.test('/dashboard')).toBe(true);
  });
});
