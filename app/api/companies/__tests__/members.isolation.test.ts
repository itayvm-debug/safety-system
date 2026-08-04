/**
 * Phase 3 Batch 1 — /api/companies/members isolation tests
 * Verifies: company-admin-role boundary, member list, add by email,
 *           self-add prevention, last-member guard, self-remove prevention.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const COMPANY_A  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ADMIN = 'admin000-0000-0000-0000-000000000001';
const USER_B     = 'bbbbbbbb-0000-0000-0000-000000000001';
const MEMBER_1   = 'mmmmmmmm-0000-0000-0000-000000000001';

const authMock = vi.hoisted(() => ({ requireCompanyAdminRole: vi.fn() }));

vi.mock('@/lib/auth/company-context', () => ({
  requireCompanyAdminRole: authMock.requireCompanyAdminRole,
}));

const dbState = vi.hoisted(() => ({
  queue: [] as Array<{ data: unknown; error: null | { message: string } }>,
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

import { GET, POST } from '../members/route';
import { PATCH, DELETE } from '../members/[memberId]/route';

function postReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/companies/members', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function memberReq(method: string, body?: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/companies/members/${MEMBER_1}`, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
}

const memberParams = { params: Promise.resolve({ memberId: MEMBER_1 }) };

beforeEach(() => {
  vi.clearAllMocks();
  dbState.reset();
  authMock.requireCompanyAdminRole.mockResolvedValue({
    context: { companyId: COMPANY_A, userId: USER_ADMIN, companyRole: 'admin' },
    error: null,
  });
});

describe('GET /api/companies/members', () => {
  it('returns 403 for non-company-admin (member role)', async () => {
    authMock.requireCompanyAdminRole.mockResolvedValueOnce({
      context: null,
      error: new Response(JSON.stringify({ error: 'אין הרשאת מנהל חברה' }), { status: 403 }),
    });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns members of own company', async () => {
    dbState.reset([{ data: [{ id: MEMBER_1 }], error: null }]);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe('POST /api/companies/members', () => {
  it('returns 400 when email is missing', async () => {
    const res = await POST(postReq({ role: 'member' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid role', async () => {
    const res = await POST(postReq({ email: 'test@example.com', role: 'owner' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when user email not found', async () => {
    dbState.reset([{ data: null, error: null }]); // profile lookup
    const res = await POST(postReq({ email: 'notfound@example.com', role: 'member' }));
    expect(res.status).toBe(404);
  });

  it('returns 409 when trying to add self', async () => {
    dbState.reset([{ data: { id: USER_ADMIN }, error: null }]); // profile lookup returns self
    const res = await POST(postReq({ email: 'self@example.com', role: 'member' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/עצמ/);
  });

  it('returns 201 on successful member add', async () => {
    dbState.reset([
      { data: { id: USER_B }, error: null },     // profile lookup
      { data: null, error: null },               // existing membership check
      { data: { id: MEMBER_1, company_id: COMPANY_A, user_id: USER_B, role: 'member' }, error: null },
    ]);
    const res = await POST(postReq({ email: 'newuser@example.com', role: 'member' }));
    expect(res.status).toBe(201);
  });
});

describe('PATCH /api/companies/members/[memberId]', () => {
  it('returns 409 when trying to change own role', async () => {
    dbState.reset([{ data: { id: MEMBER_1, user_id: USER_ADMIN }, error: null }]);
    const res = await PATCH(memberReq('PATCH', { role: 'member' }), memberParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/עצמ/);
  });

  it('returns 200 on successful role update for other member', async () => {
    dbState.reset([
      { data: { id: MEMBER_1, user_id: USER_B }, error: null }, // membership lookup
      { data: { id: MEMBER_1, role: 'admin' }, error: null },   // update result
    ]);
    const res = await PATCH(memberReq('PATCH', { role: 'admin' }), memberParams);
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/companies/members/[memberId]', () => {
  it('returns 404 when membership not found in own company', async () => {
    dbState.reset([{ data: null, error: null }]);
    const res = await DELETE(memberReq('DELETE'), memberParams);
    expect(res.status).toBe(404);
  });

  it('returns 409 when trying to remove self', async () => {
    dbState.reset([{ data: { id: MEMBER_1, user_id: USER_ADMIN }, error: null }]);
    const res = await DELETE(memberReq('DELETE'), memberParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/עצמ/);
  });

  it('returns 409 when removing last active member', async () => {
    dbState.reset([{ data: { id: MEMBER_1, user_id: USER_B }, error: null }]);
    dbState.countResult = 1;
    const res = await DELETE(memberReq('DELETE'), memberParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/אחרון/);
  });
});
