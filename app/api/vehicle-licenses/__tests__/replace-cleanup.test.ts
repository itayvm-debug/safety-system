/**
 * P1·1 / P1·6 — PATCH/DELETE /api/vehicle-licenses/[id] file lifecycle.
 *
 * Before the fix PATCH stored any client-supplied file_url (cross-company attach) and
 * left the replaced object in storage forever; DELETE never removed the file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/company-context', async () =>
  (await import('@/app/api/__tests__/helpers/route-harness')).companyContextMock());
vi.mock('@/lib/supabase/server', async () =>
  (await import('@/app/api/__tests__/helpers/route-harness')).supabaseServerMock());

import { harness, COMPANY_A, COMPANY_B, jsonRequest, idParams } from '@/app/api/__tests__/helpers/route-harness';
import { issueUploadPath } from '@/lib/storage/file-paths';
import { PATCH, DELETE } from '../[id]/route';

let OLD: string;
let NEW: string;

beforeEach(() => {
  harness.reset();
  OLD = issueUploadPath(COMPANY_A, 'documents', 'pdf', 1_700_000_000_001);
  NEW = issueUploadPath(COMPANY_A, 'documents', 'pdf', 1_700_000_000_002);
  harness.tables.vehicles = [
    { id: 'v-a', company_id: COMPANY_A, image_url: null },
    { id: 'v-b', company_id: COMPANY_B, image_url: null },
  ];
  harness.tables.vehicle_licenses = [
    { id: 'lic-a', company_id: COMPANY_A, vehicle_id: 'v-a', file_url: OLD, expiry_date: '2027-01-01' },
    { id: 'lic-b', company_id: COMPANY_B, vehicle_id: 'v-b', file_url: null, expiry_date: null },
  ];
});

const patch = (id: string, body: Record<string, unknown>) =>
  PATCH(jsonRequest(`/api/vehicle-licenses/${id}`, 'PATCH', body), idParams(id));

describe('PATCH /api/vehicle-licenses/[id] — replace', () => {
  it('stores the new file and keeps the old object (retention pending)', async () => {
    const res = await patch('lic-a', { file_url: NEW });

    expect(res.status).toBe(200);
    expect(harness.rows('vehicle_licenses').find(l => l.id === 'lic-a')?.file_url).toBe(NEW);
    expect(harness.removed).toEqual([]); // retention policy pending: the old file is kept
  });

  it('keeps the old object when another row still references it', async () => {
    harness.tables.vehicle_insurances = [{ id: 'ins-a', company_id: COMPANY_A, vehicle_id: 'v-a', file_url: OLD }];

    const res = await patch('lic-a', { file_url: NEW });

    expect(res.status).toBe(200);
    expect(harness.removed).toEqual([]);
    expect(harness.indexOf('storage.remove')).toBe(-1);
  });

  it('a storage removal error does not fail the request', async () => {
    harness.removeMode = 'error';
    const res = await patch('lic-a', { file_url: NEW });
    expect(res.status).toBe(200);
    expect(harness.rows('vehicle_licenses').find(l => l.id === 'lic-a')?.file_url).toBe(NEW);
  });

  it('a storage removal exception does not fail the request', async () => {
    harness.removeMode = 'throw';
    const res = await patch('lic-a', { file_url: NEW });
    expect(res.status).toBe(200);
  });

  it('clearing the file (null) keeps the old object (retention pending)', async () => {
    const res = await patch('lic-a', { file_url: null });
    expect(res.status).toBe(200);
    expect(harness.removed).toEqual([]); // retention policy pending: the old file is kept
  });

  it('an update that does not touch file_url removes nothing', async () => {
    const res = await patch('lic-a', { expiry_date: '2028-01-01' });
    expect(res.status).toBe(200);
    expect(harness.removed).toEqual([]);
  });

  it('re-sending the current (legacy) value is accepted as unchanged', async () => {
    harness.tables.vehicle_licenses[0].file_url = 'documents/1600000000000-legacy.pdf';
    const res = await patch('lic-a', { file_url: 'documents/1600000000000-legacy.pdf', expiry_date: '2028-01-01' });
    expect(res.status).toBe(200);
    expect(harness.removed).toEqual([]);
  });

  it('company B cannot attach company A’s receipt to its own license (403, no update)', async () => {
    harness.as(COMPANY_B);
    const res = await patch('lic-b', { file_url: NEW });

    expect(res.status).toBe(403);
    expect(harness.indexOf('update', 'vehicle_licenses')).toBe(-1);
    expect(harness.rows('vehicle_licenses').find(l => l.id === 'lic-b')?.file_url).toBeNull();
  });

  it('company B cannot attach a path already on company A’s license (403)', async () => {
    harness.as(COMPANY_B);
    const res = await patch('lic-b', { file_url: OLD });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/vehicle-licenses/[id]', () => {
  it('deleting the record keeps its file (retention pending)', async () => {
    const res = await DELETE(jsonRequest('/api/vehicle-licenses/lic-a', 'DELETE'), idParams('lic-a'));

    expect(res.status).toBe(200);
    expect(harness.indexOf('delete', 'vehicle_licenses')).toBeGreaterThan(-1);
    expect(harness.removed).toEqual([]); // retention policy pending: the old file is kept
  });

  it('a failed DB delete leaves storage untouched', async () => {
    harness.failOn = [{ table: 'vehicle_licenses', op: 'delete' }];
    const res = await DELETE(jsonRequest('/api/vehicle-licenses/lic-a', 'DELETE'), idParams('lic-a'));

    expect(res.status).toBe(500);
    expect(harness.indexOf('storage.remove')).toBe(-1);
  });
});
