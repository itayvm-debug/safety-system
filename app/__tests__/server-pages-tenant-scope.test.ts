/**
 * P0·3 — server pages must scope id lookups to the active company.
 *
 * Before the fix these pages queried by `id` alone with the service role, so a
 * user of company A who knew an id from company B received B's full row.
 * The fake client below honours every `.eq()` filter, so a page that forgets
 * `.eq('company_id', …)` gets B's row and the test fails.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';

const rows: Record<string, Array<Record<string, unknown>>> = {
  workers: [
    { id: 'w-a', company_id: A, full_name: 'A worker' },
    { id: 'w-b', company_id: B, full_name: 'B worker' },
  ],
  heavy_equipment: [
    { id: 'he-a', company_id: A, description: 'A machine' },
    { id: 'he-b', company_id: B, description: 'B machine' },
  ],
  lifting_equipment: [
    { id: 'le-a', company_id: A, description: 'A hoist' },
    { id: 'le-b', company_id: B, description: 'B hoist' },
  ],
};

function fakeClient() {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => { filters.push([col, val]); return q; },
        single: async () => {
          const hit = (rows[table] ?? []).filter(r => filters.every(([c, v]) => r[c] === v));
          return hit.length === 1 ? { data: hit[0], error: null } : { data: null, error: { message: 'not found' } };
        },
      };
      return q;
    },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
  };
}

let ctx: { companyId: string; companyRole: 'owner' | 'admin' | 'member' } | null = null;

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient() }));
vi.mock('@/lib/auth/company-context', () => {
  const resolve = async () =>
    ctx
      ? { context: { ...ctx, userId: 'u', email: 'e', username: 'u', platformRole: 'user', companyName: 'c', settings: {} }, error: null }
      : { context: null, error: {}, code: 'NO_SESSION' };
  return { getCurrentCompanyContext: resolve, getPageCompanyContext: resolve };
});
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
}));
vi.mock('next/link', () => ({ default: () => null }));
vi.mock('@/components/workers/WorkerForm', () => ({ default: () => null }));
vi.mock('@/components/heavy-equipment/HeavyEquipmentDetail', () => ({ default: () => null }));
vi.mock('@/components/heavy-equipment/EquipmentForm', () => ({ default: () => null }));
vi.mock('@/components/lifting-equipment/LiftingEquipmentDetail', () => ({ default: () => null }));
vi.mock('@/components/lifting-equipment/LiftingForm', () => ({ default: () => null }));

import EditWorkerPage from '@/app/workers/[id]/edit/page';
import HeavyDetailPage from '@/app/heavy-equipment/[id]/page';
import HeavyEditPage from '@/app/heavy-equipment/[id]/edit/page';
import LiftingDetailPage from '@/app/lifting-equipment/[id]/page';
import LiftingEditPage from '@/app/lifting-equipment/[id]/edit/page';

type Page = (p: { params: Promise<{ id: string }> }) => Promise<unknown>;
const call = (page: Page, id: string) => page({ params: Promise.resolve({ id }) });

const cases: Array<[string, Page, string, string]> = [
  ['worker edit', EditWorkerPage as Page, 'w-a', 'w-b'],
  ['heavy equipment detail', HeavyDetailPage as Page, 'he-a', 'he-b'],
  ['heavy equipment edit', HeavyEditPage as Page, 'he-a', 'he-b'],
  ['lifting equipment detail', LiftingDetailPage as Page, 'le-a', 'le-b'],
  ['lifting equipment edit', LiftingEditPage as Page, 'le-a', 'le-b'],
];

beforeEach(() => { ctx = null; });

describe.each(cases)('%s page', (_name, page, ownId, foreignId) => {
  it('renders the active company\'s own record for an admin', async () => {
    ctx = { companyId: A, companyRole: 'admin' };
    await expect(call(page, ownId)).resolves.toBeTruthy();
  });

  it('returns 404 for another company\'s record (admin of A, id of B)', async () => {
    ctx = { companyId: A, companyRole: 'admin' };
    await expect(call(page, foreignId)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('owner of B sees B\'s record, not A\'s', async () => {
    ctx = { companyId: B, companyRole: 'owner' };
    await expect(call(page, foreignId)).resolves.toBeTruthy();
    await expect(call(page, ownId)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('redirects to login without a valid company context', async () => {
    await expect(call(page, ownId)).rejects.toThrow('NEXT_REDIRECT:/login');
  });
});

describe('member role', () => {
  it('cannot open edit pages and is sent to the detail page', async () => {
    ctx = { companyId: A, companyRole: 'member' };
    await expect(call(EditWorkerPage as Page, 'w-a')).rejects.toThrow('NEXT_REDIRECT:/workers/w-a');
    await expect(call(HeavyEditPage as Page, 'he-a')).rejects.toThrow('NEXT_REDIRECT:/heavy-equipment/he-a');
  });

  it('can view its own company\'s equipment detail but not another company\'s', async () => {
    ctx = { companyId: A, companyRole: 'member' };
    await expect(call(HeavyDetailPage as Page, 'he-a')).resolves.toBeTruthy();
    await expect(call(LiftingDetailPage as Page, 'le-b')).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
