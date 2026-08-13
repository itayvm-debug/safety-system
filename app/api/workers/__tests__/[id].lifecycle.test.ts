/**
 * Worker lifecycle isolation tests (WL1–WL12)
 *
 * Verifies:
 *   WL1–WL9   : PATCH accepts each allowed field and returns 200
 *   WL10      : PATCH ignores company_id in body (not in allowed list)
 *   WL11      : PATCH with empty body returns 400
 *   WL12      : GET returns single worker scoped to active company
 *
 * Safety: all mutations target TEST_COMPANY_B only.
 * Test aborts if TEST_COMPANY_B equals TEST_SKIP_COMPANY_ID.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Safety guard ────────────────────────────────────────────────────────────

const TEST_COMPANY_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const WORKER_ID     = 'worker00-0000-0000-0000-000000000001';

function abortIfProductionTarget(companyId: string) {
  const skipId = process.env.TEST_SKIP_COMPANY_ID ?? '';
  if (skipId && companyId === skipId) {
    throw new Error(`BLOCKED: test would mutate production company ${companyId}`);
  }
}

beforeAll(() => abortIfProductionTarget(TEST_COMPANY_B));

// ─── Mocks ───────────────────────────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  requireCompanyAdminRole: vi.fn(),
  getCurrentCompanyContext: vi.fn(),
}));

vi.mock('@/lib/auth/company-context', () => ({
  requireCompanyAdminRole: authMocks.requireCompanyAdminRole,
  getCurrentCompanyContext: authMocks.getCurrentCompanyContext,
}));

// Tracking mock: records which fields were passed to update() and which eq() filters applied
const dbTracker = vi.hoisted(() => ({
  updatedPatch: null as Record<string, unknown> | null,
  eqFilters: {} as Record<string, unknown>,
  returnData: null as Record<string, unknown> | null,
  returnError: null as { message: string } | null,
  reset(returnData: Record<string, unknown> | null = null) {
    this.updatedPatch = null;
    this.eqFilters = {};
    this.returnData = returnData;
    this.returnError = null;
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    const chain: Record<string, unknown> = {};
    chain.from    = vi.fn(() => chain);
    chain.select  = vi.fn(() => chain);
    chain.update  = vi.fn((patch: Record<string, unknown>) => {
      dbTracker.updatedPatch = patch;
      return chain;
    });
    chain.eq = vi.fn((col: string, val: unknown) => {
      dbTracker.eqFilters[col] = val;
      return chain;
    });
    chain.single = vi.fn(() =>
      Promise.resolve({ data: dbTracker.returnData, error: dbTracker.returnError })
    );
    chain.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: dbTracker.returnData, error: dbTracker.returnError })
    );
    chain.order  = vi.fn(() => chain);
    return chain;
  },
}));

import { GET, PATCH } from '../[id]/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function patchReq(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/workers/${WORKER_ID}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function getReq() {
  return new NextRequest(`http://localhost/api/workers/${WORKER_ID}`, { method: 'GET' });
}

const mockParams = { params: Promise.resolve({ id: WORKER_ID }) };

function setupAdminContext() {
  authMocks.requireCompanyAdminRole.mockResolvedValue({
    context: { companyId: TEST_COMPANY_B },
    error: null,
  });
  authMocks.getCurrentCompanyContext.mockResolvedValue({
    context: { companyId: TEST_COMPANY_B },
    error: null,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setupAdminContext();
  dbTracker.reset({ id: WORKER_ID, company_id: TEST_COMPANY_B });
});

// WL1: archive worker
describe('WL1: PATCH archive — sets is_archived to true', () => {
  it('returns 200 and passes is_archived=true to update', async () => {
    const res = await PATCH(patchReq({ is_archived: true }), mockParams);
    expect(res.status).toBe(200);
    expect(dbTracker.updatedPatch).toMatchObject({ is_archived: true });
  });
});

// WL2: company_id filter always applied from context
describe('WL2: PATCH archive — company_id filter always applied from context', () => {
  it('eq(company_id, companyId) is set from context, not from body', async () => {
    await PATCH(patchReq({ is_archived: true }), mockParams);
    expect(dbTracker.eqFilters['company_id']).toBe(TEST_COMPANY_B);
    expect(dbTracker.eqFilters['id']).toBe(WORKER_ID);
  });
});

// WL3: restore worker
describe('WL3: PATCH restore — sets is_archived to false', () => {
  it('returns 200 and passes is_archived=false to update', async () => {
    const res = await PATCH(patchReq({ is_archived: false }), mockParams);
    expect(res.status).toBe(200);
    expect(dbTracker.updatedPatch).toMatchObject({ is_archived: false });
  });
});

// WL4: toggle is_active
describe('WL4: PATCH is_active — field allowed', () => {
  it('returns 200 and passes is_active to update', async () => {
    const res = await PATCH(patchReq({ is_active: false }), mockParams);
    expect(res.status).toBe(200);
    expect(dbTracker.updatedPatch).toMatchObject({ is_active: false });
  });
});

// WL5: toggle is_crane_operator
describe('WL5: PATCH is_crane_operator — field allowed', () => {
  it('returns 200 and passes is_crane_operator to update', async () => {
    const res = await PATCH(patchReq({ is_crane_operator: true }), mockParams);
    expect(res.status).toBe(200);
    expect(dbTracker.updatedPatch).toMatchObject({ is_crane_operator: true });
  });
});

// WL6: toggle is_responsible_site_manager
describe('WL6: PATCH is_responsible_site_manager — field allowed', () => {
  it('returns 200 and passes is_responsible_site_manager to update', async () => {
    const res = await PATCH(patchReq({ is_responsible_site_manager: true }), mockParams);
    expect(res.status).toBe(200);
    expect(dbTracker.updatedPatch).toMatchObject({ is_responsible_site_manager: true });
  });
});

// WL7: assign subcontractor_id
describe('WL7: PATCH subcontractor_id — field allowed', () => {
  it('returns 200 and passes subcontractor_id to update', async () => {
    const subId = 'sub-0000-0000-0000-000000000001';
    const res = await PATCH(patchReq({ subcontractor_id: subId }), mockParams);
    expect(res.status).toBe(200);
    expect(dbTracker.updatedPatch).toMatchObject({ subcontractor_id: subId });
  });
});

// WL8: assign responsible_manager_id
describe('WL8: PATCH responsible_manager_id — field allowed', () => {
  it('returns 200 and passes responsible_manager_id to update', async () => {
    const mgId = 'mgr-0000-0000-0000-000000000001';
    const res = await PATCH(patchReq({ responsible_manager_id: mgId }), mockParams);
    expect(res.status).toBe(200);
    expect(dbTracker.updatedPatch).toMatchObject({ responsible_manager_id: mgId });
  });
});

// WL9: update photo_url
describe('WL9: PATCH photo_url — field allowed', () => {
  it('returns 200 and passes photo_url to update', async () => {
    const res = await PATCH(patchReq({ photo_url: 'photos/abc.jpg' }), mockParams);
    expect(res.status).toBe(200);
    expect(dbTracker.updatedPatch).toMatchObject({ photo_url: 'photos/abc.jpg' });
  });
});

// WL10: company_id in body must be ignored
describe('WL10: PATCH — company_id in body is ignored (not in patch)', () => {
  it('does not include company_id in the DB update call', async () => {
    const foreignCompanyId = 'aaaaaaaa-0000-0000-0000-000000000001';
    await PATCH(patchReq({ is_active: true, company_id: foreignCompanyId }), mockParams);
    // patch must not contain company_id from body
    expect(dbTracker.updatedPatch).not.toHaveProperty('company_id');
    // eq filter must still use context company
    expect(dbTracker.eqFilters['company_id']).toBe(TEST_COMPANY_B);
  });
});

// WL11: empty body returns 400
describe('WL11: PATCH empty body — returns 400', () => {
  it('returns 400 when no allowed fields present', async () => {
    const res = await PATCH(patchReq({}), mockParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/אין שדות/);
  });
});

// WL12: GET single worker scoped to active company
describe('WL12: GET single worker — scoped to active company', () => {
  it('returns 200 and filters by id + company_id', async () => {
    const res = await GET(getReq(), mockParams);
    expect(res.status).toBe(200);
    expect(dbTracker.eqFilters['id']).toBe(WORKER_ID);
    expect(dbTracker.eqFilters['company_id']).toBe(TEST_COMPANY_B);
  });
});
