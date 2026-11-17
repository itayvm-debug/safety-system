/**
 * P2 — POST /api/safety-briefings computes expires_at one calendar year after briefed_at.
 *
 * Before the fix it concatenated strings (`${year+1}-${month}-${day}`): 2028-02-29 became
 * the impossible date 2029-02-29, and malformed input produced garbage like "NaN-…".
 * Also covers P1·1 (attach validation) and P1·6 (DELETE cleanup).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/company-context', async () =>
  (await import('@/app/api/__tests__/helpers/route-harness')).companyContextMock());
vi.mock('@/lib/supabase/server', async () =>
  (await import('@/app/api/__tests__/helpers/route-harness')).supabaseServerMock());

import { harness, COMPANY_A, COMPANY_B, jsonRequest } from '@/app/api/__tests__/helpers/route-harness';
import { issueUploadPath } from '@/lib/storage/file-paths';
import { POST, DELETE } from '../route';

beforeEach(() => {
  harness.reset({
    workers: [
      { id: 'w-a', company_id: COMPANY_A, photo_url: null },
      { id: 'w-b', company_id: COMPANY_B, photo_url: null },
    ],
  });
});

const brief = (briefed_at: unknown, extra: Record<string, unknown> = {}) =>
  POST(jsonRequest('/api/safety-briefings', 'POST', { worker_id: 'w-a', mode: 'external', briefed_at, ...extra }));

describe('POST /api/safety-briefings — expires_at', () => {
  it.each([
    ['2028-02-29', '2029-02-28'], // leap day → last day of February
    ['2027-02-28', '2028-02-28'],
    ['2027-03-15', '2028-03-15'],
    ['2027-12-31', '2028-12-31'],
    ['2026-01-01', '2027-01-01'],
  ])('%s → %s', async (briefedAt, expected) => {
    const res = await brief(briefedAt);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expires_at).toBe(expected);
    expect(body.briefed_at).toBe(briefedAt);
  });

  it.each(['2027-02-29', '2027-04-31', '2027-13-01', '2027-00-10', '2027-2-3', '28/02/2028', 'abc', '2028-02-29T00:00:00Z', 20280229])(
    'rejects invalid briefed_at %s with 400 and inserts nothing',
    async (briefedAt) => {
      const res = await brief(briefedAt);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/תאריך/);
      expect(harness.rows('safety_briefings')).toHaveLength(0);
    },
  );

  it('company B cannot attach company A’s receipt as a briefing signature (403)', async () => {
    const sigA = issueUploadPath(COMPANY_A, 'signatures', 'png');
    harness.as(COMPANY_B);

    const res = await POST(jsonRequest('/api/safety-briefings', 'POST', {
      worker_id: 'w-b', mode: 'system', briefed_at: '2027-01-01', signature_url: sigA,
    }));

    expect(res.status).toBe(403);
    expect(harness.rows('safety_briefings')).toHaveLength(0);
  });
});

describe('DELETE /api/safety-briefings', () => {
  it('deleting a briefing record never removes its signed files (briefing history is kept)', async () => {
    harness.tables.safety_briefings = [
      { id: 'sb-old', worker_id: 'w-a', file_url: 'briefings/1700000000001-old.pdf', signature_url: null },
      { id: 'sb-new', worker_id: 'w-a', file_url: 'briefings/1700000000002-new.pdf', signature_url: 'signatures/1700000000003-sig.png' },
    ];

    const res = await DELETE(jsonRequest('/api/safety-briefings', 'DELETE', { briefing_id: 'sb-new' }));

    expect(res.status).toBe(200);
    expect(harness.rows('safety_briefings').map(b => b.id)).toEqual(['sb-old']);
    expect(harness.indexOf('delete', 'safety_briefings')).toBeGreaterThan(-1);
    expect(harness.removed).toEqual([]);
  });
});
