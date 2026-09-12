/**
 * Regression tests for PATCH /api/admin/companies/:id — feature-flag save.
 *
 * Bug: SettingsClient previously sent { features: {...} } without the
 * `settings` wrapper; the route returned 400 "לא נשלח שום שדה לעדכון"
 * because the `updates` map was empty and `incomingSettings` was null.
 *
 * These tests verify the correct behaviour BOTH for the fixed code and for
 * the broken old payload shape (must fail with 400, just as the route specifies).
 *
 * The tests use the SAME payload shape that SettingsClient.saveFeatures() sends:
 *   PATCH /api/admin/companies/:id
 *   Body: { settings: { features: { ...featuresDraft } } }
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mock auth ────────────────────────────────────────────────────────────────
// vi.mock is hoisted — use vi.hoisted() so the value is available at hoist time
const { mockAdminSession } = vi.hoisted(() => ({
  mockAdminSession: {
    userId:   'test-admin-user-id',
    email:    'admin@test.local',
    username: 'admin',
    role:     'admin' as const,
    loginAt:  0,
  },
}));

vi.mock('@/lib/auth/api', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ session: mockAdminSession, error: null }),
}));

// ── Mock Supabase service client ─────────────────────────────────────────────
// Returns a minimal chainable mock sufficient for the PATCH branch.
function makeMockSupabase(currentSettings: Record<string, unknown> = {}, updatedCompany?: Record<string, unknown>) {
  const selectChain = {
    eq:     vi.fn().mockReturnThis() as ReturnType<typeof vi.fn>,
    single: vi.fn().mockResolvedValue({
      data: { settings: currentSettings },
      error: null,
    }),
  };
  selectChain.eq.mockReturnValue(selectChain);

  const updateChain = {
    eq:     vi.fn().mockReturnThis() as ReturnType<typeof vi.fn>,
    select: vi.fn().mockReturnThis() as ReturnType<typeof vi.fn>,
    single: vi.fn().mockResolvedValue({
      data: updatedCompany ?? { id: 'c1', settings: currentSettings },
      error: null,
    }),
  };
  updateChain.eq.mockReturnValue(updateChain);
  updateChain.select.mockReturnValue(updateChain);

  return {
    from: vi.fn((table: string) => {
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnValue(selectChain),
          update: vi.fn().mockReturnValue(updateChain),
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) };
    }),
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(),
}));

// ── Import after mocks ────────────────────────────────────────────────────────
import { PATCH } from '../route';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/api';

const COMPANY_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/admin/companies/${COMPANY_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams() {
  return { params: Promise.resolve({ id: COMPANY_ID }) };
}

describe('PATCH /api/admin/companies/:id — feature flag save', () => {

  beforeEach(() => {
    vi.mocked(createServiceClient).mockReturnValue(makeMockSupabase(
      // existing DB settings with some branding
      {
        branding: { primaryColor: '#f97316', secondaryColor: '#3b82f6', accentColor: '#10b981' },
        features: { workers: true, employeeReviews: false },
      },
      // updated company row returned after update
      {
        id: COMPANY_ID,
        settings: {
          branding: { primaryColor: '#f97316', secondaryColor: '#3b82f6', accentColor: '#10b981' },
          features: { workers: true, employeeReviews: true },
        },
      },
    ) as unknown as ReturnType<typeof createServiceClient>);
  });

  // ── 1. Correct payload shape: { settings: { features: {...} } } → 200 ───────
  it('1. features-only update accepted — { settings: { features } } returns 200', async () => {
    const res = await PATCH(makeRequest({ settings: { features: { employeeReviews: true } } }), makeParams());
    expect(res.status).toBe(200);
  });

  // ── 2. OLD broken shape: { features: {...} } WITHOUT settings wrapper → 400 ─
  it('2. old shape { features: {...} } WITHOUT settings wrapper returns 400', async () => {
    const res = await PATCH(makeRequest({ features: { employeeReviews: true } }), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toBe('לא נשלח שום שדה לעדכון');
  });

  // ── 3. Empty body → 400 ───────────────────────────────────────────────────
  it('3. empty body returns 400', async () => {
    const res = await PATCH(makeRequest({}), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toBe('לא נשלח שום שדה לעדכון');
  });

  // ── 4. employeeReviews true persists in DB ────────────────────────────────
  it('4. employeeReviews=true is forwarded to DB update', async () => {
    let capturedUpdate: Record<string, unknown> | undefined;
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'companies') {
          const selectChain = {
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { settings: { features: { employeeReviews: false } } },
              error: null,
            }),
          };
          selectChain.eq.mockReturnValue(selectChain);

          const updateChain = {
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: COMPANY_ID, settings: { features: { employeeReviews: true } } },
              error: null,
            }),
          };
          updateChain.eq.mockReturnValue(updateChain);
          updateChain.select.mockReturnValue(updateChain);

          return {
            select: vi.fn().mockReturnValue(selectChain),
            update: vi.fn((u: Record<string, unknown>) => { capturedUpdate = u; return updateChain; }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) };
      }),
    } as unknown as ReturnType<typeof createServiceClient>);

    const res = await PATCH(makeRequest({ settings: { features: { employeeReviews: true } } }), makeParams());
    expect(res.status).toBe(200);
    const merged = (capturedUpdate?.settings as Record<string, unknown> | undefined)?.features as Record<string, unknown> | undefined;
    expect(merged?.employeeReviews).toBe(true);
  });

  // ── 5. employeeReviews false persists ─────────────────────────────────────
  it('5. employeeReviews=false is forwarded to DB update', async () => {
    let capturedUpdate: Record<string, unknown> | undefined;
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'companies') {
          const selectChain = {
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { settings: { features: { employeeReviews: true } } }, error: null }),
          };
          selectChain.eq.mockReturnValue(selectChain);
          const updateChain = { eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: COMPANY_ID, settings: { features: { employeeReviews: false } } }, error: null }) };
          updateChain.eq.mockReturnValue(updateChain);
          updateChain.select.mockReturnValue(updateChain);
          return {
            select: vi.fn().mockReturnValue(selectChain),
            update: vi.fn((u: Record<string, unknown>) => { capturedUpdate = u; return updateChain; }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) };
      }),
    } as unknown as ReturnType<typeof createServiceClient>);

    const res = await PATCH(makeRequest({ settings: { features: { employeeReviews: false } } }), makeParams());
    expect(res.status).toBe(200);
    const merged = (capturedUpdate?.settings as Record<string, unknown> | undefined)?.features as Record<string, unknown> | undefined;
    expect(merged?.employeeReviews).toBe(false);
  });

  // ── 6. Unrelated settings survive deep merge ───────────────────────────────
  it('6. branding is preserved when only features are updated', async () => {
    let capturedUpdate: Record<string, unknown> | undefined;
    const existingBranding = { primaryColor: '#ff0000', secondaryColor: '#00ff00', accentColor: '#0000ff' };
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'companies') {
          const selectChain = {
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { settings: { branding: existingBranding, features: { employeeReviews: false } } }, error: null }),
          };
          selectChain.eq.mockReturnValue(selectChain);
          const updateChain = { eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: COMPANY_ID }, error: null }) };
          updateChain.eq.mockReturnValue(updateChain);
          updateChain.select.mockReturnValue(updateChain);
          return {
            select: vi.fn().mockReturnValue(selectChain),
            update: vi.fn((u: Record<string, unknown>) => { capturedUpdate = u; return updateChain; }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) };
      }),
    } as unknown as ReturnType<typeof createServiceClient>);

    await PATCH(makeRequest({ settings: { features: { employeeReviews: true } } }), makeParams());
    const savedSettings = capturedUpdate?.settings as Record<string, unknown> | undefined;
    expect(savedSettings?.branding).toEqual(existingBranding);
  });

  // ── 7. Other feature flags survive deep merge ──────────────────────────────
  it('7. other feature flags survive when only employeeReviews is updated', async () => {
    let capturedUpdate: Record<string, unknown> | undefined;
    const existingFeatures = { workers: true, documents: false, employeeReviews: false };
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'companies') {
          const selectChain = {
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { settings: { features: existingFeatures } }, error: null }),
          };
          selectChain.eq.mockReturnValue(selectChain);
          const updateChain = { eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: COMPANY_ID }, error: null }) };
          updateChain.eq.mockReturnValue(updateChain);
          updateChain.select.mockReturnValue(updateChain);
          return {
            select: vi.fn().mockReturnValue(selectChain),
            update: vi.fn((u: Record<string, unknown>) => { capturedUpdate = u; return updateChain; }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) };
      }),
    } as unknown as ReturnType<typeof createServiceClient>);

    await PATCH(makeRequest({ settings: { features: { employeeReviews: true } } }), makeParams());
    const merged = (capturedUpdate?.settings as Record<string, unknown> | undefined)?.features as Record<string, unknown> | undefined;
    expect(merged?.workers).toBe(true);
    expect(merged?.documents).toBe(false);
    expect(merged?.employeeReviews).toBe(true);
  });

  // ── 8. Unauthorized (non-admin) → requireAdmin error is forwarded ──────────
  it('8. unauthorized — requireAdmin error is forwarded', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce({
      session: null,
      error: new Response(JSON.stringify({ error: 'פעולה זו מחייבת הרשאת מנהל' }), { status: 403 }) as unknown as import('next/server').NextResponse,
    });
    const res = await PATCH(makeRequest({ settings: { features: { employeeReviews: true } } }), makeParams());
    expect(res.status).toBe(403);
  });

  // ── 9. Unknown feature key is silently preserved (no strict schema on route) ─
  it('9. unknown feature key does not break the update', async () => {
    const res = await PATCH(makeRequest({ settings: { features: { employeeReviews: true, unknownFeature: true } } }), makeParams());
    // Route accepts and merges — no rejection for unknown keys (flexible JSONB)
    expect(res.status).toBe(200);
  });
});
