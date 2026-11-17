/**
 * P0·4 — PUT /api/workers/[id]: switching a worker to foreign makes the worker's existing
 * work_visa documents required (is_required = true), scoped to the active company.
 *
 * Before the fix the flag stayed false after the switch, so a foreign worker's visa was
 * treated as optional (the lock in POST /api/documents applies only to new uploads).
 * Also covers P1·1 / P1·6 for PATCH photo_url.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/company-context', async () =>
  (await import('@/app/api/__tests__/helpers/route-harness')).companyContextMock());
vi.mock('@/lib/supabase/server', async () =>
  (await import('@/app/api/__tests__/helpers/route-harness')).supabaseServerMock());

import { harness, COMPANY_A, COMPANY_B, jsonRequest, idParams } from '@/app/api/__tests__/helpers/route-harness';
import { issueUploadPath } from '@/lib/storage/file-paths';
import { PUT, PATCH } from '../[id]/route';

const VISA_FILE = 'documents/1700000000000-visa.pdf';

beforeEach(() => {
  harness.reset({
    workers: [
      { id: 'w-a', company_id: COMPANY_A, full_name: 'Worker A', is_foreign_worker: false, national_id: '000000018', passport_number: null, photo_url: null },
      { id: 'w-b', company_id: COMPANY_B, full_name: 'Worker B', is_foreign_worker: false, national_id: '000000026', passport_number: null, photo_url: null },
    ],
    documents: [
      { id: 'visa-a', company_id: COMPANY_A, worker_id: 'w-a', doc_type: 'work_visa', is_required: false, file_url: VISA_FILE, expiry_date: '2027-05-01' },
      { id: 'id-a', company_id: COMPANY_A, worker_id: 'w-a', doc_type: 'id_document', is_required: false, file_url: null, expiry_date: null },
      // a stray row carrying A's worker id under another company must never be touched
      { id: 'visa-stray', company_id: COMPANY_B, worker_id: 'w-a', doc_type: 'work_visa', is_required: false, file_url: null, expiry_date: null },
      { id: 'visa-b', company_id: COMPANY_B, worker_id: 'w-b', doc_type: 'work_visa', is_required: false, file_url: null, expiry_date: null },
    ],
  });
});

const doc = (id: string) => harness.rows('documents').find(d => d.id === id)!;

const putWorker = (id: string, body: Record<string, unknown>) =>
  PUT(jsonRequest(`/api/workers/${id}`, 'PUT', body), idParams(id));

describe('PUT /api/workers/[id] — switching to foreign', () => {
  it('sets is_required=true on the worker’s work_visa documents of the active company only', async () => {
    const res = await putWorker('w-a', { full_name: 'Worker A', is_foreign_worker: true, passport_number: 'P1234567' });

    expect(res.status).toBe(200);
    expect(doc('visa-a').is_required).toBe(true);
    // file and expiry untouched
    expect(doc('visa-a').file_url).toBe(VISA_FILE);
    expect(doc('visa-a').expiry_date).toBe('2027-05-01');
    // other doc types and other companies untouched
    expect(doc('id-a').is_required).toBe(false);
    expect(doc('visa-stray').is_required).toBe(false);
    expect(doc('visa-b').is_required).toBe(false);

    const visaUpdate = harness.log.find(e => e.op === 'update' && e.table === 'documents');
    expect(visaUpdate?.payload).toEqual({ is_required: true });
    expect(visaUpdate?.filters).toEqual(expect.arrayContaining([
      ['worker_id', 'w-a'], ['company_id', COMPANY_A], ['doc_type', 'work_visa'],
    ]));
  });

  it('does not touch documents when the worker stays Israeli', async () => {
    const res = await putWorker('w-a', { full_name: 'Worker A', is_foreign_worker: false, national_id: '000000018' });

    expect(res.status).toBe(200);
    expect(doc('visa-a').is_required).toBe(false);
    expect(harness.indexOf('update', 'documents')).toBe(-1);
  });

  it('company B cannot switch company A’s worker (no visa change)', async () => {
    harness.as(COMPANY_B);
    const res = await putWorker('w-a', { full_name: 'X', is_foreign_worker: true, passport_number: 'P7654321' });

    expect(res.status).not.toBe(200);
    expect(doc('visa-a').is_required).toBe(false);
    expect(doc('visa-stray').is_required).toBe(false);
  });

  it('reports a failure of the visa sync instead of silently succeeding', async () => {
    harness.failOn = [{ table: 'documents', op: 'update' }];
    const res = await putWorker('w-a', { full_name: 'Worker A', is_foreign_worker: true, passport_number: 'P1234567' });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/אשרת העבודה/);
  });
});

describe('PATCH /api/workers/[id] — photo_url', () => {
  const patchWorker = (id: string, body: Record<string, unknown>) =>
    PATCH(jsonRequest(`/api/workers/${id}`, 'PATCH', body), idParams(id));

  it('company B cannot set company A’s receipt as its worker photo (403)', async () => {
    const photoA = issueUploadPath(COMPANY_A, 'photos', 'jpg');
    harness.as(COMPANY_B);

    const res = await patchWorker('w-b', { photo_url: photoA });

    expect(res.status).toBe(403);
    expect(harness.rows('workers').find(w => w.id === 'w-b')?.photo_url).toBeNull();
  });

  it('replacing a photo stores the new one and keeps the old object (retention pending)', async () => {
    const oldPhoto = issueUploadPath(COMPANY_A, 'photos', 'jpg', 1_700_000_000_001);
    const newPhoto = issueUploadPath(COMPANY_A, 'photos', 'jpg', 1_700_000_000_002);
    harness.tables.workers[0].photo_url = oldPhoto;

    const res = await patchWorker('w-a', { photo_url: newPhoto });

    expect(res.status).toBe(200);
    expect(harness.rows('workers')[0].photo_url).toBe(newPhoto);
    expect(harness.removed).toEqual([]); // retention policy pending: the old file is kept
  });
});
