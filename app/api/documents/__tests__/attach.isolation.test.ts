/**
 * P1·1 / P1·6 — POST/DELETE /api/documents with client-supplied file paths.
 *
 * Before the fix the route stored any `file_url` the client sent, so company B could
 * point its own record at company A's object (a fresh receipt, or a legacy path already
 * on one of A's records) and then read it through /api/signed-url. DELETE removed the
 * object even when another row still referenced it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/company-context', async () =>
  (await import('@/app/api/__tests__/helpers/route-harness')).companyContextMock());
vi.mock('@/lib/supabase/server', async () =>
  (await import('@/app/api/__tests__/helpers/route-harness')).supabaseServerMock());

import { harness, COMPANY_A, COMPANY_B, jsonRequest } from '@/app/api/__tests__/helpers/route-harness';
import { issueUploadPath } from '@/lib/storage/file-paths';
import { POST, DELETE } from '../route';

const LEGACY_A = 'documents/1700000000000-legacy-a.pdf';

function seed() {
  harness.reset({
    workers: [
      { id: 'w-a', company_id: COMPANY_A, is_foreign_worker: false, photo_url: null },
      { id: 'w-b', company_id: COMPANY_B, is_foreign_worker: false, photo_url: null },
    ],
    documents: [
      { id: 'doc-a', company_id: COMPANY_A, worker_id: 'w-a', doc_type: 'height_permit', file_url: LEGACY_A, is_required: true },
    ],
  });
}

const post = (body: Record<string, unknown>) => POST(jsonRequest('/api/documents', 'POST', body));

beforeEach(seed);

describe('POST /api/documents — attach validation', () => {
  it('company B cannot attach an upload receipt issued to company A (403, nothing stored)', async () => {
    const receiptA = issueUploadPath(COMPANY_A, 'documents', 'pdf');
    harness.as(COMPANY_B);

    const res = await post({ worker_id: 'w-b', doc_type: 'id_document', file_url: receiptA });

    expect(res.status).toBe(403);
    expect(harness.rows('documents').some(d => d.file_url === receiptA)).toBe(false);
    expect(harness.indexOf('upsert', 'documents')).toBe(-1);
  });

  it('company B cannot attach a legacy path referenced only by company A (403)', async () => {
    harness.as(COMPANY_B);

    const res = await post({ worker_id: 'w-b', doc_type: 'id_document', file_url: LEGACY_A });

    expect(res.status).toBe(403);
    expect(harness.rows('documents').filter(d => d.file_url === LEGACY_A)).toHaveLength(1);
  });

  it('company B cannot smuggle A’s receipt through an optional license insert (403)', async () => {
    const receiptA = issueUploadPath(COMPANY_A, 'documents', 'pdf');
    harness.as(COMPANY_B);

    const res = await post({ worker_id: 'w-b', doc_type: 'optional_license', license_name: 'x', file_url: receiptA });

    expect(res.status).toBe(403);
    expect(harness.indexOf('insert', 'documents')).toBe(-1);
  });

  it('company A can attach its own fresh receipt; the normalized path is stored', async () => {
    const receiptA = issueUploadPath(COMPANY_A, 'documents', 'pdf');

    const res = await post({ worker_id: 'w-a', doc_type: 'id_document', file_url: `/${receiptA}` });

    expect(res.status).toBe(200);
    const stored = harness.rows('documents').find(d => d.worker_id === 'w-a' && d.doc_type === 'id_document');
    expect(stored?.file_url).toBe(receiptA);
    expect(stored?.company_id).toBe(COMPANY_A);
  });

  it('company A can re-attach a legacy path already on one of its own records', async () => {
    const res = await post({ worker_id: 'w-a', doc_type: 'id_document', file_url: LEGACY_A });
    expect(res.status).toBe(200);
  });

  it('rejects a traversal path with 400', async () => {
    const res = await post({ worker_id: 'w-a', doc_type: 'id_document', file_url: 'documents/../../secret.pdf' });
    expect(res.status).toBe(400);
  });

  it('member role is refused before anything is read or written', async () => {
    const receiptA = issueUploadPath(COMPANY_A, 'documents', 'pdf');
    harness.as(COMPANY_A, 'member');

    const res = await post({ worker_id: 'w-a', doc_type: 'id_document', file_url: receiptA });

    expect(res.status).toBe(403);
    expect(harness.log).toHaveLength(0);
  });

  it('replacing a document file keeps the old object (retention pending)', async () => {
    const oldReceipt = issueUploadPath(COMPANY_A, 'documents', 'pdf', 1_700_000_000_001);
    const newReceipt = issueUploadPath(COMPANY_A, 'documents', 'pdf', 1_700_000_000_002);
    harness.tables.documents.push({ id: 'doc-id', company_id: COMPANY_A, worker_id: 'w-a', doc_type: 'id_document', file_url: oldReceipt });

    const res = await post({ worker_id: 'w-a', doc_type: 'id_document', file_url: newReceipt });

    expect(res.status).toBe(200);
    expect(harness.removed).toEqual([]); // retention policy pending: the old file is kept
  });

  it('an upsert without file_url leaves the current file in place', async () => {
    const res = await post({ worker_id: 'w-a', doc_type: 'height_permit', expiry_date: '2030-01-01' });

    expect(res.status).toBe(200);
    expect(harness.rows('documents').find(d => d.id === 'doc-a')?.file_url).toBe(LEGACY_A);
    expect(harness.removed).toEqual([]);
  });
});

describe('DELETE /api/documents — storage cleanup', () => {
  it('removes the file after the DB delete when nothing else references it', async () => {
    const res = await DELETE(jsonRequest('/api/documents', 'DELETE', { doc_id: 'doc-a' }));

    expect(res.status).toBe(200);
    expect(harness.removed).toEqual([LEGACY_A]);
    expect(harness.indexOf('delete', 'documents')).toBeLessThan(harness.indexOf('storage.remove'));
  });

  it('keeps the object when another record still references it', async () => {
    harness.tables.safety_briefings = [{ id: 'sb-1', worker_id: 'w-a', file_url: LEGACY_A }];

    const res = await DELETE(jsonRequest('/api/documents', 'DELETE', { doc_id: 'doc-a' }));

    expect(res.status).toBe(200);
    expect(harness.removed).toEqual([]);
    expect(harness.rows('documents').some(d => d.id === 'doc-a')).toBe(false);
  });

  it('a storage failure does not fail the request', async () => {
    harness.removeMode = 'throw';
    const res = await DELETE(jsonRequest('/api/documents', 'DELETE', { doc_id: 'doc-a' }));
    expect(res.status).toBe(200);
  });

  it('company B cannot delete company A’s document (404, file untouched)', async () => {
    harness.as(COMPANY_B);
    const res = await DELETE(jsonRequest('/api/documents', 'DELETE', { doc_id: 'doc-a' }));
    expect(res.status).toBe(404);
    expect(harness.removed).toEqual([]);
  });
});
