/**
 * B-04 — DELETE /api/upload may only discard a just-uploaded, never-attached file of the
 * active company: an upload receipt issued to that company that no row references.
 *
 * Before the fix: `!allowed && reason !== 'no_matching_record'` let any admin delete ANY
 * unreferenced object (including another company's fresh upload) whenever exactly one
 * company was active, and blocked legitimate cleanup once two companies existed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/company-context', async () =>
  (await import('@/app/api/__tests__/helpers/route-harness')).companyContextMock());
vi.mock('@/lib/supabase/server', async () =>
  (await import('@/app/api/__tests__/helpers/route-harness')).supabaseServerMock());

import { harness, COMPANY_A, COMPANY_B } from '@/app/api/__tests__/helpers/route-harness';
import { issueUploadPath } from '@/lib/storage/file-paths';
import { DELETE } from '../route';

const del = (path: string) =>
  DELETE(new NextRequest(`http://localhost/api/upload?path=${encodeURIComponent(path)}`, { method: 'DELETE' }));

let receiptA: string;

beforeEach(() => {
  harness.reset({
    workers: [{ id: 'w-a', company_id: COMPANY_A, photo_url: null }],
  });
  receiptA = issueUploadPath(COMPANY_A, 'documents', 'jpg');
});

describe('DELETE /api/upload', () => {
  it('company A can delete its own unattached receipt (wizard cleanup) — with two active companies', async () => {
    const res = await del(receiptA);

    expect(res.status).toBe(200);
    expect(harness.removed).toEqual([receiptA]);
  });

  it('company B cannot delete company A’s unattached receipt (403)', async () => {
    harness.as(COMPANY_B);
    const res = await del(receiptA);

    expect(res.status).toBe(403);
    expect(harness.indexOf('storage.remove')).toBe(-1);
  });

  it('company B is refused even when only one company is active (old single-company hole)', async () => {
    harness.tables.companies = [{ id: COMPANY_B, is_active: true }];
    harness.as(COMPANY_B);
    const res = await del(receiptA);

    expect(res.status).toBe(403);
    expect(harness.indexOf('storage.remove')).toBe(-1);
  });

  it('a receipt already attached to a record → 409 (must be removed through the record)', async () => {
    harness.tables.documents = [{ id: 'd1', company_id: COMPANY_A, worker_id: 'w-a', doc_type: 'id_document', file_url: receiptA }];

    const res = await del(receiptA);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/רשומה/);
    expect(harness.indexOf('storage.remove')).toBe(-1);
  });

  it('a legacy path on one of the company’s own records → 409', async () => {
    const legacy = 'documents/1600000000000-legacy.pdf';
    harness.tables.documents = [{ id: 'd1', company_id: COMPANY_A, worker_id: 'w-a', doc_type: 'id_document', file_url: legacy }];

    const res = await del(legacy);

    expect(res.status).toBe(409);
    expect(harness.indexOf('storage.remove')).toBe(-1);
  });

  it('another company’s attached file → 403, indistinguishable from a missing one', async () => {
    harness.tables.documents = [{ id: 'd1', company_id: COMPANY_A, worker_id: 'w-a', doc_type: 'id_document', file_url: receiptA }];
    harness.as(COMPANY_B);

    const res = await del(receiptA);

    expect(res.status).toBe(403);
    expect(harness.indexOf('storage.remove')).toBe(-1);
  });

  it('a legacy, unreferenced, unprovable path → 403 (even with a single active company)', async () => {
    harness.tables.companies = [{ id: COMPANY_A, is_active: true }];
    const res = await del('documents/1600000000000-orphan.pdf');

    expect(res.status).toBe(403);
    expect(harness.indexOf('storage.remove')).toBe(-1);
  });

  it('fails safe: a reference lookup error counts as referenced (409, nothing removed)', async () => {
    harness.failOn = [{ table: 'safety_briefings', op: 'select' }];
    const res = await del(receiptA);

    expect(res.status).toBe(409);
    expect(harness.indexOf('storage.remove')).toBe(-1);
  });

  it('member role is refused (403)', async () => {
    harness.as(COMPANY_A, 'member');
    const res = await del(receiptA);

    expect(res.status).toBe(403);
    expect(harness.indexOf('storage.remove')).toBe(-1);
  });

  it('traversal path is refused', async () => {
    const res = await del('documents/../../etc/passwd');
    expect(res.status).toBe(403);
    expect(harness.indexOf('storage.remove')).toBe(-1);
  });
});
