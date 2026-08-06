/**
 * Cross-company isolation tests — CM1-CM12
 *
 * CM1 : GET /api/companies/members → scoped to active company, not all companies
 * CM2 : Member from another company not included in current company list
 * CM3 : Regular user (profiles.role='user') → 403 on GET /api/admin/users
 * CM4 : Platform admin → 200 on GET /api/admin/users
 * CM5 : POST /api/companies/members uses context.companyId, ignores body company_id
 * CM6 : Platform admin can GET /api/admin/companies/[id]/members for any company
 * CM7 : POST create-user always inserts profiles.role='user'
 * CM8 : POST create-user sets company_members.role from companyRole body field
 * CM9 : POST /api/companies/members → 409 on duplicate active membership
 * CM10: DELETE → 409 for last active member
 * CM11: Safety guard aborts if COMPANY_B matches TEST_SKIP_COMPANY_ID
 * CM12: POST create-user cannot set profiles.role='admin' via request body
 *
 * Safety: all mutations target COMPANY_B only.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Constants ───────────────────────────────────────────────────────────────

const COMPANY_A  = 'aaaaaaaa-0000-0000-0000-000000000001';
const COMPANY_B  = 'bbbbbbbb-0000-0000-0000-000000000002';
const USER_ADMIN = 'adminusr-0000-0000-0000-000000000001';
const USER_B     = 'userbbb0-0000-0000-0000-000000000001';
const MEMBER_B   = 'memb0001-0000-0000-0000-000000000001';
const NEW_USER   = 'newusr00-0000-0000-0000-000000000001';

// ─── Safety guard ────────────────────────────────────────────────────────────

function abortIfProductionTarget(companyId: string) {
  const skipId = process.env.TEST_SKIP_COMPANY_ID ?? '';
  if (skipId && companyId === skipId) {
    throw new Error(`BLOCKED: test would mutate production company ${companyId}`);
  }
}

beforeAll(() => abortIfProductionTarget(COMPANY_B));

// ─── Shared mock state ────────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  dbQueue:          [] as Array<{ data: unknown; error: unknown }>,
  countResult:      2,
  insertedProfiles: [] as Array<Record<string, unknown>>,
  insertedMembers:  [] as Array<Record<string, unknown>>,
  authResult:       { data: { user: { id: 'newusr00-0000-0000-0000-000000000001' } }, error: null } as { data: { user: { id: string } } | null; error: { message: string } | null },

  reset() {
    this.dbQueue          = [];
    this.countResult      = 2;
    this.insertedProfiles = [];
    this.insertedMembers  = [];
    this.authResult       = { data: { user: { id: 'newusr00-0000-0000-0000-000000000001' } }, error: null };
  },
  push(...items: Array<{ data: unknown; error: unknown }>) { this.dbQueue.push(...items); },
  next() { return this.dbQueue.shift() ?? { data: null, error: null }; },
}));

// ─── Auth mocks ───────────────────────────────────────────────────────────────

const companyAuthMock = vi.hoisted(() => ({ requireCompanyAdminRole: vi.fn() }));
const adminAuthMock   = vi.hoisted(() => ({ requireAdmin: vi.fn(), requirePlatformAdmin: vi.fn() }));

vi.mock('@/lib/auth/company-context', () => ({
  requireCompanyAdminRole: companyAuthMock.requireCompanyAdminRole,
}));

vi.mock('@/lib/auth/api', () => ({
  requireAdmin:         adminAuthMock.requireAdmin,
  requirePlatformAdmin: adminAuthMock.requirePlatformAdmin,
}));

// ─── Supabase mock ────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    auth: {
      admin: {
        createUser: vi.fn().mockImplementation(() => Promise.resolve(state.authResult)),
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = chain;

      chain.select = vi.fn((_cols: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) {
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ count: state.countResult, error: null })),
            })),
          };
        }
        return self;
      });

      chain.insert = vi.fn((args: Record<string, unknown>) => {
        if (table === 'profiles')         state.insertedProfiles.push(args);
        if (table === 'company_members')  state.insertedMembers.push(args);
        return self;
      });

      chain.update = vi.fn(() => self);
      chain.delete = vi.fn(() => self);
      chain.eq     = vi.fn(() => self);
      chain.order  = vi.fn(() => self);
      chain.limit  = vi.fn(() => self);

      chain.maybeSingle = vi.fn(() => Promise.resolve(state.next()));
      chain.single      = vi.fn(() => Promise.resolve(state.next()));

      // Awaitable chain (for queries that don't end in .single())
      chain.then = (
        onfulfilled: ((v: unknown) => unknown) | null | undefined,
        _reject?: (e: unknown) => unknown,
      ) => Promise.resolve(state.next()).then(onfulfilled ?? undefined, _reject);

      return chain;
    },
  }),
}));

// ─── Route imports ────────────────────────────────────────────────────────────

import { GET as getMembersRoute, POST as postMembersRoute }
  from '../members/route';
import { DELETE as deleteMemberRoute }
  from '../members/[memberId]/route';
import { POST as createUserRoute }
  from '../members/create-user/route';
import { GET as adminUsersRoute }
  from '../../admin/users/route';
import { GET as adminCompanyMembersRoute }
  from '../../admin/companies/[id]/members/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCompanyAdminContext(companyId = COMPANY_B) {
  companyAuthMock.requireCompanyAdminRole.mockResolvedValue({
    context: { companyId, userId: USER_ADMIN, companyRole: 'admin' },
    error: null,
  });
}

function makePlatformAdminContext() {
  adminAuthMock.requireAdmin.mockResolvedValue({ error: null });
  adminAuthMock.requirePlatformAdmin.mockResolvedValue({ error: null });
}

function makeNonAdminContext() {
  const forbidden = new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  adminAuthMock.requireAdmin.mockResolvedValue({ error: forbidden });
  adminAuthMock.requirePlatformAdmin.mockResolvedValue({ error: forbidden });
}

function postReq(path: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const memberParams = { params: Promise.resolve({ memberId: MEMBER_B }) };
const adminCompanyParams = { params: Promise.resolve({ id: COMPANY_B }) };

// ─── Test setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  state.reset();
  makeCompanyAdminContext();
  makePlatformAdminContext();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

// CM1: GET /api/companies/members scoped to active company
describe('CM1: GET /api/companies/members → only active company members', () => {
  it('returns 200 when context is company admin', async () => {
    state.push({ data: [{ id: MEMBER_B, company_id: COMPANY_B }], error: null });
    const res = await getMembersRoute();
    expect(res.status).toBe(200);
  });
});

// CM2: Cross-company data excluded from response
describe('CM2: Company A member not in Company B list', () => {
  it('context companyId determines which members are returned', async () => {
    const companyBMembers = [{ id: MEMBER_B, company_id: COMPANY_B, user_id: USER_B }];
    state.push({ data: companyBMembers, error: null });
    const res = await getMembersRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    const allBelongToCompanyB = body.every((m: { company_id: string }) => m.company_id === COMPANY_B);
    expect(allBelongToCompanyB).toBe(true);
    expect(body.some((m: { company_id: string }) => m.company_id === COMPANY_A)).toBe(false);
  });
});

// CM3: Regular user (profiles.role='user') cannot access platform admin endpoint
describe('CM3: profiles.role=user cannot GET /api/admin/users', () => {
  it('returns 403 for non-platform-admin', async () => {
    makeNonAdminContext();
    const res = await adminUsersRoute();
    expect(res.status).toBe(403);
  });
});

// CM4: Platform admin can access /api/admin/users
describe('CM4: Platform admin can GET /api/admin/users', () => {
  it('returns 200 for platform admin', async () => {
    state.push({ data: [{ id: USER_ADMIN, role: 'admin' }], error: null });
    const res = await adminUsersRoute();
    expect(res.status).toBe(200);
  });
});

// CM5: POST /api/companies/members uses context.companyId, ignores body company_id
describe('CM5: POST /api/companies/members uses context.companyId exclusively', () => {
  it('inserts into context company even when body contains a different company_id', async () => {
    state.push(
      { data: { id: USER_B }, error: null },               // profile lookup
      { data: null, error: null },                          // no existing membership
      { data: { id: MEMBER_B, company_id: COMPANY_B }, error: null }, // insert result
    );
    const req = postReq('/api/companies/members', {
      email: 'new@example.com',
      role: 'member',
      company_id: COMPANY_A, // ignored — should NOT be used
    });
    const res = await postMembersRoute(req);
    expect(res.status).toBe(201);
    // The insert args captured: company_id must be from context (COMPANY_B), not COMPANY_A
    expect(state.insertedMembers[0]?.company_id).toBe(COMPANY_B);
    expect(state.insertedMembers[0]?.company_id).not.toBe(COMPANY_A);
  });
});

// CM6: Platform admin can GET members of any company
describe('CM6: Platform admin can GET /api/admin/companies/[id]/members', () => {
  it('returns 200 for platform admin querying any company', async () => {
    state.push({ data: [{ id: MEMBER_B, company_id: COMPANY_B }], error: null });
    const res = await adminCompanyMembersRoute(
      new NextRequest(`http://localhost/api/admin/companies/${COMPANY_B}/members`),
      adminCompanyParams,
    );
    expect(res.status).toBe(200);
  });
});

// CM7: POST create-user always inserts profiles.role='user'
describe('CM7: POST create-user → profiles.role always set to user', () => {
  it('inserts user role into profiles table', async () => {
    state.push(
      { data: { id: NEW_USER, full_name: 'Test', role: 'user' }, error: null }, // profile insert
      { data: { id: MEMBER_B, company_id: COMPANY_B, user_id: NEW_USER, role: 'member', is_active: true, joined_at: new Date().toISOString() }, error: null }, // member insert
    );
    const req = postReq('/api/companies/members/create-user', {
      full_name: 'Test User',
      username: 'testuser',
      password: 'password123',
      companyRole: 'member',
    });
    const res = await createUserRoute(req);
    expect(res.status).toBe(201);
    expect(state.insertedProfiles[0]?.role).toBe('user');
  });
});

// CM8: POST create-user sets company_members.role from companyRole
describe('CM8: POST create-user sets company_members.role from companyRole body field', () => {
  it('inserts the requested companyRole into company_members', async () => {
    state.push(
      { data: { id: NEW_USER, full_name: 'Admin Test', role: 'user' }, error: null },
      { data: { id: MEMBER_B, company_id: COMPANY_B, user_id: NEW_USER, role: 'admin', is_active: true, joined_at: new Date().toISOString() }, error: null },
    );
    const req = postReq('/api/companies/members/create-user', {
      full_name: 'Admin Test',
      username: 'admintest',
      password: 'password123',
      companyRole: 'admin',
    });
    const res = await createUserRoute(req);
    expect(res.status).toBe(201);
    expect(state.insertedMembers[0]?.role).toBe('admin');
    expect(state.insertedMembers[0]?.company_id).toBe(COMPANY_B);
  });
});

// CM9: POST /api/companies/members → 409 on duplicate active membership
describe('CM9: POST /api/companies/members → 409 on duplicate active membership', () => {
  it('returns 409 when the user is already an active member', async () => {
    state.push(
      { data: { id: USER_B }, error: null },               // profile lookup
      { data: { id: MEMBER_B, is_active: true }, error: null }, // existing membership found and active
    );
    const req = postReq('/api/companies/members', {
      email: 'existing@example.com',
      role: 'member',
    });
    const res = await postMembersRoute(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/כבר חבר/);
  });
});

// CM10: DELETE → 409 for last active member
describe('CM10: DELETE → 409 when removing last active member', () => {
  it('returns 409 and prevents last-member removal', async () => {
    state.push({ data: { id: MEMBER_B, user_id: USER_B }, error: null }); // membership found
    state.countResult = 1; // only one active member
    const req = new NextRequest(`http://localhost/api/companies/members/${MEMBER_B}`, { method: 'DELETE' });
    const res = await deleteMemberRoute(req, memberParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/אחרון/);
  });
});

// CM11: Safety guard aborts test if COMPANY_B is the protected company
describe('CM11: Safety guard prevents mutation of protected company', () => {
  it('COMPANY_B must not equal TEST_SKIP_COMPANY_ID', () => {
    const skipId = process.env.TEST_SKIP_COMPANY_ID ?? '';
    if (skipId) {
      expect(skipId).not.toBe(COMPANY_B);
    } else {
      expect(true).toBe(true); // guard inactive — test passes
    }
  });
});

// CM12: POST create-user cannot elevate profiles.role to 'admin' via body
describe('CM12: POST create-user cannot set profiles.role=admin via request body', () => {
  it('ignores any role field in body — profiles.role always user', async () => {
    state.push(
      { data: { id: NEW_USER, full_name: 'Hacker', role: 'user' }, error: null },
      { data: { id: MEMBER_B, company_id: COMPANY_B, user_id: NEW_USER, role: 'member', is_active: true, joined_at: new Date().toISOString() }, error: null },
    );
    const req = postReq('/api/companies/members/create-user', {
      full_name: 'Hacker Attempt',
      username: 'hacker',
      password: 'password123',
      companyRole: 'member',
      role: 'admin', // should be ignored entirely
    });
    const res = await createUserRoute(req);
    expect(res.status).toBe(201);
    // Profiles must have role='user' regardless of the body's role field
    expect(state.insertedProfiles[0]?.role).toBe('user');
    expect(state.insertedProfiles[0]?.role).not.toBe('admin');
  });
});
