/**
 * Phase 3 Batch 1 — /api/admin/companies route isolation tests
 * Verifies platform-admin auth boundary, company creation, and slug uniqueness.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const authMock = vi.hoisted(() => ({ requireAdmin: vi.fn() }));

vi.mock('@/lib/auth/api', () => ({
  requireAdmin: authMock.requireAdmin,
}));

const dbState = vi.hoisted(() => ({
  companiesRows: [] as unknown[],
  slugExists: false,
  insertResult: null as unknown,
  reset() {
    this.companiesRows = [];
    this.slugExists = false;
    this.insertResult = null;
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = chain;
      let _isSlugCheck = false;
      let _isInsert = false;

      chain.select = vi.fn(() => self);
      chain.order = vi.fn(() => self);
      chain.eq = vi.fn((k: string) => {
        if (table === 'companies' && k === 'slug') _isSlugCheck = true;
        return self;
      });
      chain.maybeSingle = vi.fn(() => {
        if (_isSlugCheck) {
          return Promise.resolve({ data: dbState.slugExists ? { id: 'existing-id' } : null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });
      chain.insert = vi.fn(() => { _isInsert = true; return self; });
      chain.single = vi.fn(() => {
        if (_isInsert) {
          return Promise.resolve(dbState.insertResult ?? { data: null, error: { message: 'error' } });
        }
        return Promise.resolve({ data: null, error: null });
      });
      chain.then = (
        onfulfilled: ((v: unknown) => unknown) | null | undefined,
      ) => Promise.resolve({ data: dbState.companiesRows, error: null }).then(onfulfilled ?? undefined);
      return chain;
    },
  }),
}));

import { GET, POST } from '../route';

function req(method: string, body?: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/companies', {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.reset();
  authMock.requireAdmin.mockResolvedValue({ session: { role: 'admin' }, error: null });
});

describe('GET /api/admin/companies', () => {
  it('returns 401 when not authenticated', async () => {
    authMock.requireAdmin.mockResolvedValueOnce({
      session: null,
      error: new Response(JSON.stringify({ error: 'לא מורשה' }), { status: 401 }),
    });
    dbState.companiesRows = [];
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns companies list for platform admin', async () => {
    dbState.companiesRows = [
      { id: 'c1', name: 'חברה א', slug: 'company-a', is_active: true },
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe('POST /api/admin/companies', () => {
  it('returns 400 when name is missing', async () => {
    const res = await POST(req('POST', { slug: 'co' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name/);
  });

  it('returns 400 when slug is missing', async () => {
    const res = await POST(req('POST', { name: 'חברה חדשה' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/slug/);
  });

  it('returns 400 when slug contains invalid characters', async () => {
    const res = await POST(req('POST', { name: 'חברה', slug: 'חברה עברית' }));
    expect(res.status).toBe(400);
  });

  it('returns 409 when slug already exists', async () => {
    dbState.slugExists = true;
    const res = await POST(req('POST', { name: 'חברה', slug: 'existing-slug' }));
    expect(res.status).toBe(409);
  });

  it('returns 400 when creating active company without first_admin_user_id', async () => {
    const res = await POST(req('POST', { name: 'חברה חדשה', slug: 'new-company' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/מנהל ראשון/);
  });

  it('returns 201 when creating draft company (is_active: false) without first_admin_user_id', async () => {
    dbState.slugExists = false;
    dbState.insertResult = {
      data: { id: 'new-id', name: 'חברה חדשה', slug: 'new-company', is_active: false },
      error: null,
    };
    const res = await POST(req('POST', { name: 'חברה חדשה', slug: 'new-company', is_active: false }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toBe('new-company');
    expect(body.is_active).toBe(false);
  });
});
