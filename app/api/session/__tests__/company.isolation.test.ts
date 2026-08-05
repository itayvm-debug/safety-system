/**
 * Phase 3 Batch 2 — POST /api/session/company + DELETE /api/session/company isolation tests
 *
 * SX1:  POST no session → 401
 * SX2:  POST missing company_id → 400
 * SX3:  POST company_id user is not a member of → 403
 * SX4:  POST valid membership → 200 + sets httpOnly cookie
 * SX5:  DELETE no session → 401
 * SX6:  DELETE → 200 + clears cookie
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const sessionMock = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getSession: sessionMock.getSession }));

const dbQueue = vi.hoisted(() => ({
  queue: [] as Array<{ data: unknown; error: unknown }>,
  reset(q: Array<{ data: unknown; error: unknown }> = []) { this.queue = [...q]; },
  next() { return this.queue.shift() ?? { data: null, error: null }; },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select     = vi.fn(() => chain);
      chain.eq         = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(() => Promise.resolve(dbQueue.next()));
      return chain;
    },
  }),
}));

import { POST, DELETE } from '../company/route';

const USER_SESSION = { userId: 'u1', email: 'a@test.com', username: 'user1', role: 'user' as const, loginAt: 0 };

function postReq(body?: unknown) {
  return new NextRequest('http://localhost/api/session/company', {
    method: 'POST',
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
}


beforeEach(() => {
  vi.clearAllMocks();
  dbQueue.reset();
});

// ─── SX1 ──────────────────────────────────────────────────────────────────────
describe('SX1: POST no session → 401', () => {
  it('returns 401 when no session', async () => {
    sessionMock.getSession.mockResolvedValueOnce(null);
    const res = await POST(postReq({ company_id: 'co-a' }));
    expect(res.status).toBe(401);
  });
});

// ─── SX2 ──────────────────────────────────────────────────────────────────────
describe('SX2: POST missing company_id → 400', () => {
  it('returns 400 when company_id is absent', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is not JSON', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    const res = await POST(new NextRequest('http://localhost/api/session/company', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'text/plain' },
    }));
    expect(res.status).toBe(400);
  });
});

// ─── SX3 ──────────────────────────────────────────────────────────────────────
describe('SX3: POST company user is not a member of → 403', () => {
  it('returns 403 when membership not found', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    dbQueue.reset([{ data: null, error: null }]); // maybeSingle → no membership
    const res = await POST(postReq({ company_id: 'co-unauthorized' }));
    expect(res.status).toBe(403);
  });
});

// ─── SX4 ──────────────────────────────────────────────────────────────────────
describe('SX4: POST valid membership → 200 + sets httpOnly cookie', () => {
  it('returns 200 and sets safedoc_active_company cookie', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    dbQueue.reset([{ data: { company_id: 'co-a' }, error: null }]); // membership found
    const res = await POST(postReq({ company_id: 'co-a' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // Cookie must be set in response
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('safedoc_active_company=co-a');
    expect(setCookie).toContain('HttpOnly');
  });
});

// ─── SX5 ──────────────────────────────────────────────────────────────────────
describe('SX5: DELETE no session → 401', () => {
  it('returns 401 when no session', async () => {
    sessionMock.getSession.mockResolvedValueOnce(null);
    const res = await DELETE();
    expect(res.status).toBe(401);
  });
});

// ─── SX6 ──────────────────────────────────────────────────────────────────────
describe('SX6: DELETE → 200 + clears cookie', () => {
  it('returns 200 and expires safedoc_active_company cookie', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    const res = await DELETE();
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('safedoc_active_company=');
    expect(setCookie).toMatch(/max-age=0/i);
  });
});
