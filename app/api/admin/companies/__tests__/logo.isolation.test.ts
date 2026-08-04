/**
 * Phase 3 Batch 1 — Logo Column & Activation Invariant
 *
 * L1: POST with logo_url stores it in returned company
 * L2: POST without logo_url → logo_url: null
 * L3: PATCH with logo_url updates the column
 * L4: Activation invariant — company returned from POST is_active=true
 * L5: Compensating cleanup — company deleted when member insert fails
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Fixture IDs ─────────────────────────────────────────────────────────────

const COMPANY_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const LOGO_URL   = 'https://cdn.example.com/company-logos/1234-abc.png';

// ─── Auth mock ───────────────────────────────────────────────────────────────

const requireAdminMock = vi.hoisted(() => ({ requireAdmin: vi.fn() }));

vi.mock('@/lib/auth/api', () => ({
  requireAdmin: requireAdminMock.requireAdmin,
}));

// ─── DB queue mock ───────────────────────────────────────────────────────────

const dbQueue = vi.hoisted(() => ({
  queue: [] as Array<{ data: unknown; error: unknown }>,
  reset(q: Array<{ data: unknown; error: unknown }> = []) { this.queue = [...q]; },
  next() { return this.queue.shift() ?? { data: null, error: null }; },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = chain;
      chain.select = vi.fn(() => self);
      chain.insert = vi.fn(() => self);
      chain.update = vi.fn(() => self);
      chain.delete = vi.fn(() => self);
      chain.eq     = vi.fn(() => self);
      chain.order  = vi.fn(() => self);
      chain.maybeSingle = vi.fn(() => Promise.resolve(dbQueue.next()));
      chain.single       = vi.fn(() => Promise.resolve(dbQueue.next()));
      chain.then = (onfulfilled: ((v: unknown) => unknown) | null | undefined) =>
        Promise.resolve(dbQueue.next()).then(onfulfilled ?? undefined);
      return chain;
    },
  }),
}));

// ─── Route imports ────────────────────────────────────────────────────────────

import { POST as adminPost } from '../route';
import { PATCH as adminPatch } from '../[id]/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const platformAdminOk = {
  session: { userId: 'platform-admin', role: 'admin' as const, email: 'a@test.com', username: 'admin' },
  error: null,
};

function postReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/companies', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function patchReq(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/admin/companies/${COMPANY_ID}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const paramsId = { params: Promise.resolve({ id: COMPANY_ID }) };

// Full 4-step queue helper for successful creation
function successQueue(companyName = 'Logo Co', slug = 'logo-co', logoUrl?: string) {
  return [
    { data: null, error: null },
    { data: { id: COMPANY_ID, name: companyName, slug, logo_url: logoUrl ?? null, is_active: false }, error: null },
    { data: { id: 'mem-1', company_id: COMPANY_ID, user_id: 'platform-admin', role: 'owner' }, error: null },
    { data: { id: COMPANY_ID, name: companyName, slug, logo_url: logoUrl ?? null, is_active: true }, error: null },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  dbQueue.reset();
  requireAdminMock.requireAdmin.mockResolvedValue(platformAdminOk);
});

// ─── L1: POST with logo_url stores it ────────────────────────────────────────

describe('L1: POST with logo_url stores it in returned company', () => {
  it('logo_url appears in 201 response body', async () => {
    dbQueue.reset(successQueue('Logo Co', 'logo-co', LOGO_URL));

    const res = await adminPost(postReq({ name: 'Logo Co', slug: 'logo-co', logo_url: LOGO_URL }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.logo_url).toBe(LOGO_URL);
  });
});

// ─── L2: POST without logo_url → null ────────────────────────────────────────

describe('L2: POST without logo_url → logo_url: null', () => {
  it('logo_url is null when not provided', async () => {
    dbQueue.reset(successQueue('No Logo', 'no-logo'));

    const res = await adminPost(postReq({ name: 'No Logo', slug: 'no-logo' }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.logo_url).toBeNull();
  });
});

// ─── L3: PATCH with logo_url updates the column ──────────────────────────────

describe('L3: PATCH with logo_url updates the dedicated column', () => {
  it('logo_url appears in PATCH 200 response', async () => {
    dbQueue.reset([
      { data: { id: COMPANY_ID, name: 'Co', slug: 'co', logo_url: LOGO_URL, is_active: true }, error: null },
    ]);

    const res = await adminPatch(patchReq({ logo_url: LOGO_URL }), paramsId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logo_url).toBe(LOGO_URL);
  });
});

// ─── L4: Activation invariant ────────────────────────────────────────────────

describe('L4: Activation invariant — company activated only after membership succeeds', () => {
  it('POST returns is_active=true after all 4 steps (no profile lookup needed)', async () => {
    // Steps: slug check → insert inactive → member insert (auto-owner) → activate
    dbQueue.reset([
      { data: null,                                                                    error: null },
      { data: { id: COMPANY_ID, name: 'Act Co', slug: 'act-co', is_active: false },   error: null },
      { data: { id: 'mem-1', company_id: COMPANY_ID, user_id: 'platform-admin', role: 'owner' }, error: null },
      { data: { id: COMPANY_ID, name: 'Act Co', slug: 'act-co', is_active: true },    error: null },
    ]);

    const res = await adminPost(postReq({ name: 'Act Co', slug: 'act-co' }));

    expect(res.status).toBe(201);
    const body = await res.json();
    // Must be true — activation step was reached (membership exists)
    expect(body.is_active).toBe(true);
    // All 4 queue items consumed
    expect(dbQueue.queue.length).toBe(0);
  });
});

// ─── L5: Compensating cleanup on member insert failure ───────────────────────

describe('L5: Compensating cleanup — company deleted when member insert fails', () => {
  it('returns 500 and company is deleted when member insert fails', async () => {
    // Steps: slug check → insert inactive → member insert (fail) → compensating delete
    dbQueue.reset([
      { data: null,                                                                    error: null },
      { data: { id: COMPANY_ID, name: 'Fail Co', slug: 'fail-co', is_active: false }, error: null },
      { data: null, error: { message: 'duplicate key', code: '23505' } },
      { data: null,                                                                    error: null },
    ]);

    const res = await adminPost(postReq({ name: 'Fail Co', slug: 'fail-co' }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/בעלים/);
    // All 4 queue items consumed: company not left orphaned
    expect(dbQueue.queue.length).toBe(0);
  });
});
