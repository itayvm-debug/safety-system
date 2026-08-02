/**
 * F-06 — admin/users company_members creation tests
 * Verifies that user creation:
 *   1. Requires and validates company_id server-side
 *   2. Creates a company_members row after profile creation
 *   3. Performs compensating cleanup when membership insert fails
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const COMPANY_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NEW_USER_ID = 'newusr00-0000-0000-0000-000000000001';

const authMock = vi.hoisted(() => ({ requireAdmin: vi.fn() }));

vi.mock('@/lib/auth/api', () => ({
  requireAdmin: authMock.requireAdmin,
}));

// Track all Supabase operations
const supabaseCalls = vi.hoisted(() => ({
  fromCalls: [] as string[],
  insertCalls: [] as Array<{ table: string; data: Record<string, unknown> }>,
  deleteCalls: [] as Array<{ table: string; eqCalls: Array<[string, unknown]> }>,
  authAdminCreateUser: vi.fn(),
  authAdminDeleteUser: vi.fn(),
  reset() {
    this.fromCalls = [];
    this.insertCalls = [];
    this.deleteCalls = [];
    this.authAdminCreateUser.mockReset();
    this.authAdminDeleteUser.mockReset();
  },
}));

// Per-table insert result (configure per test)
const insertResults = vi.hoisted(() => ({
  data: {} as Record<string, { data: unknown; error: null | { message: string } }>,
  set(table: string, result: { data: unknown; error: null | { message: string } }) {
    this.data[table] = result;
  },
  get(table: string) {
    return this.data[table] ?? { data: null, error: { message: 'not configured' } };
  },
  reset() { this.data = {}; },
}));

// Company lookup result
const companyLookup = vi.hoisted(() => ({
  result: null as unknown,
  reset() { this.result = null; },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    auth: {
      admin: {
        createUser: supabaseCalls.authAdminCreateUser,
        deleteUser: supabaseCalls.authAdminDeleteUser,
      },
    },
    from: (table: string) => {
      supabaseCalls.fromCalls.push(table);
      const eqCalls: Array<[string, unknown]> = [];
      const chain: Record<string, unknown> = {};
      const self = chain;
      chain.select = vi.fn(() => self);
      chain.insert = vi.fn((data: Record<string, unknown>) => {
        supabaseCalls.insertCalls.push({ table, data });
        return self;
      });
      chain.delete = vi.fn(() => {
        supabaseCalls.deleteCalls.push({ table, eqCalls });
        return self;
      });
      chain.eq = vi.fn((k: string, v: unknown) => {
        eqCalls.push([k, v]);
        return self;
      });
      chain.maybeSingle = vi.fn(() => {
        if (table === 'companies') return Promise.resolve({ data: companyLookup.result, error: null });
        return Promise.resolve({ data: null, error: null });
      });
      chain.single = vi.fn(() => Promise.resolve(insertResults.get(table)));
      // Make the chain itself thenable so `await supabase.from(t).insert(...)` resolves
      // with the configured insert result (for queries that don't call .single()).
      chain.then = (
        onfulfilled: ((v: unknown) => unknown) | null | undefined,
        _onrejected?: ((v: unknown) => unknown) | null | undefined,
      ) => Promise.resolve(insertResults.get(table)).then(onfulfilled ?? undefined);
      return chain;
    },
  }),
}));

import { POST } from '../users/route';

function req(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const validBody = {
  full_name: 'Test User',
  username: 'testuser',
  email: 'test@example.com',
  password: 'password123',
  role: 'user',
  company_id: COMPANY_A,
};

beforeEach(() => {
  vi.clearAllMocks();
  supabaseCalls.reset();
  insertResults.reset();
  companyLookup.reset();

  // Default: platform admin authorized
  authMock.requireAdmin.mockResolvedValue({ session: { role: 'admin' }, error: null });
});

describe('F-06 — admin/users company membership creation', () => {
  it('returns 400 when company_id is missing', async () => {
    const bodyWithoutCompany = {
      full_name: validBody.full_name,
      username: validBody.username,
      email: validBody.email,
      password: validBody.password,
      role: validBody.role,
    };
    const res = await POST(req(bodyWithoutCompany));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/company_id/);
  });

  it('returns 400 when company_id does not exist in database', async () => {
    companyLookup.result = null; // company not found

    supabaseCalls.authAdminCreateUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    });

    const res = await POST(req(validBody));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('חברה');
  });

  it('creates company_members row on successful user creation', async () => {
    companyLookup.result = { id: COMPANY_A };

    supabaseCalls.authAdminCreateUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    });
    insertResults.set('profiles', { data: { id: NEW_USER_ID, email: validBody.email }, error: null });
    insertResults.set('company_members', { data: { id: 'cm-1' }, error: null });

    const res = await POST(req(validBody));
    expect(res.status).toBe(201);

    // company_members insert must have been called
    const memberInsert = supabaseCalls.insertCalls.find(c => c.table === 'company_members');
    expect(memberInsert).toBeDefined();
    expect(memberInsert!.data.company_id).toBe(COMPANY_A);
    expect(memberInsert!.data.user_id).toBe(NEW_USER_ID);
    expect(memberInsert!.data.is_active).toBe(true);
  });

  it('maps role=admin to company_members.role=admin', async () => {
    companyLookup.result = { id: COMPANY_A };
    supabaseCalls.authAdminCreateUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    });
    insertResults.set('profiles', { data: { id: NEW_USER_ID }, error: null });
    insertResults.set('company_members', { data: { id: 'cm-1' }, error: null });

    await POST(req({ ...validBody, role: 'admin' }));

    const memberInsert = supabaseCalls.insertCalls.find(c => c.table === 'company_members');
    expect(memberInsert!.data.role).toBe('admin');
  });

  it('maps role=user to company_members.role=member', async () => {
    companyLookup.result = { id: COMPANY_A };
    supabaseCalls.authAdminCreateUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    });
    insertResults.set('profiles', { data: { id: NEW_USER_ID }, error: null });
    insertResults.set('company_members', { data: { id: 'cm-1' }, error: null });

    await POST(req({ ...validBody, role: 'user' }));

    const memberInsert = supabaseCalls.insertCalls.find(c => c.table === 'company_members');
    expect(memberInsert!.data.role).toBe('member');
  });

  it('deletes auth user + profile when company_members insert fails', async () => {
    companyLookup.result = { id: COMPANY_A };
    supabaseCalls.authAdminCreateUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    });
    insertResults.set('profiles', { data: { id: NEW_USER_ID }, error: null });
    insertResults.set('company_members', { data: null, error: { message: 'insert failed' } });

    supabaseCalls.authAdminDeleteUser.mockResolvedValue({ error: null });

    const res = await POST(req(validBody));
    expect(res.status).toBe(500);

    // Auth user must be cleaned up
    expect(supabaseCalls.authAdminDeleteUser).toHaveBeenCalledWith(NEW_USER_ID);
    // Profile delete must be called
    const profileDelete = supabaseCalls.deleteCalls.find(c => c.table === 'profiles');
    expect(profileDelete).toBeDefined();
  });
});
