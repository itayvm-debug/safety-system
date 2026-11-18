/**
 * Durable rate limiting (2026-11-18): the migration was never applied in production,
 * so rate_limit_check() returned 404 and every limit failed open. When it was applied,
 * two gaps had to be closed as well:
 *   1. Supabase grants EXECUTE on new functions to anon/authenticated by name, so
 *      `REVOKE ... FROM PUBLIC` alone left both functions callable from the browser.
 *   2. rate_limit_cleanup() was never scheduled, so raw IPs would be kept forever.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

const rpcSpy = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ rpc: rpcSpy }) }));

import { GET } from '@/app/api/maintenance/rate-limit-cleanup/route';
import { middleware } from '@/middleware';

const ROOT = join(__dirname, '..', '..', '..', '..', '..');
const PATH = '/api/maintenance/rate-limit-cleanup';

function req(auth?: string) {
  return new NextRequest(`https://app.example.test${PATH}`, auth ? { headers: { authorization: auth } } : undefined);
}

beforeEach(() => {
  rpcSpy.mockReset();
  process.env.CRON_SECRET = 'cron-test-secret';
});

describe('GET /api/maintenance/rate-limit-cleanup', () => {
  it('refuses requests without the cron secret and touches no data', async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req('Bearer wrong'))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req('Bearer undefined'))).status).toBe(401);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('deletes events older than 24 hours and reports the count', async () => {
    rpcSpy.mockResolvedValue({ data: 7, error: null });
    const res = await GET(req('Bearer cron-test-secret'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: 7 });
    expect(rpcSpy).toHaveBeenCalledWith('rate_limit_cleanup', { p_max_age_hours: 24 });
  });

  it('returns 500 without leaking the database error', async () => {
    rpcSpy.mockResolvedValue({ data: null, error: { message: 'relation "x" does not exist' } });
    const res = await GET(req('Bearer cron-test-secret'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('relation');
  });

  it('is reachable through the middleware without a session (it has its own secret)', async () => {
    const res = await middleware(req('Bearer x'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('is scheduled daily in vercel.json', () => {
    const crons = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')).crons as { path: string; schedule: string }[];
    const entry = crons.find((c) => c.path === PATH);
    expect(entry?.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
  });
});

describe('durable-rate-limiting.sql grants', () => {
  const sql = readFileSync(join(ROOT, 'supabase', 'migrations', 'durable-rate-limiting.sql'), 'utf8');

  it.each([
    'rate_limit_check(text, text, integer, integer, inet, uuid)',
    'rate_limit_cleanup(integer)',
  ])('revokes EXECUTE on %s from anon and authenticated by name', (signature) => {
    const escaped = signature.replace(/[()]/g, '\\$&');
    expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${escaped}\\s+FROM PUBLIC, anon, authenticated;`));
  });

  it('revokes all table privileges from anon and authenticated', () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE rate_limit_events FROM anon;/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE rate_limit_events FROM authenticated;/);
  });
});
