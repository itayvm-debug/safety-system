/**
 * QA Session 09 — Vehicle Sub-Documents + Heavy Equipment Insurances
 *
 * Endpoints:
 *   GET/POST /api/vehicle-insurances
 *   GET/PATCH/DELETE /api/vehicle-insurances/[id]
 *   GET/POST /api/vehicle-licenses
 *   GET/PATCH/DELETE /api/vehicle-licenses/[id]
 *   GET/POST /api/heavy-equipment-insurances
 *   GET/PATCH/DELETE /api/heavy-equipment-insurances/[id]
 *
 * Coverage:
 *   VD-01..05    Auth boundary — vehicle-insurances unauthenticated → 401
 *   VD-06..08    Input validation → 400
 *   VD-09..10    Vehicle FK injection → 404
 *   VD-11..13    Cross-tenant vehicle-insurance [id] → 404
 *   VD-14        Full CRUD lifecycle (vehicle-insurance)
 *   VD-15..19    Auth boundary — vehicle-licenses unauthenticated → 401
 *   VD-20..21    Input validation → 400
 *   VD-22..23    Vehicle FK injection → 404
 *   VD-24..26    Cross-tenant vehicle-license [id] → 404
 *   VD-27        Full CRUD lifecycle (vehicle-license)
 *   HEI-01..05   Auth boundary — heavy-equipment-insurances unauthenticated → 401
 *   HEI-06..08   Input validation → 400
 *   HEI-09..10   Equipment FK injection → 404
 *   HEI-11..13   Cross-tenant [id] → 404
 *   HEI-14       Upsert idempotency (same type + same equipment → same record)
 *   HEI-15       Full lifecycle (POST → PATCH → DELETE)
 *
 * Safety:
 *   All mutations target Internal QA only.
 *   Fixture aborts if active company ≠ Internal QA.
 *   Every test cleans up its own data.
 */

import type { Page } from '@playwright/test';
import { test, expect, uid } from '../fixtures/workers-auth';

const FOREIGN_UUID = '00000000-0000-0000-0000-000000000099';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function createVehicle(page: Page, tag: string) {
  const vehicle_number = `QA${tag.replace(/\D/g, '').slice(-8)}`;
  const res = await page.request.post('/api/vehicles', {
    data: { vehicle_type: 'truck', vehicle_number },
  });
  expect(res.status(), `createVehicle ${tag}`).toBe(201);
  return (await res.json()) as { id: string };
}

async function cleanupVehicle(page: Page, vehicleId: string) {
  await page.request.patch(`/api/vehicles/${vehicleId}`, { data: { is_archived: true } });
  await page.request.delete(`/api/vehicles/${vehicleId}`);
}

async function createHeavyEquipment(page: Page, tag: string) {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: `QA Equip ${tag}` },
  });
  expect(res.status(), `createHeavyEquipment ${tag}`).toBe(201);
  return (await res.json()) as { id: string };
}

