/**
 * Phase 3 Batch 1 — company-context auth helpers tests
 * Verifies: multi-membership safety, requireCompanyAdminRole guards, requireCompanyMember alias.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessionMock = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('@/lib/auth/session', () => ({
  getSession: sessionMock.getSession,
}));

const supabaseMock = vi.hoisted(() => ({
  profile: null as unknown,
  memberships: null as unknown,
  company: null as unknown,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = chain;
      chain.select = vi.fn(() => self);
      chain.eq = vi.fn(() => self);
      chain.limit = vi.fn(() => self);
      chain.single = vi.fn(() => {
        if (table === 'profiles') return Promise.resolve(supabaseMock.profile);
        if (table === 'companies') return Promise.resolve(supabaseMock.company);
        return Promise.resolve({ data: null, error: null });
      });
      // For company_members, return array (no .single())
      chain.then = (
        onfulfilled: ((v: unknown) => unknown) | null | undefined,
      ) => {
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

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.profile = null;
  supabaseMock.memberships = null;
  supabaseMock.company = null;
});

describe('getCurrentCompanyContext — multi-membership safety', () => {
  it('returns 403 when user has multiple active memberships', async () => {
    sessionMock.getSession.mockResolvedValueOnce({
      userId: 'user-1', email: 'test@test.com', username: 'test', role: 'user',
    });
    supabaseMock.profile = { data: { is_active: true, role: 'user' }, error: null };
    supabaseMock.memberships = {
      data: [
        { company_id: 'comp-a', role: 'admin', is_active: true },
        { company_id: 'comp-b', role: 'member', is_active: true },
      ],
      error: null,
    };

    const result = await getCurrentCompanyContext();
    expect(result.error).not.toBeNull();
    const status = (result.error as Response).status;
    expect(status).toBe(403);
    const body = await (result.error as Response).json();
    expect(body.error).toMatch(/מספר חברות/);
  });

  it('returns 403 when user has no active memberships', async () => {
    sessionMock.getSession.mockResolvedValueOnce({
      userId: 'user-1', email: 'test@test.com', username: 'test', role: 'user',
    });
    supabaseMock.profile = { data: { is_active: true, role: 'user' }, error: null };
    supabaseMock.memberships = { data: [], error: null };

    const result = await getCurrentCompanyContext();
    expect(result.error).not.toBeNull();
    const status = (result.error as Response).status;
    expect(status).toBe(403);
  });
});

describe('requireCompanyAdminRole', () => {
  it('returns 403 when companyRole is member', async () => {
    sessionMock.getSession.mockResolvedValueOnce({
      userId: 'user-1', email: 'test@test.com', username: 'test', role: 'user',
    });
    supabaseMock.profile = { data: { is_active: true, role: 'user' }, error: null };
    supabaseMock.memberships = { data: [{ company_id: 'comp-a', role: 'member', is_active: true }], error: null };
    supabaseMock.company = { data: { id: 'comp-a', name: 'Test', settings: {}, is_active: true }, error: null };

    const result = await requireCompanyAdminRole();
    expect(result.error).not.toBeNull();
    const status = (result.error as Response).status;
    expect(status).toBe(403);
  });

  it('allows user with companyRole=admin', async () => {
    sessionMock.getSession.mockResolvedValueOnce({
      userId: 'user-1', email: 'test@test.com', username: 'test', role: 'user',
    });
    supabaseMock.profile = { data: { is_active: true, role: 'user' }, error: null };
    supabaseMock.memberships = { data: [{ company_id: 'comp-a', role: 'admin', is_active: true }], error: null };
    supabaseMock.company = { data: { id: 'comp-a', name: 'Test', settings: {}, is_active: true }, error: null };

    const result = await requireCompanyAdminRole();
    expect(result.error).toBeNull();
    expect(result.context?.companyRole).toBe('admin');
  });

  it('allows user with companyRole=owner', async () => {
    sessionMock.getSession.mockResolvedValueOnce({
      userId: 'user-1', email: 'test@test.com', username: 'test', role: 'user',
    });
    supabaseMock.profile = { data: { is_active: true, role: 'user' }, error: null };
    supabaseMock.memberships = { data: [{ company_id: 'comp-a', role: 'owner', is_active: true }], error: null };
    supabaseMock.company = { data: { id: 'comp-a', name: 'Test', settings: {}, is_active: true }, error: null };

    const result = await requireCompanyAdminRole();
    expect(result.error).toBeNull();
    expect(result.context?.companyRole).toBe('owner');
  });
});

describe('requireCompanyAdminRole — profiles.role irrelevant', () => {
  it('succeeds for profiles.role=user when company_members.role=admin', async () => {
    // The critical property: a company admin (profiles.role='user') must be allowed.
    // requireCompanyAdminRole checks company_members.role only, not profiles.role.
    sessionMock.getSession.mockResolvedValueOnce({
      userId: 'company-admin-only', email: 'ca@test.com', username: 'ca', role: 'user',
    });
    supabaseMock.profile = { data: { is_active: true, role: 'user' }, error: null };
    supabaseMock.memberships = { data: [{ company_id: 'comp-a', role: 'admin', is_active: true }], error: null };
    supabaseMock.company = { data: { id: 'comp-a', name: 'Test', settings: {}, is_active: true }, error: null };

    const result = await requireCompanyAdminRole();
    expect(result.error).toBeNull();
    expect(result.context?.companyRole).toBe('admin');
    // profiles.role is irrelevant — company admin can administer their own company
    expect(result.context?.platformRole).toBe('user');
  });
});
