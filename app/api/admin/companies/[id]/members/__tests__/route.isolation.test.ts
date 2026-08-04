/**
 * Phase 3 Batch 1 — /api/admin/companies/[id]/members route isolation tests
 * Verifies: auth boundary, member listing, member add, last-member guard, non-admin blocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const COMPANY_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B    = 'bbbbbbbb-0000-0000-0000-000000000001';
const MEMBER_1  = 'mmmmmmmm-0000-0000-0000-000000000001';

const authMock = vi.hoisted(() => ({ requireAdmin: vi.fn() }));

vi.mock('@/lib/auth/api', () => ({
  requireAdmin: authMock.requireAdmin,
}));

const dbState = vi.hoisted(() => ({
  queue: [] as Array<{ data: unknown; error: null | { message: string; code?: string } }>,
  countResult: 2,
  reset(q: typeof dbState.queue = []) { this.queue = q; this.countResult = 2; },
  next() { return this.queue.shift() ?? { data: null, error: null }; },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = chain;
      chain.select = vi.fn((_cols: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) {
          return {
            eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ count: dbState.countResult, error: null })) })),
          };
        }
        return self;
      });
      chain.insert = vi.fn(() => self);
      chain.update = vi.fn(() => self);
      chain.delete = vi.fn(() => self);
      chain.eq = vi.fn(() => self);
      chain.order = vi.fn(() => self);
      chain.maybeSingle = vi.fn(() => Promise.resolve(dbState.next()));
      chain.single = vi.fn(() => Promise.resolve(dbState.next()));
      chain.then = (
        onfulfilled: ((v: unknown) => unknown) | null | undefined,
      ) => Promise.resolve(dbState.next()).then(onfulfilled ?? undefined);
      return chain;
    },
  }),
}));

import { GET, POST } from '../route';
import { DELETE } from '../[memberId]/route';

function req(method: string, body?: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/admin/companies/${COMPANY_A}/members`, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
}

function memberReq(method: string) {
  return new NextRequest(`http://localhost/api/admin/companies/${COMPANY_A}/members/${MEMBER_1}`, { method });
}

const paramsA = { params: Promise.resolve({ id: COMPANY_A }) };
const memberParams = { params: Promise.resolve({ id: COMPANY_A, memberId: MEMBER_1 }) };

beforeEach(() => {
  vi.clearAllMocks();
  dbState.reset();
  authMock.requireAdmin.mockResolvedValue({ session: { role: 'admin' }, error: null });
});

describe('GET /api/admin/companies/[id]/members', () => {
  it('returns 401 for non-admin', async () => {
    authMock.requireAdmin.mockResolvedValueOnce({
      session: null,
      error: new Response(JSON.stringify({ error: 'אין הרשאה' }), { status: 401 }),
    });
    const res = await GET(req('GET'), paramsA);
    expect(res.status).toBe(401);
  });

  it('returns members list', async () => {
    dbState.reset([{ data: [{ id: MEMBER_1, user_id: USER_B, role: 'member' }], error: null }]);
    const res = await GET(req('GET'), paramsA);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/admin/companies/[id]/members', () => {
  it('returns 400 when user_id missing', async () => {
    const res = await POST(req('POST', { role: 'member' }), paramsA);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid role', async () => {
    const res = await POST(req('POST', { user_id: USER_B, role: 'superadmin' }), paramsA);
    expect(res.status).toBe(400);
  });

  it('returns 404 when company not found', async () => {
    dbState.reset([
      { data: null, error: null }, // company lookup
    ]);
    const res = await POST(req('POST', { user_id: USER_B, role: 'member' }), paramsA);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/חברה/);
  });

  it('returns 201 on successful member add', async () => {
    dbState.reset([
      { data: { id: COMPANY_A }, error: null },   // company lookup
      { data: { id: USER_B }, error: null },       // profile lookup
      { data: null, error: null },                 // existing membership check (not found)
      { data: { id: MEMBER_1, company_id: COMPANY_A, user_id: USER_B, role: 'member' }, error: null }, // insert
    ]);
    const res = await POST(req('POST', { user_id: USER_B, role: 'member' }), paramsA);
    expect(res.status).toBe(201);
  });
});

describe('DELETE /api/admin/companies/[id]/members/[memberId]', () => {
  it('returns 409 when removing last active member', async () => {
    dbState.reset([{ data: { id: MEMBER_1 }, error: null }]);
    dbState.countResult = 1;
    const res = await DELETE(memberReq('DELETE'), memberParams);
    expect(res.status).toBe(409);
  });

  it('returns 404 when membership not found in company', async () => {
    dbState.reset([{ data: null, error: null }]);
    const res = await DELETE(memberReq('DELETE'), memberParams);
    expect(res.status).toBe(404);
  });
});
