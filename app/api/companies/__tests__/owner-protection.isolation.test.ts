/**
 * Owner-protection regression tests
 *
 * OP1: PATCH — non-owner (admin) cannot modify an owner's membership → 403
 * OP2: PATCH — owner can demote another owner when multiple owners exist → 200
 * OP3: PATCH — last-owner demotion is blocked → 409
 * OP4: DELETE — non-owner (admin) cannot remove an owner → 403
 * OP5: DELETE — last-owner deletion is blocked → 409
 * OP6: create-user POST — non-owner cannot create an owner → 403
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const COMPANY_A   = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ADMIN  = 'admin000-0000-0000-0000-000000000001';
const USER_OWNER  = 'owner000-0000-0000-0000-000000000001';
const USER_TARGET = 'target00-0000-0000-0000-000000000001';
const MEMBER_1    = 'mmmmmmmm-0000-0000-0000-000000000001';

// ─── Auth mock ───────────────────────────────────────────────────────────────

const authMock = vi.hoisted(() => ({ requireCompanyAdminRole: vi.fn() }));
vi.mock('@/lib/auth/company-context', () => ({
  requireCompanyAdminRole: authMock.requireCompanyAdminRole,
}));

// ─── DB mock ─────────────────────────────────────────────────────────────────
// Count chain: chainable via unlimited .eq(), awaitable as a thenable.
// In every DELETE/PATCH path tested here the owner-count check fires before
// the active-member-count check, so a single ownerCount value suffices.

const dbState = vi.hoisted(() => ({
  membershipResult: null as null | Record<string, unknown>,
  ownerCount: 2,
  updateResult: null as null | Record<string, unknown>,
}));

vi.mock('@/lib/supabase/server', () => {
  function makeCountChain(getCount: () => number): Record<string, unknown> {
    const self: Record<string, unknown> = {};
    self['eq'] = vi.fn(() => self);
    self['then'] = (
      resolve: ((v: { count: number; error: null }) => unknown) | null | undefined,
      reject?: ((r: unknown) => unknown) | null,
    ) => Promise.resolve({ count: getCount(), error: null }).then(resolve ?? undefined, reject ?? undefined);
    return self;
  }

  function makeChain(): Record<string, unknown> {
    let isCountQuery = false;
    const chain: Record<string, unknown> = {};
    chain['select'] = vi.fn((_cols: string, opts?: { count?: string; head?: boolean }) => {
      isCountQuery = !!(opts?.head);
      return chain;
    });
    chain['update']  = vi.fn(() => chain);
    chain['delete']  = vi.fn(() => chain);
    chain['insert']  = vi.fn(() => chain);
    chain['eq'] = vi.fn(() =>
      isCountQuery ? makeCountChain(() => dbState.ownerCount) : chain,
    );
    chain['maybeSingle'] = vi.fn(() =>
      Promise.resolve({ data: dbState.membershipResult, error: null }),
    );
    chain['single'] = vi.fn(() =>
      Promise.resolve({ data: dbState.updateResult, error: null }),
    );
    return chain;
  }

  return {
    createServiceClient: () => ({
      from: () => makeChain(),
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: null, error: { message: 'not mocked in test' } }),
          deleteUser: vi.fn().mockResolvedValue({ error: null }),
        },
      },
    }),
  };
});

// ─── Route imports ───────────────────────────────────────────────────────────

import { PATCH, DELETE } from '../members/[memberId]/route';
import { POST as createUserPOST } from '../members/create-user/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const memberParams = { params: Promise.resolve({ memberId: MEMBER_1 }) };

function patchReq(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/companies/members/${MEMBER_1}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function deleteReq() {
  return new NextRequest(`http://localhost/api/companies/members/${MEMBER_1}`, {
    method: 'DELETE',
  });
}

function createUserReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/companies/members/create-user', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const adminContext = {
  context: { companyId: COMPANY_A, userId: USER_ADMIN, companyRole: 'admin' as const },
  error: null,
};

const ownerContext = {
  context: { companyId: COMPANY_A, userId: USER_OWNER, companyRole: 'owner' as const },
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  dbState.membershipResult = null;
  dbState.ownerCount = 2;
  dbState.updateResult = null;
  authMock.requireCompanyAdminRole.mockResolvedValue(adminContext);
});

// ─── OP1 ─────────────────────────────────────────────────────────────────────

describe('OP1: PATCH — non-owner cannot modify an owner', () => {
  it('returns 403 when admin tries to change owner role', async () => {
    dbState.membershipResult = { id: MEMBER_1, user_id: USER_TARGET, role: 'owner' };
    const res = await PATCH(patchReq({ role: 'admin' }), memberParams);
    expect(res.status).toBe(403);
    const body = await res.json() as { error?: string };
    expect(body.error).toMatch(/בעלים/);
  });

  it('returns 403 when admin tries to deactivate an owner', async () => {
    dbState.membershipResult = { id: MEMBER_1, user_id: USER_TARGET, role: 'owner' };
    const res = await PATCH(patchReq({ is_active: false }), memberParams);
    expect(res.status).toBe(403);
  });
});

// ─── OP2 ─────────────────────────────────────────────────────────────────────

describe('OP2: PATCH — owner can demote another owner when multiple exist', () => {
  it('returns 200 when owner demotes another owner (2 owners exist)', async () => {
    authMock.requireCompanyAdminRole.mockResolvedValue(ownerContext);
    dbState.membershipResult = { id: MEMBER_1, user_id: USER_TARGET, role: 'owner' };
    dbState.ownerCount = 2;
    dbState.updateResult = { id: MEMBER_1, role: 'admin' };
    const res = await PATCH(patchReq({ role: 'admin' }), memberParams);
    expect(res.status).toBe(200);
  });
});

// ─── OP3 ─────────────────────────────────────────────────────────────────────

describe('OP3: PATCH — last-owner demotion is blocked', () => {
  it('returns 409 when the only owner would be demoted', async () => {
    authMock.requireCompanyAdminRole.mockResolvedValue(ownerContext);
    dbState.membershipResult = { id: MEMBER_1, user_id: USER_TARGET, role: 'owner' };
    dbState.ownerCount = 1;
    const res = await PATCH(patchReq({ role: 'admin' }), memberParams);
    expect(res.status).toBe(409);
    const body = await res.json() as { error?: string };
    expect(body.error).toMatch(/אחרון|בעלים/);
  });
});

// ─── OP4 ─────────────────────────────────────────────────────────────────────

describe('OP4: DELETE — non-owner cannot remove an owner', () => {
  it('returns 403 when admin tries to delete an owner', async () => {
    dbState.membershipResult = { id: MEMBER_1, user_id: USER_TARGET, role: 'owner' };
    const res = await DELETE(deleteReq(), memberParams);
    expect(res.status).toBe(403);
    const body = await res.json() as { error?: string };
    expect(body.error).toMatch(/בעלים/);
  });
});

// ─── OP5 ─────────────────────────────────────────────────────────────────────

describe('OP5: DELETE — last-owner deletion is blocked', () => {
  it('returns 409 when the only remaining owner would be deleted', async () => {
    authMock.requireCompanyAdminRole.mockResolvedValue(ownerContext);
    dbState.membershipResult = { id: MEMBER_1, user_id: USER_TARGET, role: 'owner' };
    dbState.ownerCount = 1;
    const res = await DELETE(deleteReq(), memberParams);
    expect(res.status).toBe(409);
    const body = await res.json() as { error?: string };
    expect(body.error).toMatch(/אחרון|בעלים/);
  });
});

// ─── OP6 ─────────────────────────────────────────────────────────────────────

describe('OP6: create-user POST — non-owner cannot create an owner', () => {
  it('returns 403 when admin submits companyRole=owner', async () => {
    const res = await createUserPOST(createUserReq({
      full_name: 'Test Owner',
      username: 'testowner',
      password: 'Secure123!',
      companyRole: 'owner',
    }));
    expect(res.status).toBe(403);
    const body = await res.json() as { error?: string };
    expect(body.error).toMatch(/בעלים/);
  });

  it('does NOT return 403 when owner submits companyRole=owner', async () => {
    authMock.requireCompanyAdminRole.mockResolvedValue(ownerContext);
    // auth.admin.createUser is mocked to error; any non-403 status is acceptable
    const res = await createUserPOST(createUserReq({
      full_name: 'Test Owner',
      username: 'testowner2',
      password: 'Secure123!',
      companyRole: 'owner',
    }));
    expect(res.status).not.toBe(403);
  });
});
