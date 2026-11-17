/**
 * P1·6 — DELETE /api/vehicles/[id] and /api/heavy-equipment/[id] remove the files of the
 * record AND of the children deleted with it by ON DELETE CASCADE
 * (vehicle_licenses / vehicle_insurances; heavy_equipment_insurances), after the DB delete.
 *
 * Before the fix both routes only deleted the row: every image, license and insurance
 * file of the vehicle/equipment was left in storage forever.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/company-context', async () =>
  (await import('@/app/api/__tests__/helpers/route-harness')).companyContextMock());
vi.mock('@/lib/supabase/server', async () =>
  (await import('@/app/api/__tests__/helpers/route-harness')).supabaseServerMock());

import { harness, COMPANY_A, COMPANY_B, jsonRequest, idParams } from '@/app/api/__tests__/helpers/route-harness';
import { DELETE as deleteVehicle, PATCH as patchVehicle } from '../[id]/route';
import { DELETE as deleteHeavy } from '../../heavy-equipment/[id]/route';

const IMG = 'vehicles/1700000000001-img.jpg';
const LIC = 'documents/1700000000002-lic.pdf';
const INS = 'documents/1700000000003-ins.pdf';
const SHARED = 'documents/1700000000004-shared.pdf';

beforeEach(() => {
  harness.reset({
    vehicles: [
      { id: 'v-a', company_id: COMPANY_A, image_url: IMG },
      { id: 'v-a2', company_id: COMPANY_A, image_url: null },
    ],
    vehicle_licenses: [
      { id: 'lic-1', company_id: COMPANY_A, vehicle_id: 'v-a', file_url: LIC },
      { id: 'lic-2', company_id: COMPANY_A, vehicle_id: 'v-a', file_url: SHARED },
      { id: 'lic-other', company_id: COMPANY_A, vehicle_id: 'v-a2', file_url: SHARED },
    ],
    vehicle_insurances: [
      { id: 'ins-1', company_id: COMPANY_A, vehicle_id: 'v-a', file_url: INS },
      { id: 'ins-2', company_id: COMPANY_A, vehicle_id: 'v-a', file_url: null },
    ],
  });
});

describe('DELETE /api/vehicles/[id]', () => {
  it('deleting a vehicle keeps its and its children’s files (retention pending)', async () => {
    const res = await deleteVehicle(jsonRequest('/api/vehicles/v-a', 'DELETE'), idParams('v-a'));

    expect(res.status).toBe(200);
    // children are gone with the parent (cascade)
    expect(harness.rows('vehicle_licenses').map(l => l.id)).toEqual(['lic-other']);
    expect(harness.rows('vehicle_insurances')).toHaveLength(0);
    expect(harness.removed).toEqual([]); // retention policy pending: the old file is kept
    expect(harness.indexOf('delete', 'vehicles')).toBeGreaterThan(-1);
  });

  it('a storage failure does not fail the delete', async () => {
    harness.removeMode = 'throw';
    const res = await deleteVehicle(jsonRequest('/api/vehicles/v-a', 'DELETE'), idParams('v-a'));
    expect(res.status).toBe(200);
    expect(harness.rows('vehicles').some(v => v.id === 'v-a')).toBe(false);
  });

  it('a failed DB delete removes nothing from storage', async () => {
    harness.failOn = [{ table: 'vehicles', op: 'delete' }];
    const res = await deleteVehicle(jsonRequest('/api/vehicles/v-a', 'DELETE'), idParams('v-a'));
    expect(res.status).toBe(500);
    expect(harness.indexOf('storage.remove')).toBe(-1);
  });

  it('company B cannot delete company A’s vehicle (404, nothing removed)', async () => {
    harness.as(COMPANY_B);
    const res = await deleteVehicle(jsonRequest('/api/vehicles/v-a', 'DELETE'), idParams('v-a'));
    expect(res.status).toBe(404);
    expect(harness.rows('vehicles')).toHaveLength(2);
    expect(harness.indexOf('storage.remove')).toBe(-1);
  });
});

describe('PATCH /api/vehicles/[id] — image', () => {
  it('company B cannot set company A’s image on its own vehicle (403)', async () => {
    harness.tables.vehicles.push({ id: 'v-b', company_id: COMPANY_B, image_url: null });
    harness.as(COMPANY_B);

    const res = await patchVehicle(jsonRequest('/api/vehicles/v-b', 'PATCH', { image_url: IMG }), idParams('v-b'));

    expect(res.status).toBe(403);
    expect(harness.rows('vehicles').find(v => v.id === 'v-b')?.image_url).toBeNull();
  });
});

describe('DELETE /api/heavy-equipment/[id]', () => {
  const HE_IMG = 'heavy-equipment/1700000000010-img.jpg';
  const HE_LIC = 'heavy-equipment/1700000000011-lic.pdf';
  const HE_INSP = 'heavy-equipment/1700000000012-insp.pdf';
  const HE_INS = 'documents/1700000000013-ins.pdf';

  beforeEach(() => {
    harness.tables.heavy_equipment = [
      { id: 'he-a', company_id: COMPANY_A, image_url: HE_IMG, license_file_url: HE_LIC, inspection_file_url: HE_INSP, insurance_file_url: HE_INS },
    ];
    harness.tables.heavy_equipment_insurances = [
      { id: 'hei-1', company_id: COMPANY_A, heavy_equipment_id: 'he-a', insurance_type: 'ביטוח חובה', file_url: HE_INS },
    ];
    harness.tables.lifting_machine_appointments = [
      { id: 'lma-1', company_id: COMPANY_A, worker_id: 'w-a', equipment_id: 'he-a', pdf_url: null },
    ];
  });

  it('deleting equipment keeps its and its insurances’ files (retention pending)', async () => {
    const res = await deleteHeavy(jsonRequest('/api/heavy-equipment/he-a', 'DELETE'), idParams('he-a'));

    expect(res.status).toBe(200);
    expect(harness.rows('heavy_equipment_insurances')).toHaveLength(0);
    expect(harness.indexOf('delete', 'heavy_equipment')).toBeGreaterThan(-1);
    expect(harness.removed).toEqual([]); // retention policy pending: the old file is kept
    // appointments are SET NULL in the DB, never deleted by this route
    expect(harness.indexOf('delete', 'lifting_machine_appointments')).toBe(-1);
  });
});
