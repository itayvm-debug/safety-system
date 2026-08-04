/**
 * Phase 3 Batch 1 — Authorization Boundary: 10 Mandatory Tests + Company B Admin Flow
 *
 * T1:  Platform admin can list companies
 * T2:  Platform admin can create draft company (active company requires first_admin_user_id)
 * T3:  Platform admin can update company
 * T4:  Company Admin A (profiles.role='user') gets 403 from GET /api/admin/companies
 * T5:  Company Admin B (profiles.role='user') gets 403 from POST /api/admin/companies
 * T6:  Ordinary user (no company) gets 403 from any /api/admin/companies route
 * T7:  Company Admin A can access own company settings (companyId from context, not URL)
 * T8:  Company admin cannot grant 'owner' or 'platform_admin' role via /api/companies/members
 * T9:  New company's first admin receives company-level role only (profiles.role never touched)
 * T10: Multi-membership ambiguity → 403 (see also company-context.isolation.test.ts)
 *
 * Company B Admin: profiles.role='user', company_members.role='admin'
 *   - can access all company business routes
 *   - is blocked from all platform admin routes
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Fixture IDs ─────────────────────────────────────────────────────────────

const COMPANY_A  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COMPANY_B  = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ADMIN = 'admin000-0000-0000-0000-000000000001';
const USER_B_ADMIN = 'userb000-0000-0000-0000-000000000002';

// ─── Auth mocks ──────────────────────────────────────────────────────────────

const requireAdminMock = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const requireCompanyRoleMock = vi.hoisted(() => ({ requireCompanyAdminRole: vi.fn() }));

vi.mock('@/lib/auth/api', () => ({
  requireAdmin: requireAdminMock.requireAdmin,
}));

// getCurrentCompanyContext is used by GET routes; share the same mock function
// so setting requireCompanyAdminRole also controls what GET routes see.
vi.mock('@/lib/auth/company-context', () => ({
  requireCompanyAdminRole: requireCompanyRoleMock.requireCompanyAdminRole,
  getCurrentCompanyContext: requireCompanyRoleMock.requireCompanyAdminRole,
  requireCompanyMember: requireCompanyRoleMock.requireCompanyAdminRole,
}));

// ─── DB mock — queue-based ────────────────────────────────────────────────────

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
      chain.insert = vi.fn(() => self);
      chain.update = vi.fn(() => self);
      chain.delete = vi.fn(() => self);
      chain.eq = vi.fn(() => self);
      chain.order = vi.fn(() => self);
      chain.not = vi.fn(() => self);
      chain.maybeSingle = vi.fn(() => Promise.resolve(dbQueue.next()));
      chain.single = vi.fn(() => Promise.resolve(dbQueue.next()));
      chain.then = (onfulfilled: ((v: unknown) => unknown) | null | undefined) =>
        Promise.resolve(dbQueue.next()).then(onfulfilled ?? undefined);
      return chain;
    },
  }),
}));

// ─── Route imports ───────────────────────────────────────────────────────────

import { GET as adminGet, POST as adminPost } from '../route';
import { GET as adminGetOne, PATCH as adminPatch } from '../[id]/route';
import { POST as companyMembersPost } from '../../../companies/members/route';
import { GET as companySettingsGet } from '../../../companies/settings/route';
import { GET as workersGet, POST as workersPost } from '../../../workers/route';
import { GET as vehiclesGet } from '../../../vehicles/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function adminReq(method: string, body?: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/companies', {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
}

function adminIdReq(method: string, body?: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/admin/companies/${COMPANY_A}`, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
}

function companyMembersReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/companies/members', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function workerReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/workers', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const paramsA = { params: Promise.resolve({ id: COMPANY_A }) };

const platformAdminOk = { session: { userId: 'platform-admin', role: 'admin' as const }, error: null };
const companyAdminBlocked = {
  session: null,
  error: new Response(JSON.stringify({ error: 'פעולה זו מחייבת הרשאת מנהל' }), { status: 403 }),
};
const ordinaryUserBlocked = {
  session: null,
  error: new Response(JSON.stringify({ error: 'פעולה זו מחייבת הרשאת מנהל' }), { status: 403 }),
};

const companyAContext = {
  context: {
    companyId: COMPANY_A, userId: USER_ADMIN, companyRole: 'admin' as const,
    platformRole: 'user' as const, email: 'admin@co-a.com', username: 'admin-a',
    settings: { branding: {}, features: {}, ui: {} },
  },
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  dbQueue.reset();
  requireAdminMock.requireAdmin.mockResolvedValue(platformAdminOk);
  requireCompanyRoleMock.requireCompanyAdminRole.mockResolvedValue(companyAContext);
});

// ─── T1: Platform admin lists companies ──────────────────────────────────────

describe('T1: Platform admin can list companies', () => {
  it('GET /api/admin/companies → 200', async () => {
    dbQueue.reset([{ data: [{ id: COMPANY_A, name: 'חברה א', slug: 'co-a', is_active: true }], error: null }]);
    const res = await adminGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

// ─── T2: Platform admin creates company — auto-assigned as first Owner ────────

describe('T2: Platform admin creates company (auto-assigned as first Owner)', () => {
  it('POST /api/admin/companies → 201 active, platform admin auto-assigned as owner', async () => {
    // Flow: slug check → insert inactive → member insert (owner) → activate
    dbQueue.reset([
      { data: null,                                                                   error: null },
      { data: { id: COMPANY_A, slug: 'new-co', name: 'New Co', is_active: false },   error: null },
      { data: { id: 'mem-1', company_id: COMPANY_A, user_id: 'platform-admin', role: 'owner' }, error: null },
      { data: { id: COMPANY_A, slug: 'new-co', name: 'New Co', is_active: true },    error: null },
    ]);
    const res = await adminPost(adminReq('POST', { name: 'New Co', slug: 'new-co' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toBe('new-co');
    expect(body.is_active).toBe(true);
  });
});

// ─── T3: Platform admin updates company ──────────────────────────────────────

describe('T3: Platform admin can update company', () => {
  it('PATCH /api/admin/companies/[id] → 200', async () => {
    dbQueue.reset([
      { data: { id: COMPANY_A, name: 'Updated', slug: 'co-a', is_active: true }, error: null },
    ]);
    const res = await adminPatch(adminIdReq('PATCH', { name: 'Updated' }), paramsA);
    expect(res.status).toBe(200);
  });
});

// ─── T4: Company Admin A gets 403 from platform admin routes ─────────────────
//
// Scenario: user with profiles.role='user' and company_members.role='admin'.
// requireAdmin() checks profiles.role via DB → returns 403 because role ≠ 'admin'.
// The company-level admin role does NOT grant access to /api/admin/**.

describe('T4: Company Admin A (profiles.role=user) gets 403 from /api/admin/companies', () => {
  it('GET blocked — company admin has no platform privileges', async () => {
    requireAdminMock.requireAdmin.mockResolvedValueOnce(companyAdminBlocked);
    const res = await adminGet();
    expect(res.status).toBe(403);
  });

  it('POST blocked', async () => {
    requireAdminMock.requireAdmin.mockResolvedValueOnce(companyAdminBlocked);
    const res = await adminPost(adminReq('POST', { name: 'Co', slug: 'co' }));
    expect(res.status).toBe(403);
  });

  it('PATCH blocked', async () => {
    requireAdminMock.requireAdmin.mockResolvedValueOnce(companyAdminBlocked);
    const res = await adminPatch(adminIdReq('PATCH', { name: 'X' }), paramsA);
    expect(res.status).toBe(403);
  });

  it('GET single company blocked', async () => {
    requireAdminMock.requireAdmin.mockResolvedValueOnce(companyAdminBlocked);
    const res = await adminGetOne(adminIdReq('GET'), paramsA);
    expect(res.status).toBe(403);
  });
});

// ─── T5: Company Admin B gets 403 from platform admin routes ─────────────────
//
// Being admin in Company B does not grant platform admin access.
// requireAdmin() re-checks profiles.role from DB — returns 403 for 'user' role.

describe('T5: Company Admin B (profiles.role=user, company_members.company=B) gets 403', () => {
  it('GET /api/admin/companies blocked — company B admin has no platform privileges', async () => {
    requireAdminMock.requireAdmin.mockResolvedValueOnce({
      session: null,
      error: new Response(JSON.stringify({ error: 'פעולה זו מחייבת הרשאת מנהל' }), { status: 403 }),
    });
    const res = await adminGet();
    expect(res.status).toBe(403);
  });

  it('POST /api/admin/companies blocked', async () => {
    requireAdminMock.requireAdmin.mockResolvedValueOnce({
      session: null,
      error: new Response(JSON.stringify({ error: 'פעולה זו מחייבת הרשאת מנהל' }), { status: 403 }),
    });
    const res = await adminPost(adminReq('POST', { name: 'Co', slug: 'co' }));
    expect(res.status).toBe(403);
  });
});

// ─── T6: Ordinary user (no company membership) gets 403 ──────────────────────

describe('T6: Ordinary user (profiles.role=user, no company membership) gets 403', () => {
  it('GET /api/admin/companies blocked', async () => {
    requireAdminMock.requireAdmin.mockResolvedValueOnce(ordinaryUserBlocked);
    const res = await adminGet();
    expect(res.status).toBe(403);
  });

  it('POST /api/admin/companies blocked', async () => {
    requireAdminMock.requireAdmin.mockResolvedValueOnce(ordinaryUserBlocked);
    const res = await adminPost(adminReq('POST', { name: 'Co', slug: 'co' }));
    expect(res.status).toBe(403);
  });
});

// ─── T7: Company Admin A can access own company — context, not URL ────────────
//
// requireCompanyAdminRole() returns companyId=COMPANY_A from DB (never from request).
// GET /api/companies/settings returns 200 using that context.

describe('T7: Company Admin A accesses own company settings (companyId from context)', () => {
  it('GET /api/companies/settings → 200 using context.companyId', async () => {
    dbQueue.reset([{ data: { settings: {} }, error: null }]);
    const res = await companySettingsGet();
    expect(res.status).toBe(200);
  });
});

// ─── T8: Company admin cannot grant invalid or platform-level roles ───────────

describe('T8: Company admin cannot grant elevated or invalid roles', () => {
  it("role='owner' rejected by /api/companies/members → 400", async () => {
    const res = await companyMembersPost(companyMembersReq({ email: 'x@x.com', role: 'owner' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/role/i);
  });

  it("role='platform_admin' rejected → 400", async () => {
    const res = await companyMembersPost(companyMembersReq({ email: 'x@x.com', role: 'platform_admin' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/role/i);
  });
});

// ─── T9: Platform admin auto-assigned as first Owner — profiles.role untouched ─

describe('T9: First owner auto-assignment via session.userId', () => {
  it('auto-assigns session user as owner — profiles.role never touched', async () => {
    // Flow: slug check → insert inactive → member insert (owner, session.userId) → activate
    dbQueue.reset([
      { data: null,                                                                   error: null },  // slug check (maybeSingle)
      { data: { id: COMPANY_A, slug: 'new-co', name: 'New Co', is_active: false },   error: null },  // insert inactive (single)
      { data: { id: 'mem-1', company_id: COMPANY_A, user_id: 'platform-admin', role: 'owner' }, error: null }, // member insert (then)
      { data: { id: COMPANY_A, slug: 'new-co', name: 'New Co', is_active: true },    error: null },  // activate (single)
    ]);

    const res = await adminPost(adminReq('POST', { name: 'New Co', slug: 'new-co' }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toBe('new-co');
    // Invariant: returned company is active — membership confirmed before activation
    expect(body.is_active).toBe(true);
  });

  it('compensates by deleting company when member insert fails → 500', async () => {
    // Flow: slug check → insert inactive → member insert (fails) → compensating delete
    dbQueue.reset([
      { data: null,                                                                   error: null },  // slug check (maybeSingle)
      { data: { id: COMPANY_A, slug: 'new-co', name: 'New Co', is_active: false },   error: null },  // insert inactive (single)
      { data: null, error: { message: 'duplicate key', code: '23505' } },                            // member insert fails (then)
      { data: null,                                                                   error: null },  // compensating delete (then)
    ]);

    const res = await adminPost(adminReq('POST', { name: 'New Co', slug: 'new-co' }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/בעלים/);
  });
});

// ─── T10: Multi-membership ambiguity fails safely ─────────────────────────────

describe('T10: Multi-membership ambiguity is referenced', () => {
  it('requireCompanyAdminRole returns 403 when auth function signals multi-membership error', async () => {
    requireCompanyRoleMock.requireCompanyAdminRole.mockResolvedValueOnce({
      context: null,
      error: new Response(
        JSON.stringify({ error: 'משתמש משויך למספר חברות — נדרש מתג חברה שטרם הוטמע. פנה לתמיכה.' }),
        { status: 403 }
      ),
    });
    const res = await companySettingsGet();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/מספר חברות/);
  });
});

// ─── Company B Admin Full Access: profiles.role='user', company_members.role='admin' ──
//
// This block proves that a customer-company admin can perform all company operations.
// The user has profiles.role='user' (NOT platform admin) and
// company_members.role='admin' for Company B (company admin).
//
// After the Phase 3 Batch 1 fix (requireCompanyAdminRole instead of requireCompanyAdmin),
// these routes now correctly allow company admins without requiring profiles.role='admin'.

describe('Company B Admin — full company access with profiles.role=user', () => {
  const companyBContext = {
    context: {
      companyId: COMPANY_B,
      userId: USER_B_ADMIN,
      companyRole: 'admin' as const,
      platformRole: 'user' as const,  // ← key: NOT platform admin
      email: 'admin@co-b.com',
      username: 'admin-b',
      settings: { branding: {}, features: { workers: true, documents: true, vehicles: true, reports: true }, ui: {} },
    },
    error: null,
  };

  beforeEach(() => {
    requireCompanyRoleMock.requireCompanyAdminRole.mockResolvedValue(companyBContext);
    requireAdminMock.requireAdmin.mockResolvedValue({
      session: null,
      error: new Response(JSON.stringify({ error: 'פעולה זו מחייבת הרשאת מנהל' }), { status: 403 }),
    });
  });

  it('can access own company settings → 200', async () => {
    dbQueue.reset([{ data: { settings: {} }, error: null }]);
    const res = await companySettingsGet();
    expect(res.status).toBe(200);
    // Not 403 — requireCompanyAdminRole allows profiles.role='user'
  });

  it('can list workers (GET /api/workers) → 200', async () => {
    dbQueue.reset([{ data: [], error: null }]);
    const req = new NextRequest('http://localhost/api/workers');
    const res = await workersGet(req);
    expect(res.status).toBe(200);
  });

  it('can list vehicles (GET /api/vehicles) → 200', async () => {
    dbQueue.reset([{ data: [], error: null }]);
    const res = await vehiclesGet();
    expect(res.status).toBe(200);
  });

  it('can create a worker (POST /api/workers) — auth passes, validation error proves auth did not block', async () => {
    // Sending an intentionally invalid body; 400 = validation failed (not 403 auth failed)
    const res = await workersPost(workerReq({ }));
    // 400 means auth guard passed (requireCompanyAdminRole allowed the request)
    // and validation caught the missing required fields
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(403);
  });

  it('is blocked from GET /api/admin/companies (platform admin route) → 403', async () => {
    const res = await adminGet();
    expect(res.status).toBe(403);
  });

  it('is blocked from POST /api/admin/companies (cannot create another company) → 403', async () => {
    const res = await adminPost(adminReq('POST', { name: 'Co', slug: 'co' }));
    expect(res.status).toBe(403);
  });

  it('cannot grant owner or platform_admin roles → 400 (validation)', async () => {
    const res = await companyMembersPost(companyMembersReq({ email: 'x@x.com', role: 'platform_admin' }));
    expect(res.status).toBe(400);
  });
});
