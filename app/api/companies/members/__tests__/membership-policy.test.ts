/**
 * Membership Policy Security Regression Tests
 *
 * Enforces: PLATFORM OWNER ONLY may add/remove users from a company or change
 * company roles. Company owner/admin/member may NOT perform user-management mutations.
 *
 * E1:  Platform Owner CAN create a new platform user + add to company.
 * E2:  Platform Owner CAN add an existing user to the company.
 * E3:  Platform Owner CAN remove a user from the company.
 * E4:  Platform Owner CAN change a company member's role.
 * E5:  Company owner (platformRole='user') CANNOT create a user.
 * E6:  Company admin (platformRole='user') CANNOT create a user.
 * E7:  Company admin CANNOT add an existing user to the company.
 * E8:  Company admin CANNOT remove a company member.
 * E9:  Company admin CANNOT change a company member's role.
 * E10: Company member CANNOT perform any user-management mutation (create).
 * E11: Review manager (member-level) CANNOT perform any user-management mutation (add existing).
 * E12: Unauthenticated direct API call returns 401.
 * E13: Cross-company membership manipulation is blocked (companyId from auth context).
 * E14: GET /api/companies/members still accessible to company admins.
 * E15: Platform Owner protections from R1–R14 still in effect (referenced — not duplicated).
 * E16: All mutation routes reject non-platform-admins with 403 (consolidated smoke-test).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Auth mock (getCurrentCompanyContext used by all mutation routes) ──────────

const companyContextMock = vi.hoisted(() => ({ getCurrentCompanyContext: vi.fn() }));

vi.mock('@/lib/auth/company-context', () => ({
  getCurrentCompanyContext:  companyContextMock.getCurrentCompanyContext,
  requireCompanyAdminRole:   companyContextMock.getCurrentCompanyContext,
  requireCompanyMember:      companyContextMock.getCurrentCompanyContext,
}));

// ─── auth.admin mock (create-user route calls supabase.auth.admin.createUser) ──

const authAdminMock = vi.hoisted(() => ({
  createUser: vi.fn(),
  deleteUser: vi.fn(),
}));

// ─── DB mock — per-call queue ─────────────────────────────────────────────────

const dbQueue = vi.hoisted(() => ({
  queue: [] as Array<{ data: unknown; count?: number | null; error: unknown }>,
  reset(q: Array<{ data: unknown; count?: number | null; error: unknown }> = []) {
    this.queue = [...q];
  },
  next() { return this.queue.shift() ?? { data: null, count: null, error: null }; },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select      = vi.fn(() => chain);
      chain.insert      = vi.fn(() => chain);
      chain.update      = vi.fn(() => chain);
      chain.delete      = vi.fn(() => chain);
      chain.eq          = vi.fn(() => chain);
      chain.order       = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(() => Promise.resolve(dbQueue.next()));
      chain.single      = vi.fn(() => Promise.resolve(dbQueue.next()));
      chain.head        = vi.fn(() => chain);
      chain.then        = (fn: ((v: unknown) => unknown) | null | undefined) =>
        Promise.resolve(dbQueue.next()).then(fn ?? undefined);
      return chain;
    },
    auth: {
      admin: {
        createUser: authAdminMock.createUser,
        deleteUser: authAdminMock.deleteUser,
      },
    },
  }),
}));

// ─── Route imports ─────────────────────────────────────────────────────────────

import { GET  as membersGet,
         POST as membersPost  }  from '../route';
import { PATCH as memberPatch,
         DELETE as memberDelete } from '../[memberId]/route';
import { POST as createUserPost } from '../create-user/route';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const COMPANY_A_ID  = 'comp0000-0000-0000-0000-000000000001';
const COMPANY_B_ID  = 'comp0000-0000-0000-0000-000000000002';
const PLATFORM_ADMIN_ID = 'admin000-0000-0000-0000-000000000001';
const OTHER_USER_ID     = 'user0000-0000-0000-0000-000000000001';
const MEMBER_ID         = 'memb0000-0000-0000-0000-000000000001';

const baseContext = {
  userId:      PLATFORM_ADMIN_ID,
  email:       'admin@test.com',
  username:    'admin',
  companyId:   COMPANY_A_ID,
  companyName: 'Test Co',
  settings:    {},
};

const platformAdminContext = {
  context: { ...baseContext, platformRole: 'admin' as const, companyRole: 'owner' as const },
  error: null,
};

const companyOwnerContext = {
  context: { ...baseContext, userId: OTHER_USER_ID, email: 'owner@test.com', username: 'owner',
    platformRole: 'user' as const, companyRole: 'owner' as const },
  error: null,
};

const companyAdminContext = {
  context: { ...baseContext, userId: OTHER_USER_ID, email: 'coadmin@test.com', username: 'coadmin',
    platformRole: 'user' as const, companyRole: 'admin' as const },
  error: null,
};

const companyMemberContext = {
  context: { ...baseContext, userId: OTHER_USER_ID, email: 'member@test.com', username: 'member',
    platformRole: 'user' as const, companyRole: 'member' as const },
  error: null,
};

const noSessionError = {
  context: null as null,
  error: NextResponse.json({ error: 'לא מורשה — יש להתחבר תחילה' }, { status: 401 }),
};

// ─── Request builders ──────────────────────────────────────────────────────────

function addExistingReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/companies/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createUserReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/companies/members/create-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patchMemberReq(memberId: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/companies/members/${memberId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteMemberReq(memberId: string) {
  return new NextRequest(`http://localhost/api/companies/members/${memberId}`, {
    method: 'DELETE',
  });
}

// ─── Before each ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  dbQueue.reset();
  authAdminMock.createUser.mockResolvedValue({
    data: { user: { id: 'new-user-id-000-0000-0000-000000000001' } },
    error: null,
  });
  authAdminMock.deleteUser.mockResolvedValue({ error: null });
});

// ─── E1: Platform Owner CAN create a new user ──────────────────────────────────

describe('E1: Platform Owner CAN create a new platform user', () => {
  it('POST /api/companies/members/create-user → 201', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(platformAdminContext);
    dbQueue.reset([
      // profiles insert → single()
      { data: { id: 'new-user-id', full_name: 'New User', username: 'newuser',
                email: 'newuser@test.com', role: 'user' }, error: null },
      // company_members insert → single()
      { data: { id: MEMBER_ID, company_id: COMPANY_A_ID, user_id: 'new-user-id',
                role: 'member', is_active: true, joined_at: new Date().toISOString() }, error: null },
    ]);

    const res = await createUserPost(createUserReq({
      full_name: 'New User',
      username: 'newuser',
      password: 'password123',
      companyRole: 'member',
    }));
    expect(res.status).toBe(201);
  });
});

// ─── E2: Platform Owner CAN add an existing user ───────────────────────────────

describe('E2: Platform Owner CAN add an existing user to the company', () => {
  it('POST /api/companies/members → 201', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(platformAdminContext);
    dbQueue.reset([
      // profile lookup by email
      { data: { id: OTHER_USER_ID }, error: null },
      // existing membership check → null (not yet a member)
      { data: null, error: null },
      // insert membership → single()
      { data: { id: MEMBER_ID, company_id: COMPANY_A_ID, user_id: OTHER_USER_ID,
                role: 'member', is_active: true, joined_at: new Date().toISOString() }, error: null },
    ]);

    const res = await membersPost(addExistingReq({ email: 'other@test.com', role: 'member' }));
    expect(res.status).toBe(201);
  });
});

// ─── E3: Platform Owner CAN remove a user ─────────────────────────────────────

describe('E3: Platform Owner CAN remove a user from the company', () => {
  it('DELETE /api/companies/members/[memberId] → 200', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(platformAdminContext);
    dbQueue.reset([
      // membership lookup → non-owner, different user
      { data: { id: MEMBER_ID, user_id: OTHER_USER_ID, role: 'member' }, error: null },
      // count active members → 2 (not the last)
      { data: null, count: 2, error: null },
      // delete
      { data: null, error: null },
    ]);

    const res = await memberDelete(deleteMemberReq(MEMBER_ID), {
      params: Promise.resolve({ memberId: MEMBER_ID }),
    });
    expect(res.status).toBe(200);
  });
});

// ─── E4: Platform Owner CAN change a company member's role ────────────────────

describe('E4: Platform Owner CAN change a company member role', () => {
  it('PATCH /api/companies/members/[memberId] role → 200', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(platformAdminContext);
    dbQueue.reset([
      // membership lookup
      { data: { id: MEMBER_ID, user_id: OTHER_USER_ID, role: 'member' }, error: null },
      // update → single()
      { data: { id: MEMBER_ID, user_id: OTHER_USER_ID, role: 'admin', is_active: true }, error: null },
    ]);

    const res = await memberPatch(patchMemberReq(MEMBER_ID, { role: 'admin' }), {
      params: Promise.resolve({ memberId: MEMBER_ID }),
    });
    expect(res.status).toBe(200);
  });
});

// ─── E5: Company owner (platformRole='user') CANNOT create a user ─────────────

describe('E5: Company owner (platformRole=user) CANNOT create a platform user', () => {
  it('POST /api/companies/members/create-user → 403', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(companyOwnerContext);
    const res = await createUserPost(createUserReq({
      full_name: 'Hack', username: 'hack', password: 'password123',
    }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/מנהל פלטפורמה/);
  });
});

// ─── E6: Company admin (platformRole='user') CANNOT create a user ─────────────

describe('E6: Company admin (platformRole=user) CANNOT create a platform user', () => {
  it('POST /api/companies/members/create-user → 403', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(companyAdminContext);
    const res = await createUserPost(createUserReq({
      full_name: 'Hack', username: 'hack', password: 'password123',
    }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/מנהל פלטפורמה/);
  });
});

// ─── E7: Company admin CANNOT add an existing user ────────────────────────────

describe('E7: Company admin CANNOT add an existing user to the company', () => {
  it('POST /api/companies/members → 403', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(companyAdminContext);
    const res = await membersPost(addExistingReq({ email: 'other@test.com', role: 'member' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/מנהל פלטפורמה/);
  });
});

// ─── E8: Company admin CANNOT remove a company member ─────────────────────────

describe('E8: Company admin CANNOT remove a company member', () => {
  it('DELETE /api/companies/members/[memberId] → 403', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(companyAdminContext);
    const res = await memberDelete(deleteMemberReq(MEMBER_ID), {
      params: Promise.resolve({ memberId: MEMBER_ID }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/מנהל פלטפורמה/);
  });
});

// ─── E9: Company admin CANNOT change a company member's role ──────────────────

describe('E9: Company admin CANNOT change a company member role', () => {
  it('PATCH /api/companies/members/[memberId] → 403', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(companyAdminContext);
    const res = await memberPatch(patchMemberReq(MEMBER_ID, { role: 'admin' }), {
      params: Promise.resolve({ memberId: MEMBER_ID }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/מנהל פלטפורמה/);
  });
});

// ─── E10: Company member CANNOT mutate membership ────────────────────────────

describe('E10: Company member (platformRole=user) CANNOT perform membership mutations', () => {
  it('POST create-user → 403', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(companyMemberContext);
    const res = await createUserPost(createUserReq({ full_name: 'Hack', username: 'hack', password: 'pass1234' }));
    expect(res.status).toBe(403);
  });

  it('DELETE member → 403', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(companyMemberContext);
    const res = await memberDelete(deleteMemberReq(MEMBER_ID), {
      params: Promise.resolve({ memberId: MEMBER_ID }),
    });
    expect(res.status).toBe(403);
  });

  it('PATCH member → 403', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(companyMemberContext);
    const res = await memberPatch(patchMemberReq(MEMBER_ID, { role: 'admin' }), {
      params: Promise.resolve({ memberId: MEMBER_ID }),
    });
    expect(res.status).toBe(403);
  });
});

// ─── E11: Review-manager-level role CANNOT mutate membership ─────────────────
// CompanyRole only defines owner/admin/member. Review-manager maps to member.

describe('E11: Review-manager (member role, platformRole=user) CANNOT add existing user', () => {
  it('POST /api/companies/members → 403', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(companyMemberContext);
    const res = await membersPost(addExistingReq({ email: 'other@test.com', role: 'member' }));
    expect(res.status).toBe(403);
  });
});

// ─── E12: Unauthenticated request returns 401 ────────────────────────────────

describe('E12: Unauthenticated direct API calls return 401', () => {
  it('POST /api/companies/members/create-user with no session → 401', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(noSessionError);
    const res = await createUserPost(createUserReq({ full_name: 'x', username: 'x', password: 'pass1234' }));
    expect(res.status).toBe(401);
  });

  it('POST /api/companies/members with no session → 401', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(noSessionError);
    const res = await membersPost(addExistingReq({ email: 'x@x.com', role: 'member' }));
    expect(res.status).toBe(401);
  });

  it('PATCH /api/companies/members/[id] with no session → 401', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(noSessionError);
    const res = await memberPatch(patchMemberReq(MEMBER_ID, { role: 'admin' }), {
      params: Promise.resolve({ memberId: MEMBER_ID }),
    });
    expect(res.status).toBe(401);
  });

  it('DELETE /api/companies/members/[id] with no session → 401', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(noSessionError);
    const res = await memberDelete(deleteMemberReq(MEMBER_ID), {
      params: Promise.resolve({ memberId: MEMBER_ID }),
    });
    expect(res.status).toBe(401);
  });
});

// ─── E13: Cross-company manipulation blocked ──────────────────────────────────
// The companyId is always taken from auth context — never from request body.
// A membership that belongs to a different company will not be found under
// context.companyId, resulting in 404.

describe('E13: Cross-company manipulation is blocked via auth-context scoping', () => {
  it('DELETE membership from another company → 404 (not found in auth company)', async () => {
    // Platform admin is in COMPANY_A — tries to target a member of COMPANY_B
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(platformAdminContext);
    // DB returns null because .eq('company_id', COMPANY_A_ID) filters out the COMPANY_B member
    dbQueue.reset([
      { data: null, error: null }, // maybeSingle → not found
    ]);

    const res = await memberDelete(deleteMemberReq(MEMBER_ID), {
      params: Promise.resolve({ memberId: MEMBER_ID }),
    });
    expect(res.status).toBe(404);
  });

  it('PATCH membership from another company → 404', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(platformAdminContext);
    dbQueue.reset([
      { data: null, error: null }, // maybeSingle → not found in auth company
    ]);

    const res = await memberPatch(patchMemberReq(MEMBER_ID, { role: 'admin' }), {
      params: Promise.resolve({ memberId: MEMBER_ID }),
    });
    expect(res.status).toBe(404);
  });
});

// ─── E14: GET /api/companies/members still accessible to company admins ───────

describe('E14: GET members list still works for company admins', () => {
  it('GET /api/companies/members as company admin → 200', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(companyAdminContext);
    dbQueue.reset([
      { data: [], error: null },
    ]);

    const res = await membersGet();
    expect(res.status).toBe(200);
  });
});

// ─── E15: Platform Owner protections still in effect ─────────────────────────
// The R1–R14 tests in rbac-privilege-escalation.test.ts must still pass.
// This test documents that no changes were made to the platform admin routes
// that could undermine those protections.

describe('E15: Platform Owner protections for admin routes still in effect', () => {
  it('POST /api/companies/members still rejects company admin (R-level guard not weakened)', async () => {
    companyContextMock.getCurrentCompanyContext.mockResolvedValue(companyAdminContext);
    const res = await membersPost(addExistingReq({ email: 'x@x.com', role: 'member' }));
    expect(res.status).toBe(403);
  });
});

// ─── E16: Consolidated smoke-test — all 4 mutation routes reject non-platform-admins ──

describe('E16: All membership mutation routes reject non-platform-admins', () => {
  const nonPlatformContexts = [
    { label: 'company owner', ctx: companyOwnerContext },
    { label: 'company admin', ctx: companyAdminContext },
    { label: 'company member', ctx: companyMemberContext },
  ];

  for (const { label, ctx } of nonPlatformContexts) {
    it(`${label} → 403 on POST create-user`, async () => {
      companyContextMock.getCurrentCompanyContext.mockResolvedValue(ctx);
      const res = await createUserPost(createUserReq({ full_name: 'x', username: 'x', password: 'pass1234' }));
      expect(res.status).toBe(403);
    });

    it(`${label} → 403 on POST add-existing`, async () => {
      companyContextMock.getCurrentCompanyContext.mockResolvedValue(ctx);
      const res = await membersPost(addExistingReq({ email: 'x@x.com', role: 'member' }));
      expect(res.status).toBe(403);
    });

    it(`${label} → 403 on PATCH member`, async () => {
      companyContextMock.getCurrentCompanyContext.mockResolvedValue(ctx);
      const res = await memberPatch(patchMemberReq(MEMBER_ID, { role: 'admin' }), {
        params: Promise.resolve({ memberId: MEMBER_ID }),
      });
      expect(res.status).toBe(403);
    });

    it(`${label} → 403 on DELETE member`, async () => {
      companyContextMock.getCurrentCompanyContext.mockResolvedValue(ctx);
      const res = await memberDelete(deleteMemberReq(MEMBER_ID), {
        params: Promise.resolve({ memberId: MEMBER_ID }),
      });
      expect(res.status).toBe(403);
    });
  }
});
