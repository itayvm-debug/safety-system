/**
 * F-02 — vehicle-insurances TOCTOU hardening
 * Verifies that PATCH and DELETE mutations include company_id in the WHERE clause,
 * and that cross-tenant operations are blocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const COMPANY_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COMPANY_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const INS_ID = 'ins00000-0000-0000-0000-000000000001';

const authMock = vi.hoisted(() => ({ requireCompanyAdmin: vi.fn() }));

vi.mock('@/lib/auth/company-context', () => ({
  requireCompanyAdmin: authMock.requireCompanyAdmin,
}));

const dbState = vi.hoisted(() => ({
  queue: [] as Array<{ data: unknown; error: null | { message: string } }>,
  eqCalls: [] as Array<[string, unknown]>,
  reset(q: Array<{ data: unknown; error: null | { message: string } }>) {
    this.queue = q;
    this.eqCalls = [];
  },
  next() {
    return this.queue.shift() ?? { data: null, error: null };
  },
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

describe('F-02 — vehicle-insurances cross-tenant mutation hardening', () => {
  it('PATCH: Company B cannot update Company A insurance', async () => {
    authMock.requireCompanyAdmin.mockResolvedValueOnce({
      context: { companyId: COMPANY_B, userId: 'user-b' },
      error: null,
    });
    dbState.reset([{ data: null, error: null }]);

    const req = new NextRequest(`http://localhost/api/vehicle-insurances/${INS_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ file_url: 'evil.pdf' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: INS_ID }) });
    expect(res.status).toBe(404);
  });

  it('PATCH: Company A can update its own insurance; company_id is in WHERE clause twice', async () => {
    authMock.requireCompanyAdmin.mockResolvedValueOnce({
      context: { companyId: COMPANY_A, userId: 'user-a' },
      error: null,
    });
    dbState.reset([
      { data: { id: INS_ID }, error: null },
      { data: { id: INS_ID, file_url: 'new.pdf' }, error: null },
    ]);

    const req = new NextRequest(`http://localhost/api/vehicle-insurances/${INS_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ file_url: 'new.pdf' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: INS_ID }) });
    expect(res.status).toBe(200);

    const companyIdFilters = dbState.eqCalls.filter(([k]) => k === 'company_id');
    expect(companyIdFilters.length).toBeGreaterThanOrEqual(2);
  });

  it('DELETE: Company B cannot delete Company A insurance', async () => {
    authMock.requireCompanyAdmin.mockResolvedValueOnce({
      context: { companyId: COMPANY_B, userId: 'user-b' },
      error: null,
    });
    dbState.reset([{ data: null, error: null }]);

    const req = new NextRequest(`http://localhost/api/vehicle-insurances/${INS_ID}`, {
      method: 'DELETE',
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: INS_ID }) });
    expect(res.status).toBe(404);
  });

  it('DELETE: Company A can delete its own insurance; company_id is in WHERE clause twice', async () => {
    authMock.requireCompanyAdmin.mockResolvedValueOnce({
      context: { companyId: COMPANY_A, userId: 'user-a' },
      error: null,
    });
    dbState.reset([{ data: { id: INS_ID }, error: null }]);

    const req = new NextRequest(`http://localhost/api/vehicle-insurances/${INS_ID}`, {
      method: 'DELETE',
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: INS_ID }) });
    expect(res.status).toBe(200);

    const companyIdFilters = dbState.eqCalls.filter(([k]) => k === 'company_id');
    expect(companyIdFilters.length).toBeGreaterThanOrEqual(2);
  });
});
