/**
 * A-07 — editing/deleting a draft review required the recorded evaluator only for
 * members; an admin/owner mapped to another manager could edit someone else's
 * draft, and PATCH accepted any rating value.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
let ctx: { companyId: string; companyRole: string; managerWorkerId: string };
let row: Record<string, unknown> | null;
const writes: Array<{ op: string; values?: unknown }> = [];

vi.mock('@/lib/reviews/auth', () => ({
  requireReviewAuthor: async () => ({ context: ctx, error: null }),
  requireReviewAccess: async () => ({ context: ctx, error: null }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => {
      let op = 'select';
      let values: unknown;
      const q = {
        select: () => q,
        eq: () => q,
        update: (v: unknown) => { op = 'update'; values = v; return q; },
        delete: () => { op = 'delete'; return q; },
        maybeSingle: async () => ({ data: row }),
        single: async () => { writes.push({ op, values }); return { data: { ...row, ...(values as object) }, error: null }; },
        then: (res: (r: unknown) => void) => { writes.push({ op }); res({ error: null }); },
      };
      return q;
    },
  }),
}));

import { PATCH, DELETE } from '@/app/api/reviews/[id]/route';

const params = { params: Promise.resolve({ id: 'r1' }) };
const patch = (body: unknown) => PATCH(new NextRequest('https://x.test/api/reviews/r1', { method: 'PATCH', body: JSON.stringify(body) }), params);
const del = () => DELETE(new NextRequest('https://x.test/api/reviews/r1', { method: 'DELETE' }), params);
const full = { productivity_rating: 4, quality_rating: 4, reliability_rating: 4, discipline_rating: 4, teamwork_rating: 4, safety_rating: 4 };

beforeEach(() => {
  writes.length = 0;
  row = { id: 'r1', submitted_at: null, evaluator_manager_id: 'M2', is_not_evaluable: false,
    productivity_rating: null, quality_rating: null, reliability_rating: null, discipline_rating: null, teamwork_rating: null, safety_rating: null };
});

describe('draft review authorship', () => {
  it.each(['owner', 'admin', 'member'])('%s mapped to another manager cannot edit or delete the draft', async role => {
    ctx = { companyId: A, companyRole: role, managerWorkerId: 'M1' };
    expect((await patch({ manager_comment: 'x' })).status).toBe(403);
    expect((await del()).status).toBe(403);
    expect(writes).toEqual([]);
  });

  it('the recorded evaluator can edit and delete', async () => {
    ctx = { companyId: A, companyRole: 'member', managerWorkerId: 'M2' };
    expect((await patch({ manager_comment: 'ok' })).status).toBe(200);
    expect((await del()).status).toBe(200);
  });
});

describe('rating validation on PATCH', () => {
  beforeEach(() => { ctx = { companyId: A, companyRole: 'admin', managerWorkerId: 'M2' }; });

  it.each([0, 6, 9, 3.5, '4'])('rejects rating %p', async v => {
    expect((await patch({ safety_rating: v })).status).toBe(422);
    expect(writes).toEqual([]);
  });

  it('accepts 1–5 and null (clearing a draft value)', async () => {
    expect((await patch({ safety_rating: 5, quality_rating: null })).status).toBe(200);
  });

  it('refuses to submit an evaluable review with missing ratings', async () => {
    expect((await patch({ safety_rating: 5, submit: true })).status).toBe(422);
  });

  it('submits when all six ratings are present', async () => {
    expect((await patch({ ...full, submit: true })).status).toBe(200);
  });

  it('submits a not-evaluable review without ratings', async () => {
    expect((await patch({ is_not_evaluable: true, not_evaluable_reason: 'חופשה', submit: true })).status).toBe(200);
  });
});
