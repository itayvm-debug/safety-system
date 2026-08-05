/**
 * Phase 3 Batch 2 — GET /api/session/companies isolation tests
 *
 * SC1: Returns 401 when no session
 * SC2: Returns companies list for authenticated user
 * SC3: activeCompanyId is null when no cookie set
 * SC4: activeCompanyId reflects cookie value when it matches a membership
 * SC5: activeCompanyId is null when cookie does not match any membership
 * SC6: Single membership → activeCompanyId auto-filled without cookie
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessionMock = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getSession: sessionMock.getSession }));

const activeCompanyMock = vi.hoisted(() => ({ getActiveCompanyId: vi.fn<() => Promise<string | null>>() }));
vi.mock('@/lib/auth/active-company', () => ({ getActiveCompanyId: activeCompanyMock.getActiveCompanyId }));

const dbQueue = vi.hoisted(() => ({
  queue: [] as Array<{ data: unknown; error: unknown }>,
  reset(q: Array<{ data: unknown; error: unknown }> = []) { this.queue = [...q]; },
  next() { return this.queue.shift() ?? { data: null, error: null }; },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq     = vi.fn(() => chain);
      chain.then = (onfulfilled: ((v: unknown) => unknown) | null | undefined) =>
        Promise.resolve(dbQueue.next()).then(onfulfilled ?? undefined);
      return chain;
    },
  }),
}));

import { GET } from '../companies/route';

const USER_SESSION = { userId: 'u1', email: 'a@test.com', username: 'user1', role: 'user' as const, loginAt: 0 };

const MEMBER_ROWS = [
  { company_id: 'co-a', role: 'admin',  companies: { id: 'co-a', name: 'חברה א', logo_url: null, is_active: true } },
  { company_id: 'co-b', role: 'member', companies: { id: 'co-b', name: 'חברה ב', logo_url: null, is_active: true } },
];

beforeEach(() => {
  vi.clearAllMocks();
  dbQueue.reset();
  activeCompanyMock.getActiveCompanyId.mockResolvedValue(null);
});

// ─── SC1 ──────────────────────────────────────────────────────────────────────
describe('SC1: No session → 401', () => {
  it('returns 401 when no session', async () => {
    sessionMock.getSession.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

// ─── SC2 ──────────────────────────────────────────────────────────────────────
describe('SC2: Returns companies list for authenticated user', () => {
  it('returns active companies with role', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    dbQueue.reset([{ data: MEMBER_ROWS, error: null }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.companies)).toBe(true);
    expect(body.companies).toHaveLength(2);
    expect(body.companies[0]).toMatchObject({ id: 'co-a', name: 'חברה א', role: 'admin' });
  });
});

// ─── SC3 ──────────────────────────────────────────────────────────────────────
describe('SC3: activeCompanyId is null when 2+ memberships + no cookie', () => {
  it('returns null activeCompanyId', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    dbQueue.reset([{ data: MEMBER_ROWS, error: null }]);
    activeCompanyMock.getActiveCompanyId.mockResolvedValue(null);
    const res = await GET();
    const body = await res.json();
    expect(body.activeCompanyId).toBeNull();
  });
});

// ─── SC4 ──────────────────────────────────────────────────────────────────────
describe('SC4: activeCompanyId reflects valid cookie', () => {
  it('returns cookie company ID when it matches a membership', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    dbQueue.reset([{ data: MEMBER_ROWS, error: null }]);
    activeCompanyMock.getActiveCompanyId.mockResolvedValue('co-b');
    const res = await GET();
    const body = await res.json();
    expect(body.activeCompanyId).toBe('co-b');
  });
});

// ─── SC5 ──────────────────────────────────────────────────────────────────────
describe('SC5: activeCompanyId is null when cookie does not match memberships', () => {
  it('returns null when cookie is stale', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    dbQueue.reset([{ data: MEMBER_ROWS, error: null }]);
    activeCompanyMock.getActiveCompanyId.mockResolvedValue('co-other');
    const res = await GET();
    const body = await res.json();
    expect(body.activeCompanyId).toBeNull();
  });
});

// ─── SC6 ──────────────────────────────────────────────────────────────────────
describe('SC6: Single membership → activeCompanyId auto-filled', () => {
  it('auto-fills activeCompanyId without cookie for single membership', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    dbQueue.reset([{ data: [MEMBER_ROWS[0]], error: null }]); // only co-a
    activeCompanyMock.getActiveCompanyId.mockResolvedValue(null); // no cookie
    const res = await GET();
    const body = await res.json();
    expect(body.companies).toHaveLength(1);
    expect(body.activeCompanyId).toBe('co-a'); // auto-filled
    // getActiveCompanyId should NOT be called for single membership
    expect(activeCompanyMock.getActiveCompanyId).not.toHaveBeenCalled();
  });
});
