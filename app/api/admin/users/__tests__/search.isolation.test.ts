/**
 * Phase 3 Batch 1 — User Search API
 *
 * S1: Platform admin can search → 200 with results
 * S2: Non-admin gets 403
 * S3: Short query (< 2 chars) → 400
 * S4: Sensitive fields (role, report_email, job_title) never in response
 * S5: active_membership_count correctly attached
 * S6: Rate limiting → 429
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Auth mock ───────────────────────────────────────────────────────────────

const requireAdminMock = vi.hoisted(() => ({ requireAdmin: vi.fn() }));

vi.mock('@/lib/auth/api', () => ({
  requireAdmin: requireAdminMock.requireAdmin,
}));

// ─── Rate limit mock ──────────────────────────────────────────────────────────

const rateLimitMock = vi.hoisted(() => ({ checkRateLimitDb: vi.fn() }));

vi.mock('@/lib/rate-limit/db', () => ({
  checkRateLimitDb: rateLimitMock.checkRateLimitDb,
}));

// ─── DB queue mock ────────────────────────────────────────────────────────────

const dbQueue = vi.hoisted(() => ({
  queue: [] as Array<{ data: unknown; error: unknown }>,
  reset(q: Array<{ data: unknown; error: unknown }> = []) { this.queue = [...q]; },
  next() { return this.queue.shift() ?? { data: null, error: null }; },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = chain;
      chain.select = vi.fn(() => self);
      chain.or     = vi.fn(() => self);
      chain.eq     = vi.fn(() => self);
      chain.in     = vi.fn(() => self);
      chain.limit  = vi.fn(() => self);
      chain.order  = vi.fn(() => self);
      chain.then = (onfulfilled: ((v: unknown) => unknown) | null | undefined) =>
        Promise.resolve(dbQueue.next()).then(onfulfilled ?? undefined);
      return chain;
    },
  }),
}));

// ─── Route import ─────────────────────────────────────────────────────────────

import { GET as searchGet } from '../search/route';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const platformAdminOk = {
  session: { userId: 'platform-admin', role: 'admin' as const, email: 'admin@test.com', username: 'admin' },
  error: null,
};
const rateLimitAllowed = { allowed: true, resetAt: Date.now() + 60_000 };
const rateLimitBlocked = { allowed: false, resetAt: Date.now() + 30_000 };

function searchReq(q: string) {
  return new NextRequest(`http://localhost/api/admin/users/search?q=${encodeURIComponent(q)}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  dbQueue.reset();
  requireAdminMock.requireAdmin.mockResolvedValue(platformAdminOk);
  rateLimitMock.checkRateLimitDb.mockResolvedValue(rateLimitAllowed);
});

// ─── S1: Platform admin search returns results ────────────────────────────────

describe('S1: Platform admin can search users', () => {
  it('GET ?q=ada → 200 with user list', async () => {
    dbQueue.reset([
      { data: [{ id: USER_ID_A, full_name: 'Ada Lovelace', email: 'ada@test.com', username: 'ada', is_active: true }], error: null },
      { data: [], error: null }, // membership query
    ]);

    const res = await searchGet(searchReq('ada'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].email).toBe('ada@test.com');
  });

  it('returns empty array when no match', async () => {
    dbQueue.reset([
      { data: [], error: null }, // profiles (no match)
      // membership query skipped when no profiles found
    ]);

    const res = await searchGet(searchReq('zzznomatch'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});

// ─── S2: Non-admin gets 403 ───────────────────────────────────────────────────

describe('S2: Non-admin gets 403', () => {
  it('returns 403 when requireAdmin denies access', async () => {
    requireAdminMock.requireAdmin.mockResolvedValueOnce({
      session: null,
      error: new Response(JSON.stringify({ error: 'פעולה זו מחייבת הרשאת מנהל' }), { status: 403 }),
    });

    const res = await searchGet(searchReq('ada'));
    expect(res.status).toBe(403);
  });
});

// ─── S3: Short query → 400 ───────────────────────────────────────────────────

describe('S3: Query shorter than 2 chars → 400', () => {
  it('q="" → 400', async () => {
    const res = await searchGet(searchReq(''));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/2/);
  });

  it('q="a" (1 char) → 400', async () => {
    const res = await searchGet(searchReq('a'));
    expect(res.status).toBe(400);
  });

  it('q="ab" (2 chars) → proceeds past validation', async () => {
    dbQueue.reset([
      { data: [], error: null },
    ]);
    const res = await searchGet(searchReq('ab'));
    // 200 (with empty results) means validation passed
    expect(res.status).toBe(200);
  });
});

// ─── S4: Sensitive fields never exposed ──────────────────────────────────────

describe('S4: Sensitive fields never in response', () => {
  it('role, report_email, job_title, created_at absent from result objects', async () => {
    dbQueue.reset([
      {
        data: [{
          id: USER_ID_A, full_name: 'Ada', email: 'ada@test.com',
          username: 'ada', is_active: true,
          // These fields exist in DB but should never be selected:
          // role, report_email, job_title — omitted from SELECT in route
        }],
        error: null,
      },
      { data: [], error: null },
    ]);

    const res = await searchGet(searchReq('ada'));
    expect(res.status).toBe(200);
    const [user] = await res.json();

    // Safe fields present
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('full_name');
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('username');
    expect(user).toHaveProperty('is_active');
    expect(user).toHaveProperty('active_membership_count');

    // Sensitive fields must be absent
    expect(user).not.toHaveProperty('role');
    expect(user).not.toHaveProperty('report_email');
    expect(user).not.toHaveProperty('job_title');
    expect(user).not.toHaveProperty('created_at');
  });
});

// ─── S5: active_membership_count correctly attached ──────────────────────────

describe('S5: active_membership_count is correctly counted per user', () => {
  it('zero membership for user with no company', async () => {
    dbQueue.reset([
      { data: [{ id: USER_ID_A, full_name: 'Solo', email: 'solo@test.com', username: 'solo', is_active: true }], error: null },
      { data: [], error: null }, // no memberships
    ]);

    const res = await searchGet(searchReq('sol'));
    const [user] = await res.json();
    expect(user.active_membership_count).toBe(0);
  });

  it('count=1 for user with one active membership', async () => {
    dbQueue.reset([
      { data: [{ id: USER_ID_A, full_name: 'Member', email: 'm@test.com', username: 'member', is_active: true }], error: null },
      { data: [{ user_id: USER_ID_A }], error: null }, // 1 membership row
    ]);

    const res = await searchGet(searchReq('mem'));
    const [user] = await res.json();
    expect(user.active_membership_count).toBe(1);
  });

  it('count reflects each user independently when multiple users returned', async () => {
    dbQueue.reset([
      {
        data: [
          { id: USER_ID_A, full_name: 'A', email: 'a@test.com', username: 'user-a', is_active: true },
          { id: USER_ID_B, full_name: 'B', email: 'b@test.com', username: 'user-b', is_active: true },
        ],
        error: null,
      },
      // User A has 1 membership, User B has 0
      { data: [{ user_id: USER_ID_A }], error: null },
    ]);

    const res = await searchGet(searchReq('us'));
    const users = await res.json();
    const userA = users.find((u: { id: string }) => u.id === USER_ID_A);
    const userB = users.find((u: { id: string }) => u.id === USER_ID_B);
    expect(userA.active_membership_count).toBe(1);
    expect(userB.active_membership_count).toBe(0);
  });
});

// ─── S6: Rate limit → 429 ────────────────────────────────────────────────────

describe('S6: Rate limiting returns 429 when limit exceeded', () => {
  it('GET returns 429 when checkRateLimitDb denies', async () => {
    rateLimitMock.checkRateLimitDb.mockResolvedValueOnce(rateLimitBlocked);

    const res = await searchGet(searchReq('ada'));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBeDefined();
    // Retry-After header should be set
    expect(res.headers.get('Retry-After')).not.toBeNull();
  });
});
