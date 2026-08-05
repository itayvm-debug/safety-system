/**
 * Phase 3 Batch 2 — company-context.ts isolation tests
 *
 * T1:  No session → 401 NO_SESSION
 * T2:  Inactive profile → 403 INACTIVE_PROFILE
 * T3:  No memberships → 403 NO_MEMBERSHIP
 * T4:  Single membership → auto-selected (getActiveCompanyId not called)
 * T5:  2+ memberships + no cookie → 403 NEEDS_COMPANY_SELECTION
 * T6:  2+ memberships + stale cookie → 403 NEEDS_COMPANY_SELECTION
 * T7:  2+ memberships + valid cookie → resolves to matching company
 * T8:  Company inactive → 403 INACTIVE_COMPANY
 * T9:  requireCompanyAdminRole — member role → 403 FORBIDDEN_ROLE
 * T10: requireCompanyAdminRole — admin role → ok (code field absent)
 * T11: requireCompanyAdminRole — owner role → ok
 * T12: Company admin with profiles.role='user' is allowed (invariant)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const sessionMock = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getSession: sessionMock.getSession }));

const activeCompanyMock = vi.hoisted(() => ({ getActiveCompanyId: vi.fn<() => Promise<string | null>>() }));
vi.mock('@/lib/auth/active-company', () => ({ getActiveCompanyId: activeCompanyMock.getActiveCompanyId }));

const supabaseMock = vi.hoisted(() => ({
  profile:     null as unknown,
  memberships: null as unknown,
  company:     null as unknown,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = chain;
      chain.select = vi.fn(() => self);
      chain.eq     = vi.fn(() => self);
      chain.limit  = vi.fn(() => self);
      chain.single = vi.fn(() => {
        if (table === 'profiles') return Promise.resolve(supabaseMock.profile);
        if (table === 'companies') return Promise.resolve(supabaseMock.company);
        return Promise.resolve({ data: null, error: null });
      });
      // company_members is awaited directly (thenable chain)
      chain.then = (onfulfilled: ((v: unknown) => unknown) | null | undefined) => {
        if (table === 'company_members') {
          return Promise.resolve(supabaseMock.memberships).then(onfulfilled ?? undefined);
        }
        return Promise.resolve({ data: null, error: null }).then(onfulfilled ?? undefined);
      };
      return chain;
    },
  }),
}));

vi.mock('@/lib/company/settings', () => ({
  resolveCompanySettings: () => ({ branding: {}, features: {}, ui: {} }),
}));

import { getCurrentCompanyContext, requireCompanyAdminRole } from '../company-context';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_SESSION = { userId: 'user-1', email: 'test@test.com', username: 'test', role: 'user' as const, loginAt: 0 };
const ACTIVE_PROFILE = { data: { is_active: true, role: 'user' }, error: null };
const ONE_MEMBERSHIP  = { data: [{ company_id: 'co-a', role: 'admin', is_active: true }], error: null };
const TWO_MEMBERSHIPS = {
  data: [
    { company_id: 'co-a', role: 'admin',  is_active: true },
    { company_id: 'co-b', role: 'member', is_active: true },
  ],
  error: null,
};
const ACTIVE_COMPANY  = { data: { id: 'co-a', name: 'חברה א', settings: {}, is_active: true }, error: null };

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.profile     = null;
  supabaseMock.memberships = null;
  supabaseMock.company     = null;
  activeCompanyMock.getActiveCompanyId.mockResolvedValue(null);
});

// ─── T1 ───────────────────────────────────────────────────────────────────────
describe('T1: No session → 401 NO_SESSION', () => {
  it('returns error with code NO_SESSION and status 401', async () => {
    sessionMock.getSession.mockResolvedValueOnce(null);
    const result = await getCurrentCompanyContext();
    expect(result.error).not.toBeNull();
    expect(result.code).toBe('NO_SESSION');
    expect((result.error as Response).status).toBe(401);
  });
});

// ─── T2 ───────────────────────────────────────────────────────────────────────
describe('T2: Inactive profile → 403 INACTIVE_PROFILE', () => {
  it('returns INACTIVE_PROFILE when is_active=false', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    supabaseMock.profile = { data: { is_active: false, role: 'user' }, error: null };
    const result = await getCurrentCompanyContext();
    expect(result.code).toBe('INACTIVE_PROFILE');
    expect((result.error as Response).status).toBe(403);
  });

  it('returns INACTIVE_PROFILE when profile is null', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    supabaseMock.profile = { data: null, error: null };
    const result = await getCurrentCompanyContext();
    expect(result.code).toBe('INACTIVE_PROFILE');
  });
});

// ─── T3 ───────────────────────────────────────────────────────────────────────
describe('T3: No memberships → 403 NO_MEMBERSHIP', () => {
  it('returns NO_MEMBERSHIP when memberships is empty', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    supabaseMock.profile     = ACTIVE_PROFILE;
    supabaseMock.memberships = { data: [], error: null };
    const result = await getCurrentCompanyContext();
    expect(result.code).toBe('NO_MEMBERSHIP');
    expect((result.error as Response).status).toBe(403);
  });

  it('returns NO_MEMBERSHIP when memberships is null', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    supabaseMock.profile     = ACTIVE_PROFILE;
    supabaseMock.memberships = { data: null, error: null };
    const result = await getCurrentCompanyContext();
    expect(result.code).toBe('NO_MEMBERSHIP');
  });
});

// ─── T4 ───────────────────────────────────────────────────────────────────────
describe('T4: Single membership — auto-selected, cookie not required', () => {
  it('resolves successfully without calling getActiveCompanyId', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    supabaseMock.profile     = ACTIVE_PROFILE;
    supabaseMock.memberships = ONE_MEMBERSHIP;
    supabaseMock.company     = ACTIVE_COMPANY;
    const result = await getCurrentCompanyContext();
    expect(result.error).toBeNull();
    expect(result.context?.companyId).toBe('co-a');
    // Cookie should NOT be required for single membership
    expect(activeCompanyMock.getActiveCompanyId).not.toHaveBeenCalled();
  });
});

// ─── T5 ───────────────────────────────────────────────────────────────────────
describe('T5: 2+ memberships + no cookie → NEEDS_COMPANY_SELECTION', () => {
  it('returns NEEDS_COMPANY_SELECTION when cookie is null', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    supabaseMock.profile     = ACTIVE_PROFILE;
    supabaseMock.memberships = TWO_MEMBERSHIPS;
    activeCompanyMock.getActiveCompanyId.mockResolvedValue(null);
    const result = await getCurrentCompanyContext();
    expect(result.code).toBe('NEEDS_COMPANY_SELECTION');
    expect((result.error as Response).status).toBe(403);
    expect(activeCompanyMock.getActiveCompanyId).toHaveBeenCalledOnce();
  });
});

// ─── T6 ───────────────────────────────────────────────────────────────────────
describe('T6: 2+ memberships + stale cookie → NEEDS_COMPANY_SELECTION', () => {
  it('returns NEEDS_COMPANY_SELECTION when cookie does not match any membership', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    supabaseMock.profile     = ACTIVE_PROFILE;
    supabaseMock.memberships = TWO_MEMBERSHIPS; // ['co-a', 'co-b']
    activeCompanyMock.getActiveCompanyId.mockResolvedValue('co-other'); // stale
    const result = await getCurrentCompanyContext();
    expect(result.code).toBe('NEEDS_COMPANY_SELECTION');
  });
});

// ─── T7 ───────────────────────────────────────────────────────────────────────
describe('T7: 2+ memberships + valid cookie → resolves to correct company', () => {
  it('resolves to the company matching the cookie value', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    supabaseMock.profile     = ACTIVE_PROFILE;
    supabaseMock.memberships = TWO_MEMBERSHIPS; // ['co-a', 'co-b']
    activeCompanyMock.getActiveCompanyId.mockResolvedValue('co-b'); // valid
    supabaseMock.company     = { data: { id: 'co-b', name: 'חברה ב', settings: {}, is_active: true }, error: null };
    const result = await getCurrentCompanyContext();
    expect(result.error).toBeNull();
    expect(result.context?.companyId).toBe('co-b');
    expect(result.context?.companyRole).toBe('member');
  });
});

// ─── T8 ───────────────────────────────────────────────────────────────────────
describe('T8: Company inactive → 403 INACTIVE_COMPANY', () => {
  it('returns INACTIVE_COMPANY when company query returns null', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    supabaseMock.profile     = ACTIVE_PROFILE;
    supabaseMock.memberships = ONE_MEMBERSHIP;
    supabaseMock.company     = { data: null, error: null }; // company not found / inactive
    const result = await getCurrentCompanyContext();
    expect(result.code).toBe('INACTIVE_COMPANY');
    expect((result.error as Response).status).toBe(403);
  });
});

// ─── T9 ───────────────────────────────────────────────────────────────────────
describe('T9: requireCompanyAdminRole — member role → 403 FORBIDDEN_ROLE', () => {
  it('returns FORBIDDEN_ROLE for company_members.role=member', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    supabaseMock.profile     = ACTIVE_PROFILE;
    supabaseMock.memberships = { data: [{ company_id: 'co-a', role: 'member', is_active: true }], error: null };
    supabaseMock.company     = ACTIVE_COMPANY;
    const result = await requireCompanyAdminRole();
    expect(result.code).toBe('FORBIDDEN_ROLE');
    expect((result.error as Response).status).toBe(403);
  });
});

// ─── T10 ──────────────────────────────────────────────────────────────────────
describe('T10: requireCompanyAdminRole — admin role → ok', () => {
  it('returns ok for company_members.role=admin', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    supabaseMock.profile     = ACTIVE_PROFILE;
    supabaseMock.memberships = { data: [{ company_id: 'co-a', role: 'admin', is_active: true }], error: null };
    supabaseMock.company     = ACTIVE_COMPANY;
    const result = await requireCompanyAdminRole();
    expect(result.error).toBeNull();
    expect(result.context?.companyRole).toBe('admin');
  });
});

// ─── T11 ──────────────────────────────────────────────────────────────────────
describe('T11: requireCompanyAdminRole — owner role → ok', () => {
  it('returns ok for company_members.role=owner', async () => {
    sessionMock.getSession.mockResolvedValueOnce(USER_SESSION);
    supabaseMock.profile     = ACTIVE_PROFILE;
    supabaseMock.memberships = { data: [{ company_id: 'co-a', role: 'owner', is_active: true }], error: null };
    supabaseMock.company     = ACTIVE_COMPANY;
    const result = await requireCompanyAdminRole();
    expect(result.error).toBeNull();
    expect(result.context?.companyRole).toBe('owner');
  });
});

// ─── T12 ──────────────────────────────────────────────────────────────────────
describe('T12: Company admin invariant — profiles.role irrelevant', () => {
  it('profiles.role=user + company_members.role=admin → allowed (invariant)', async () => {
    // The critical property: a company admin (profiles.role='user') must be allowed.
    // requireCompanyAdminRole checks company_members.role ONLY, never profiles.role.
    sessionMock.getSession.mockResolvedValueOnce({
      userId: 'co-admin-only', email: 'ca@test.com', username: 'ca', role: 'user', loginAt: 0,
    });
    supabaseMock.profile     = { data: { is_active: true, role: 'user' }, error: null };
    supabaseMock.memberships = { data: [{ company_id: 'co-a', role: 'admin', is_active: true }], error: null };
    supabaseMock.company     = ACTIVE_COMPANY;
    const result = await requireCompanyAdminRole();
    expect(result.error).toBeNull();
    expect(result.context?.platformRole).toBe('user');  // profiles.role='user'
    expect(result.context?.companyRole).toBe('admin');   // company_members.role='admin'
  });
});
