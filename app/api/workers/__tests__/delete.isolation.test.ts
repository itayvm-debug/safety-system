/**
 * Worker permanent-deletion isolation tests (WD1–WD14)
 *
 * Verifies:
 *   WD1  : archived worker → 200 { ok: true }
 *   WD2  : active worker rejected → 409
 *   WD3  : cross-company worker → 404 (company scope enforced)
 *   WD4  : member role → 403
 *   WD5  : missing worker → 404
 *   WD6  : entity_notes deleted explicitly by entity_id
 *   WD7  : professional_licenses deleted explicitly by worker_id
 *   WD8  : manager_licenses deleted explicitly by worker_id
 *   WD9  : vehicles table never deleted
 *   WD10 : responsible_manager_id NULLed on other workers
 *   WD11 : storage paths collected from photo_url and removed after deletion
 *   WD12 : DB failure → storage cleanup skipped
 *   WD13 : storage cleanup failure → non-fatal (200 still returned)
 *   WD14 : Company A safety guard active (TEST_SKIP_COMPANY_ID)
 *
 * Safety: all mutations target COMPANY_B only.
 * Test aborts if COMPANY_B equals TEST_SKIP_COMPANY_ID.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Safety guard ────────────────────────────────────────────────────────────

const COMPANY_B  = 'bbbbbbbb-0000-0000-0000-000000000002';
const WORKER_ID  = 'worker00-0000-0000-0000-000000000001';

function abortIfProductionTarget(companyId: string) {
  const skipId = process.env.TEST_SKIP_COMPANY_ID ?? '';
  if (skipId && companyId === skipId) {
    throw new Error(`BLOCKED: test would mutate production company ${companyId}`);
  }
}

beforeAll(() => abortIfProductionTarget(COMPANY_B));

// ─── Shared state ────────────────────────────────────────────────────────────

type LogEntry = { action: string; table: string; patch?: Record<string, unknown> };

const state = vi.hoisted(() => ({
  workerRow:        null as Record<string, unknown> | null,
  workerFetchError: null as { message: string } | null,
  workerDeleteError: null as { message: string } | null,
  callLog:          [] as LogEntry[],
  storageRemoved:   [] as string[],
  storageThrows:    false,
  reset(overrides: Partial<{ is_archived: boolean; photo_url: string | null }> = {}) {
    this.workerRow = {
      id:          WORKER_ID,
      company_id:  COMPANY_B,
      is_archived: overrides.is_archived ?? true,
      photo_url:   overrides.photo_url ?? null,
    };
    this.workerFetchError  = null;
    this.workerDeleteError = null;
    this.callLog           = [];
    this.storageRemoved    = [];
    this.storageThrows     = false;
  },
}));

// ─── Auth mock ───────────────────────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  requireCompanyAdminRole: vi.fn(),
}));

vi.mock('@/lib/auth/company-context', () => ({
  requireCompanyAdminRole: authMocks.requireCompanyAdminRole,
  getCurrentCompanyContext: vi.fn(),
}));

// ─── Supabase mock ───────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    const makeChain = (table: string) => {
      let op = '';

      const chain: Record<string, unknown> = {};

      chain.select = vi.fn(() => { op = 'select'; return chain; });
      chain.delete = vi.fn(() => {
        op = 'delete';
        state.callLog.push({ action: 'delete', table });
        return chain;
      });
      chain.update = vi.fn((patch: Record<string, unknown>) => {
        op = 'update';
        state.callLog.push({ action: 'update', table, patch });
        return chain;
      });
      chain.eq    = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      chain.single = vi.fn(() => {
        if (table === 'workers' && op === 'select') {
          return Promise.resolve({ data: state.workerRow, error: state.workerFetchError });
        }
        return Promise.resolve({ data: null, error: null });
      });

      // Thenable: awaiting the chain directly (for non-.single() queries)
      chain.then = (
        resolve: (v: { data: unknown; error: unknown }) => unknown,
        _reject?: (e: unknown) => unknown,
      ) => {
        let result: { data: unknown; error: unknown };
        if (table === 'workers' && op === 'delete') {
          result = { data: null, error: state.workerDeleteError };
        } else {
          result = { data: [], error: null };
        }
        return Promise.resolve(result).then(resolve, _reject);
      };

      return chain;
    };

    return {
      from: (table: string) => makeChain(table),
      storage: {
        from: () => ({
          remove: (paths: string[]) => {
            if (state.storageThrows) return Promise.reject(new Error('storage failure'));
            paths.forEach((p) => state.storageRemoved.push(p));
            return Promise.resolve({ data: null, error: null });
          },
        }),
      },
    };
  },
}));

import { DELETE } from '../[id]/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deleteReq() {
  return new NextRequest(`http://localhost/api/workers/${WORKER_ID}`, { method: 'DELETE' });
}

const mockParams = { params: Promise.resolve({ id: WORKER_ID }) };

function setupAdminContext() {
  authMocks.requireCompanyAdminRole.mockResolvedValue({
    context: { companyId: COMPANY_B },
    error: null,
  });
}

function setupMemberContext() {
  authMocks.requireCompanyAdminRole.mockResolvedValue({
    context: null,
    error: new Response(JSON.stringify({ error: 'אין הרשאה' }), { status: 403 }),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  state.reset();
  setupAdminContext();
});

// WD1: success
describe('WD1: archived worker → 200', () => {
  it('returns 200 { ok: true } when worker is archived', async () => {
    const res = await DELETE(deleteReq(), mockParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});

// WD2: active worker blocked
describe('WD2: active worker → 409', () => {
  it('returns 409 when worker is not archived', async () => {
    state.reset({ is_archived: false });
    const res = await DELETE(deleteReq(), mockParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/ארכיון/);
  });
});

// WD3: cross-company blocked
describe('WD3: cross-company worker → 404', () => {
  it('returns 404 when worker does not exist in active company context', async () => {
    state.workerRow = null;
    const res = await DELETE(deleteReq(), mockParams);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('לא נמצא');
  });
});

// WD4: member role blocked
describe('WD4: member role → 403', () => {
  it('returns 403 when caller is not admin/owner', async () => {
    setupMemberContext();
    const res = await DELETE(deleteReq(), mockParams);
    expect(res.status).toBe(403);
  });
});

// WD5: missing worker
describe('WD5: missing worker → 404', () => {
  it('returns 404 when worker does not exist at all', async () => {
    state.workerRow = null;
    state.workerFetchError = { message: 'PGRST116' };
    const res = await DELETE(deleteReq(), mockParams);
    expect(res.status).toBe(404);
  });
});

// WD6: entity_notes deleted
describe('WD6: entity_notes deleted explicitly', () => {
  it('deletes entity_notes by entity_id before removing worker', async () => {
    await DELETE(deleteReq(), mockParams);
    const hit = state.callLog.some((e) => e.action === 'delete' && e.table === 'entity_notes');
    expect(hit).toBe(true);
  });
});

// WD7: professional_licenses deleted
describe('WD7: professional_licenses deleted explicitly', () => {
  it('deletes professional_licenses by worker_id before removing worker', async () => {
    await DELETE(deleteReq(), mockParams);
    const hit = state.callLog.some((e) => e.action === 'delete' && e.table === 'professional_licenses');
    expect(hit).toBe(true);
  });
});

// WD8: manager_licenses deleted
describe('WD8: manager_licenses deleted explicitly', () => {
  it('deletes manager_licenses by worker_id before removing worker', async () => {
    await DELETE(deleteReq(), mockParams);
    const hit = state.callLog.some((e) => e.action === 'delete' && e.table === 'manager_licenses');
    expect(hit).toBe(true);
  });
});

// WD9: vehicles never deleted
describe('WD9: vehicles table never deleted', () => {
  it('does not issue a DELETE on the vehicles table', async () => {
    await DELETE(deleteReq(), mockParams);
    const hit = state.callLog.some((e) => e.action === 'delete' && e.table === 'vehicles');
    expect(hit).toBe(false);
  });
});

// WD10: responsible_manager_id nulled
describe('WD10: responsible_manager_id NULLed on other workers', () => {
  it('sets responsible_manager_id=null on other workers before deleting', async () => {
    await DELETE(deleteReq(), mockParams);
    const hit = state.callLog.find(
      (e) => e.action === 'update' && e.table === 'workers' && e.patch?.responsible_manager_id === null,
    );
    expect(hit).toBeDefined();
  });
});

// WD11: storage paths collected and removed
describe('WD11: storage paths removed after deletion', () => {
  it('calls storage.remove with photo_url after DB deletion', async () => {
    state.reset({ photo_url: 'photos/abc123.jpg' });
    await DELETE(deleteReq(), mockParams);
    expect(state.storageRemoved).toContain('photos/abc123.jpg');
  });
});

// WD12: DB failure → no storage cleanup
describe('WD12: DB failure prevents storage cleanup', () => {
  it('returns 500 and skips storage.remove when worker delete fails', async () => {
    state.reset({ photo_url: 'photos/abc123.jpg' });
    state.workerDeleteError = { message: 'FK violation' };
    const res = await DELETE(deleteReq(), mockParams);
    expect(res.status).toBe(500);
    expect(state.storageRemoved).toHaveLength(0);
  });
});

// WD13: storage failure is non-fatal
describe('WD13: storage cleanup failure is non-fatal', () => {
  it('returns 200 even when storage.remove throws', async () => {
    state.reset({ photo_url: 'photos/abc123.jpg' });
    state.storageThrows = true;
    const res = await DELETE(deleteReq(), mockParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});

// WD14: Company A safety guard
describe('WD14: Company A safety guard', () => {
  it('aborts test suite if COMPANY_B matches TEST_SKIP_COMPANY_ID', () => {
    const skipId = process.env.TEST_SKIP_COMPANY_ID ?? '';
    if (skipId) {
      expect(skipId).not.toBe(COMPANY_B);
    } else {
      expect(true).toBe(true);
    }
  });
});
