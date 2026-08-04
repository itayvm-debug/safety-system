/**
 * Phase 3 Batch 1 — /api/companies/settings isolation tests
 * Verifies: company-admin-role auth boundary, GET returns settings, PATCH validates + merges.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const COMPANY_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const authMock = vi.hoisted(() => ({ requireCompanyAdminRole: vi.fn() }));

vi.mock('@/lib/auth/company-context', () => ({
  requireCompanyAdminRole: authMock.requireCompanyAdminRole,
}));

const dbState = vi.hoisted(() => ({
  settingsData: null as unknown,
  updateResult: null as unknown,
  reset() {
    this.settingsData = null;
    this.updateResult = null;
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = chain;
      let _isUpdate = false;
      chain.select = vi.fn(() => self);
      chain.update = vi.fn(() => { _isUpdate = true; return self; });
      chain.eq = vi.fn(() => self);
      chain.single = vi.fn(() => {
        if (_isUpdate) {
          return Promise.resolve(dbState.updateResult ?? { data: null, error: { message: 'error' } });
        }
        return Promise.resolve(dbState.settingsData ?? { data: null, error: null });
      });
      return chain;
    },
  }),
}));

import { GET, PATCH } from '../settings/route';

function req(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/companies/settings', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.reset();
  authMock.requireCompanyAdminRole.mockResolvedValue({
    context: { companyId: COMPANY_A, userId: 'user-a', companyRole: 'admin' },
    error: null,
  });
});

describe('GET /api/companies/settings', () => {
  it('returns 403 when user is not company admin', async () => {
    authMock.requireCompanyAdminRole.mockResolvedValueOnce({
      context: null,
      error: new Response(JSON.stringify({ error: 'אין הרשאה' }), { status: 403 }),
    });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns resolved settings for company admin', async () => {
    dbState.settingsData = { data: { settings: {} }, error: null };
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('branding');
    expect(body).toHaveProperty('features');
    expect(body).toHaveProperty('ui');
  });

  it('returns 404 when company not found', async () => {
    dbState.settingsData = { data: null, error: null };
    const res = await GET();
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/companies/settings', () => {
  it('returns 403 when not company admin', async () => {
    authMock.requireCompanyAdminRole.mockResolvedValueOnce({
      context: null,
      error: new Response(JSON.stringify({ error: 'אין הרשאה' }), { status: 403 }),
    });
    const res = await PATCH(req({ branding: { primaryColor: '#ff0000' } }));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid settings shape', async () => {
    // dashboardVariant is an enum in CompanyUiSchema — invalid value fails Zod
    const res = await PATCH(req({ ui: { dashboardVariant: 'not-a-valid-variant' } }));
    expect(res.status).toBe(400);
  });

  it('updates settings and returns resolved settings', async () => {
    dbState.settingsData = { data: { settings: {} }, error: null };
    dbState.updateResult = {
      data: { settings: { branding: { primaryColor: '#ff0000' } } },
      error: null,
    };
    const res = await PATCH(req({ branding: { primaryColor: '#ff0000' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('branding');
  });
});