async function cleanupHeavyEquipment(page: Page, equipId: string) {
  await page.request.patch(`/api/heavy-equipment/${equipId}`, { data: { is_archived: true } });
  await page.request.delete(`/api/heavy-equipment/${equipId}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// VD: Vehicle Insurances
// ═══════════════════════════════════════════════════════════════════════════

test('VD-01 - unauthenticated GET /api/vehicle-insurances → 401', async ({ request }) => {
  const res = await request.get('/api/vehicle-insurances?vehicle_id=x');
  expect(res.status()).toBe(401);
});

test('VD-02 - unauthenticated POST /api/vehicle-insurances → 401', async ({ request }) => {
  const res = await request.post('/api/vehicle-insurances', {
    data: { vehicle_id: FOREIGN_UUID, insurance_type: 'third_party' },
  });
  expect(res.status()).toBe(401);
});

test('VD-03 - unauthenticated GET /api/vehicle-insurances/[id] → 401', async ({ request }) => {
  const res = await request.get(`/api/vehicle-insurances/${FOREIGN_UUID}`);
  expect(res.status()).toBe(401);
});

test('VD-04 - unauthenticated PATCH /api/vehicle-insurances/[id] → 401', async ({ request }) => {
  const res = await request.patch(`/api/vehicle-insurances/${FOREIGN_UUID}`, {
    data: { insurance_type: 'full' },
  });
  expect(res.status()).toBe(401);
});

test('VD-05 - unauthenticated DELETE /api/vehicle-insurances/[id] → 401', async ({ request }) => {
  const res = await request.delete(`/api/vehicle-insurances/${FOREIGN_UUID}`);
  expect(res.status()).toBe(401);
});

test('VD-06 - GET /api/vehicle-insurances without vehicle_id → 400', async ({ authPage: page }) => {
  const res = await page.request.get('/api/vehicle-insurances');
  expect(res.status()).toBe(400);
});

test('VD-07 - POST missing vehicle_id → 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/vehicle-insurances', {
    data: { insurance_type: 'third_party' },
  });
  expect(res.status()).toBe(400);
});

test('VD-08 - POST missing insurance_type → 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/vehicle-insurances', {
    data: { vehicle_id: FOREIGN_UUID },
  });
  expect(res.status()).toBe(400);
});

test('VD-09 - GET with foreign vehicle_id → 404', async ({ authPage: page }) => {
  const res = await page.request.get(`/api/vehicle-insurances?vehicle_id=${FOREIGN_UUID}`);
  expect(res.status()).toBe(404);
});

test('VD-10 - POST with foreign vehicle_id → 404', async ({ authPage: page }) => {
  const res = await page.request.post('/api/vehicle-insurances', {
    data: { vehicle_id: FOREIGN_UUID, insurance_type: 'third_party' },
  });
  expect(res.status()).toBe(404);
});

test('VD-11 - GET /api/vehicle-insurances/[foreignId] → 404', async ({ authPage: page }) => {
  const res = await page.request.get(`/api/vehicle-insurances/${FOREIGN_UUID}`);
  expect(res.status()).toBe(404);
});

test('VD-12 - PATCH /api/vehicle-insurances/[foreignId] → 404', async ({ authPage: page }) => {
  const res = await page.request.patch(`/api/vehicle-insurances/${FOREIGN_UUID}`, {
    data: { insurance_type: 'full' },
  });
  expect(res.status()).toBe(404);
});

test('VD-13 - DELETE /api/vehicle-insurances/[foreignId] → 404', async ({ authPage: page }) => {
  const res = await page.request.delete(`/api/vehicle-insurances/${FOREIGN_UUID}`);
  expect(res.status()).toBe(404);
});

test('VD-14 - vehicle-insurance CRUD lifecycle: POST → GET → PATCH → DELETE → 404', async ({
  authPage: page,
}) => {
  const tag = uid();
  const { id: vehicleId } = await createVehicle(page, tag);

  try {
    // POST
    const postRes = await page.request.post('/api/vehicle-insurances', {
      data: { vehicle_id: vehicleId, insurance_type: 'third_party', expiry_date: '2027-01-01' },
    });
    expect(postRes.status()).toBe(201);
    const { id: insId } = (await postRes.json()) as { id: string };

    try {
      // GET by vehicle
      const listRes = await page.request.get(`/api/vehicle-insurances?vehicle_id=${vehicleId}`);
      expect(listRes.status()).toBe(200);
      const list = (await listRes.json()) as { id: string }[];
      expect(list.some(i => i.id === insId)).toBe(true);

      // GET [id]
      const getRes = await page.request.get(`/api/vehicle-insurances/${insId}`);
      expect(getRes.status()).toBe(200);
      const getBody = (await getRes.json()) as { insurance_type: string };
      expect(getBody.insurance_type).toBe('third_party');

      // PATCH
      const patchRes = await page.request.patch(`/api/vehicle-insurances/${insId}`, {
        data: { expiry_date: '2028-06-01' },
      });
      expect(patchRes.status()).toBe(200);

      // DELETE
      const delRes = await page.request.delete(`/api/vehicle-insurances/${insId}`);
      expect(delRes.status()).toBe(200);

      // Verify deleted
      const afterDel = await page.request.get(`/api/vehicle-insurances/${insId}`);
      expect(afterDel.status()).toBe(404);
    } catch (e) {
      await page.request.delete(`/api/vehicle-insurances/${insId}`).catch(() => {});
      throw e;
    }
  } finally {
    await cleanupVehicle(page, vehicleId);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// VD: Vehicle Licenses
// ═══════════════════════════════════════════════════════════════════════════

test('VD-15 - unauthenticated GET /api/vehicle-licenses → 401', async ({ request }) => {
  const res = await request.get('/api/vehicle-licenses?vehicle_id=x');
  expect(res.status()).toBe(401);
});

test('VD-16 - unauthenticated POST /api/vehicle-licenses → 401', async ({ request }) => {
  const res = await request.post('/api/vehicle-licenses', {
    data: { vehicle_id: FOREIGN_UUID },
  });
  expect(res.status()).toBe(401);
});

test('VD-17 - unauthenticated GET /api/vehicle-licenses/[id] → 401', async ({ request }) => {
  const res = await request.get(`/api/vehicle-licenses/${FOREIGN_UUID}`);
  expect(res.status()).toBe(401);
});

test('VD-18 - unauthenticated PATCH /api/vehicle-licenses/[id] → 401', async ({ request }) => {
  const res = await request.patch(`/api/vehicle-licenses/${FOREIGN_UUID}`, {
    data: { expiry_date: '2028-01-01' },
  });
  expect(res.status()).toBe(401);
});

test('VD-19 - unauthenticated DELETE /api/vehicle-licenses/[id] → 401', async ({ request }) => {
  const res = await request.delete(`/api/vehicle-licenses/${FOREIGN_UUID}`);
  expect(res.status()).toBe(401);
});

test('VD-20 - GET /api/vehicle-licenses without vehicle_id → 400', async ({ authPage: page }) => {
  const res = await page.request.get('/api/vehicle-licenses');
  expect(res.status()).toBe(400);
});

test('VD-21 - POST /api/vehicle-licenses missing vehicle_id → 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/vehicle-licenses', { data: {} });
  expect(res.status()).toBe(400);
});

test('VD-22 - GET /api/vehicle-licenses with foreign vehicle_id → 404', async ({ authPage: page }) => {
  const res = await page.request.get(`/api/vehicle-licenses?vehicle_id=${FOREIGN_UUID}`);
  expect(res.status()).toBe(404);
});

test('VD-23 - POST /api/vehicle-licenses with foreign vehicle_id → 404', async ({ authPage: page }) => {
  const res = await page.request.post('/api/vehicle-licenses', {
    data: { vehicle_id: FOREIGN_UUID },
  });
  expect(res.status()).toBe(404);
});

test('VD-24 - GET /api/vehicle-licenses/[foreignId] → 404', async ({ authPage: page }) => {
  const res = await page.request.get(`/api/vehicle-licenses/${FOREIGN_UUID}`);
  expect(res.status()).toBe(404);
});

test('VD-25 - PATCH /api/vehicle-licenses/[foreignId] → 404', async ({ authPage: page }) => {
  const res = await page.request.patch(`/api/vehicle-licenses/${FOREIGN_UUID}`, {
    data: { expiry_date: '2028-01-01' },
  });
  expect(res.status()).toBe(404);
});

test('VD-26 - DELETE /api/vehicle-licenses/[foreignId] → 404', async ({ authPage: page }) => {
  const res = await page.request.delete(`/api/vehicle-licenses/${FOREIGN_UUID}`);
  expect(res.status()).toBe(404);
});

test('VD-27 - vehicle-license CRUD lifecycle: POST → GET [id] → PATCH → DELETE → 404', async ({
  authPage: page,
}) => {
  const tag = uid();
  const { id: vehicleId } = await createVehicle(page, tag);

  try {
    // POST
    const postRes = await page.request.post('/api/vehicle-licenses', {
      data: { vehicle_id: vehicleId, expiry_date: '2027-06-01' },
    });
    expect(postRes.status()).toBe(201);
    const { id: licId } = (await postRes.json()) as { id: string };

    try {
      // GET [id]
      const getRes = await page.request.get(`/api/vehicle-licenses/${licId}`);
      expect(getRes.status()).toBe(200);

      // PATCH
      const patchRes = await page.request.patch(`/api/vehicle-licenses/${licId}`, {
        data: { expiry_date: '2028-12-31' },
      });
      expect(patchRes.status()).toBe(200);
      const patchBody = (await patchRes.json()) as { expiry_date: string };
      expect(patchBody.expiry_date).toBe('2028-12-31');

      // DELETE
      const delRes = await page.request.delete(`/api/vehicle-licenses/${licId}`);
      expect(delRes.status()).toBe(200);

      // Verify deleted
      const afterDel = await page.request.get(`/api/vehicle-licenses/${licId}`);
      expect(afterDel.status()).toBe(404);
    } catch (e) {
      await page.request.delete(`/api/vehicle-licenses/${licId}`).catch(() => {});
      throw e;
    }
  } finally {
    await cleanupVehicle(page, vehicleId);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// HEI: Heavy Equipment Insurances
// ═══════════════════════════════════════════════════════════════════════════

test('HEI-01 - unauthenticated GET /api/heavy-equipment-insurances → 401', async ({ request }) => {
  const res = await request.get('/api/heavy-equipment-insurances?heavy_equipment_id=x');
  expect(res.status()).toBe(401);
});

test('HEI-02 - unauthenticated POST /api/heavy-equipment-insurances → 401', async ({ request }) => {
  const res = await request.post('/api/heavy-equipment-insurances', {
    data: { heavy_equipment_id: FOREIGN_UUID, insurance_type: 'third_party' },
  });
  expect(res.status()).toBe(401);
});

test('HEI-03 - unauthenticated GET /api/heavy-equipment-insurances/[id] → 401', async ({ request }) => {
  const res = await request.get(`/api/heavy-equipment-insurances/${FOREIGN_UUID}`);
  expect(res.status()).toBe(401);
});

test('HEI-04 - unauthenticated PATCH /api/heavy-equipment-insurances/[id] → 401', async ({ request }) => {
  const res = await request.patch(`/api/heavy-equipment-insurances/${FOREIGN_UUID}`, {
    data: { insurance_type: 'full' },
  });
  expect(res.status()).toBe(401);
});

test('HEI-05 - unauthenticated DELETE /api/heavy-equipment-insurances/[id] → 401', async ({ request }) => {
  const res = await request.delete(`/api/heavy-equipment-insurances/${FOREIGN_UUID}`);
  expect(res.status()).toBe(401);
});

test('HEI-06 - GET without heavy_equipment_id → 400', async ({ authPage: page }) => {
  const res = await page.request.get('/api/heavy-equipment-insurances');
  expect(res.status()).toBe(400);
});

test('HEI-07 - POST missing heavy_equipment_id → 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment-insurances', {
    data: { insurance_type: 'third_party' },
  });
  expect(res.status()).toBe(400);
});

test('HEI-08 - POST missing insurance_type → 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment-insurances', {
    data: { heavy_equipment_id: FOREIGN_UUID },
  });
  expect(res.status()).toBe(400);
});

test('HEI-09 - GET with foreign heavy_equipment_id → 404', async ({ authPage: page }) => {
  const res = await page.request.get(`/api/heavy-equipment-insurances?heavy_equipment_id=${FOREIGN_UUID}`);
  expect(res.status()).toBe(404);
});

test('HEI-10 - POST with foreign heavy_equipment_id → 404', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment-insurances', {
    data: { heavy_equipment_id: FOREIGN_UUID, insurance_type: 'third_party' },
  });
  expect(res.status()).toBe(404);
});

test('HEI-11 - GET /api/heavy-equipment-insurances/[foreignId] → 404', async ({ authPage: page }) => {
  const res = await page.request.get(`/api/heavy-equipment-insurances/${FOREIGN_UUID}`);
  expect(res.status()).toBe(404);
});

test('HEI-12 - PATCH /api/heavy-equipment-insurances/[foreignId] → 404', async ({ authPage: page }) => {
  const res = await page.request.patch(`/api/heavy-equipment-insurances/${FOREIGN_UUID}`, {
    data: { insurance_type: 'full' },
  });
  expect(res.status()).toBe(404);
});

test('HEI-13 - DELETE /api/heavy-equipment-insurances/[foreignId] → 404', async ({ authPage: page }) => {
  const res = await page.request.delete(`/api/heavy-equipment-insurances/${FOREIGN_UUID}`);
  expect(res.status()).toBe(404);
});

test('HEI-14 - POST same type twice on same equipment → upsert (same record id)', async ({
  authPage: page,
}) => {
  const tag = uid();
  const { id: equipId } = await createHeavyEquipment(page, tag);

  try {
    const first = await page.request.post('/api/heavy-equipment-insurances', {
      data: { heavy_equipment_id: equipId, insurance_type: 'third_party', expiry_date: '2027-01-01' },
    });
    expect(first.status()).toBe(200);
    const firstBody = (await first.json()) as { id: string };

    const second = await page.request.post('/api/heavy-equipment-insurances', {
      data: { heavy_equipment_id: equipId, insurance_type: 'third_party', expiry_date: '2028-06-01' },
    });
    expect(second.status()).toBe(200);
    const secondBody = (await second.json()) as { id: string; expiry_date: string };

    // Same record (upsert), updated expiry
    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody.expiry_date).toBe('2028-06-01');
  } finally {
    await cleanupHeavyEquipment(page, equipId);
  }
});

test('HEI-15 - heavy-equipment-insurance lifecycle: POST → GET [id] → PATCH → DELETE → 404', async ({
  authPage: page,
}) => {
  const tag = uid();
  const { id: equipId } = await createHeavyEquipment(page, tag);

  try {
    // POST (upsert)
    const postRes = await page.request.post('/api/heavy-equipment-insurances', {
      data: { heavy_equipment_id: equipId, insurance_type: 'full', expiry_date: '2027-01-01' },
    });
    expect(postRes.status()).toBe(200);
    const { id: insId } = (await postRes.json()) as { id: string };

    try {
      // GET [id]
      const getRes = await page.request.get(`/api/heavy-equipment-insurances/${insId}`);
      expect(getRes.status()).toBe(200);
      const getBody = (await getRes.json()) as { insurance_type: string };
      expect(getBody.insurance_type).toBe('full');

      // PATCH
      const patchRes = await page.request.patch(`/api/heavy-equipment-insurances/${insId}`, {
        data: { expiry_date: '2029-12-31' },
      });
      expect(patchRes.status()).toBe(200);

      // DELETE
      const delRes = await page.request.delete(`/api/heavy-equipment-insurances/${insId}`);
      expect(delRes.status()).toBe(200);

      // Verify deleted
      const afterDel = await page.request.get(`/api/heavy-equipment-insurances/${insId}`);
      expect(afterDel.status()).toBe(404);
    } catch (e) {
      await page.request.delete(`/api/heavy-equipment-insurances/${insId}`).catch(() => {});
      throw e;
    }
  } finally {
    await cleanupHeavyEquipment(page, equipId);
  }
});
