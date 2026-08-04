/**
 * F-03 — manager-licenses TOCTOU hardening
 * Verifies that PATCH and DELETE mutations include worker_id in the WHERE clause,
 * and that cross-tenant operations (wrong company's worker) are blocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const COMPANY_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const WORKER_A  = 'wa000000-0000-0000-0000-000000000001';
const WORKER_B  = 'wb000000-0000-0000-0000-000000000001';
const LIC_ID    = 'ml000000-0000-0000-0000-000000000001';

const authMock = vi.hoisted(() => ({ requireCompanyAdminRole: vi.fn() }));

vi.mock('@/lib/auth/company-context', () => ({
  requireCompanyAdminRole: authMock.requireCompanyAdminRole,
}));

const dbState = vi.hoisted(() => ({
  queue: [] as Array<{ data: unknown; error: null | { message: string } }>,
  eqCalls: [] as Array<[string, unknown]>,
  reset(q: Array<{ data: unknown; error: null | { message: string } }>) {
    this.queue = q;
    this.eqCalls = [];
  },
  next() { return this.queue.shift() ?? { data: null, error: null }; },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = chain;
      chain.select = vi.fn(() => self);
      chain.update = vi.fn(() => self);
      chain.delete = vi.fn(() => self);
      chain.eq = vi.fn((k: string, v: unknown) => { dbState.eqCalls.push([k, v]); return self; });
      chain.maybeSingle = vi.fn(() => Promise.resolve(dbState.next()));
      chain.single = vi.fn(() => Promise.resolve(dbState.next()));
      return chain;
    },
  }),
}));

import { PATCH, DELETE } from '../[id]/route';

beforeEach(() => {
  vi.clearAllMocks();
  dbState.reset([]);
});

describe('F-03 — manager-licenses cross-tenant mutation hardening', () => {
  it('PATCH: worker from Company B blocks Company A from updating manager license', async () => {
    authMock.requireCompanyAdminRole.mockResolvedValueOnce({
      context: { companyId: COMPANY_A, userId: 'user-a' },
      error: null,
    });
    dbState.reset([
      { data: { worker_id: WORKER_B }, error: null },
      { data: null, error: null },
    ]);

    const req = new NextRequest(`http://localhost/api/manager-licenses/${LIC_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ license_type: 'crane' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: LIC_ID }) });
    expect(res.status).toBe(404);
  });

  it('PATCH: Company A can update its own manager license; worker_id is in WHERE clause', async () => {
    authMock.requireCompanyAdminRole.mockResolvedValueOnce({
      context: { companyId: COMPANY_A, userId: 'user-a' },
      error: null,
    });
    dbState.reset([
      { data: { worker_id: WORKER_A }, error: null },
      { data: { id: WORKER_A }, error: null },
      { data: { id: LIC_ID, worker_id: WORKER_A }, error: null },
    ]);

    const req = new NextRequest(`http://localhost/api/manager-licenses/${LIC_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ license_type: 'crane' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: LIC_ID }) });
    expect(res.status).toBe(200);

    const workerIdFilters = dbState.eqCalls.filter(([k]) => k === 'worker_id');
    expect(workerIdFilters.length).toBeGreaterThanOrEqual(1);
    expect(workerIdFilters.some(([, v]) => v === WORKER_A)).toBe(true);
  });

  it('DELETE: worker from Company B blocks Company A from deleting manager license', async () => {
    authMock.requireCompanyAdminRole.mockResolvedValueOnce({
      context: { companyId: COMPANY_A, userId: 'user-a' },
      error: null,
    });
    dbState.reset([
      { data: { worker_id: WORKER_B }, error: null },
      { data: null, error: null },
    ]);

    const req = new NextRequest(`http://localhost/api/manager-licenses/${LIC_ID}`, {
      method: 'DELETE',
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: LIC_ID }) });
    expect(res.status).toBe(404);
  });

  it('DELETE: Company A can delete its own manager license; worker_id is in WHERE clause', async () => {
    authMock.requireCompanyAdminRole.mockResolvedValueOnce({
      context: { companyId: COMPANY_A, userId: 'user-a' },
      error: null,
    });
    dbState.reset([
      { data: { worker_id: WORKER_A }, error: null },
      { data: { id: WORKER_A }, error: null },
    ]);

    const req = new NextRequest(`http://localhost/api/manager-licenses/${LIC_ID}`, {
      method: 'DELETE',
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: LIC_ID }) });
    expect(res.status).toBe(200);

    const workerIdFilters = dbState.eqCalls.filter(([k]) => k === 'worker_id');
    expect(workerIdFilters.length).toBeGreaterThanOrEqual(1);
    expect(workerIdFilters.some(([, v]) => v === WORKER_A)).toBe(true);
  });
});
