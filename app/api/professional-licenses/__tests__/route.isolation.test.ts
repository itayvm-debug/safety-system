/**
 * F-03 — professional-licenses TOCTOU hardening
 * Verifies that PATCH and DELETE mutations include worker_id in the WHERE clause,
 * and that cross-tenant operations (wrong company's worker) are blocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const COMPANY_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const WORKER_A  = 'wa000000-0000-0000-0000-000000000001';
const WORKER_B  = 'wb000000-0000-0000-0000-000000000001';
const LIC_ID    = 'pl000000-0000-0000-0000-000000000001';

const authMock = vi.hoisted(() => ({ requireCompanyAdmin: vi.fn() }));

vi.mock('@/lib/auth/company-context', () => ({
  requireCompanyAdmin: authMock.requireCompanyAdmin,
}));

// Sequential queue mock: each terminal call (.maybeSingle / .single) pops from queue.
// Call order for PATCH:
//   [0] professional_licenses select (returns { worker_id })
//   [1] workers select (ownership check — returns worker or null)
//   [2] professional_licenses update (returns updated record)
// Call order for DELETE:
//   [0] professional_licenses select (returns { worker_id })
//   [1] workers select
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

describe('F-03 — professional-licenses cross-tenant mutation hardening', () => {
  it('PATCH: worker from Company B blocks Company A from updating license', async () => {
    authMock.requireCompanyAdmin.mockResolvedValueOnce({
      context: { companyId: COMPANY_A, userId: 'user-a' },
      error: null,
    });
    // License exists with WORKER_B; worker ownership check fails (worker not in COMPANY_A)
    dbState.reset([
      { data: { worker_id: WORKER_B }, error: null }, // license fetch
      { data: null, error: null },                    // worker ownership check → null (WORKER_B not in COMPANY_A)
    ]);

    const req = new NextRequest(`http://localhost/api/professional-licenses/${LIC_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ license_type: 'forklift' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: LIC_ID }) });
    expect(res.status).toBe(404);
  });

  it('PATCH: Company A can update its own worker license; worker_id is in WHERE clause', async () => {
    authMock.requireCompanyAdmin.mockResolvedValueOnce({
      context: { companyId: COMPANY_A, userId: 'user-a' },
      error: null,
    });
    dbState.reset([
      { data: { worker_id: WORKER_A }, error: null },                  // license fetch
      { data: { id: WORKER_A }, error: null },                         // worker ownership passes
      { data: { id: LIC_ID, worker_id: WORKER_A }, error: null },      // update returns record
    ]);

    const req = new NextRequest(`http://localhost/api/professional-licenses/${LIC_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ license_type: 'forklift' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: LIC_ID }) });
    expect(res.status).toBe(200);

    // worker_id must appear in mutation eq() call
    const workerIdFilters = dbState.eqCalls.filter(([k]) => k === 'worker_id');
    expect(workerIdFilters.length).toBeGreaterThanOrEqual(1);
    // The mutation's worker_id value must match the license's worker_id
    expect(workerIdFilters.some(([, v]) => v === WORKER_A)).toBe(true);
  });

  it('DELETE: worker from Company B blocks Company A from deleting license', async () => {
    authMock.requireCompanyAdmin.mockResolvedValueOnce({
      context: { companyId: COMPANY_A, userId: 'user-a' },
      error: null,
    });
    dbState.reset([
      { data: { worker_id: WORKER_B }, error: null },
      { data: null, error: null },
    ]);

    const req = new NextRequest(`http://localhost/api/professional-licenses/${LIC_ID}`, {
      method: 'DELETE',
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: LIC_ID }) });
    expect(res.status).toBe(404);
  });

  it('DELETE: Company A can delete its own worker license; worker_id is in WHERE clause', async () => {
    authMock.requireCompanyAdmin.mockResolvedValueOnce({
      context: { companyId: COMPANY_A, userId: 'user-a' },
      error: null,
    });
    dbState.reset([
      { data: { worker_id: WORKER_A }, error: null },
      { data: { id: WORKER_A }, error: null },
    ]);

    const req = new NextRequest(`http://localhost/api/professional-licenses/${LIC_ID}`, {
      method: 'DELETE',
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: LIC_ID }) });
    expect(res.status).toBe(200);

    const workerIdFilters = dbState.eqCalls.filter(([k]) => k === 'worker_id');
    expect(workerIdFilters.length).toBeGreaterThanOrEqual(1);
    expect(workerIdFilters.some(([, v]) => v === WORKER_A)).toBe(true);
  });
});
