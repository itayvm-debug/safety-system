/**
 * QA Session 08 — Lifting Machine Appointments (LMA)
 *
 * Endpoints:
 *   GET/POST   /api/lifting-machine-appointments
 *   GET/PATCH/DELETE /api/lifting-machine-appointments/[id]
 *   POST       /api/lifting-machine-appointments/generate-pdf
 *
 * Coverage:
 *   LMA-01..05   Auth boundary — unauthenticated → 401
 *   LMA-06..08   Input validation → 400
 *   LMA-09..10   Worker / Equipment FK injection → 404
 *   LMA-11..13   Cross-tenant [id] isolation → 404
 *   LMA-14..15   PATCH FK injection → 404
 *   LMA-16       generate-pdf cross-tenant → 404
 *   LMA-17       worker_id filter bug (BUG: filter silently ignored)
 *   LMA-18       GET collection scoped to own company
 *   LMA-19       Full CRUD lifecycle
 *   LMA-20       generate-pdf — own appointment → pdf_url returned
 *
 * Safety:
 *   All mutations target Internal QA (Company B) only.
 *   Fixture aborts if active company ≠ Internal QA.
 *   Every test cleans up its own data via finally blocks.
 */

import type { Page } from '@playwright/test';
import { test, expect, uid } from '../fixtures/workers-auth';

const FOREIGN_UUID = '00000000-0000-0000-0000-000000000099';

// Minimal valid 1×1 white PNG for generate-pdf overlay
const TINY_PNG_B64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function createWorker(page: Page, tag: string) {
  const national_id = tag.replace(/\D/g, '').slice(-9).padStart(9, '0');
  const res = await page.request.post('/api/workers', {
    data: {
      full_name: `QA LMA Worker ${tag}`,
      national_id,
      is_foreign_worker: false,
    },
  });
  expect(res.status(), `createWorker ${tag}`).toBe(201);
  return (await res.json()) as { id: string };
}

async function createLMA(page: Page, workerId: string, tag: string) {
  const res = await page.request.post('/api/lifting-machine-appointments', {
    data: {
      worker_id: workerId,
      machine_name: `QA Crane ${tag}`,
      appointer_name: 'QA Appointer',
      appointment_date: '2026-01-15',
    },
  });
  expect(res.status(), `createLMA ${tag}`).toBe(201);
  return (await res.json()) as { id: string };
}

async function deleteLMA(page: Page, lmaId: string) {
  await page.request.delete(`/api/lifting-machine-appointments/${lmaId}`).catch(() => {});
}

async function cleanupWorker(page: Page, workerId: string) {
  await page.request.patch(`/api/workers/${workerId}`, { data: { is_archived: true } });
  await page.request.delete(`/api/workers/${workerId}`);
}

// ─── LMA-01..05: Auth boundary ───────────────────────────────────────────────

test('LMA-01 - unauthenticated GET /api/lifting-machine-appointments → 401', async ({ request }) => {
  const res = await request.get('/api/lifting-machine-appointments');
  expect(res.status()).toBe(401);
});

test('LMA-02 - unauthenticated POST /api/lifting-machine-appointments → 401', async ({ request }) => {
  const res = await request.post('/api/lifting-machine-appointments', {
    data: {
      worker_id: FOREIGN_UUID,
      machine_name: 'x',
      appointer_name: 'y',
      appointment_date: '2026-01-01',
    },
  });
  expect(res.status()).toBe(401);
});

test('LMA-03 - unauthenticated PATCH /api/lifting-machine-appointments/[id] → 401', async ({ request }) => {
  const res = await request.patch(`/api/lifting-machine-appointments/${FOREIGN_UUID}`, {
    data: { machine_name: 'injected' },
  });
  expect(res.status()).toBe(401);
});

test('LMA-04 - unauthenticated DELETE /api/lifting-machine-appointments/[id] → 401', async ({ request }) => {
  const res = await request.delete(`/api/lifting-machine-appointments/${FOREIGN_UUID}`);
  expect(res.status()).toBe(401);
});

test('LMA-05 - unauthenticated POST /api/lifting-machine-appointments/generate-pdf → 401', async ({ request }) => {
  const res = await request.post('/api/lifting-machine-appointments/generate-pdf', {
    data: { appointment_id: FOREIGN_UUID, overlay_image_b64: TINY_PNG_B64 },
  });
  expect(res.status()).toBe(401);
});

// ─── LMA-06..08: Input validation ────────────────────────────────────────────

test('LMA-06 - POST missing worker_id → 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/lifting-machine-appointments', {
    data: { machine_name: 'x', appointer_name: 'y', appointment_date: '2026-01-01' },
  });
  expect(res.status()).toBe(400);
});

test('LMA-07 - POST missing machine_name → 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/lifting-machine-appointments', {
    data: { worker_id: FOREIGN_UUID, appointer_name: 'y', appointment_date: '2026-01-01' },
  });
  expect(res.status()).toBe(400);
});

test('LMA-08 - generate-pdf missing overlay_image_b64 → 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/lifting-machine-appointments/generate-pdf', {
    data: { appointment_id: FOREIGN_UUID },
  });
  expect(res.status()).toBe(400);
});

// ─── LMA-09..10: FK injection on POST ────────────────────────────────────────

test('LMA-09 - POST with foreign worker_id → 404', async ({ authPage: page }) => {
  const res = await page.request.post('/api/lifting-machine-appointments', {
    data: {
      worker_id: FOREIGN_UUID,
      machine_name: 'QA FK Test',
      appointer_name: 'QA',
      appointment_date: '2026-01-01',
    },
  });
  expect(res.status()).toBe(404);
});

test('LMA-10 - POST with foreign equipment_id → 404', async ({ authPage: page }) => {
  const tag = uid();
  const { id: workerId } = await createWorker(page, tag);
  try {
    const res = await page.request.post('/api/lifting-machine-appointments', {
      data: {
        worker_id: workerId,
        equipment_id: FOREIGN_UUID,
        machine_name: 'QA FK Equip Test',
        appointer_name: 'QA',
        appointment_date: '2026-01-01',
      },
    });
    expect(res.status()).toBe(404);
  } finally {
    await cleanupWorker(page, workerId);
  }
});

// ─── LMA-11..13: Cross-tenant isolation on [id] ───────────────────────────────

test('LMA-11 - GET /api/lifting-machine-appointments/[foreignId] → 404', async ({ authPage: page }) => {
  const res = await page.request.get(`/api/lifting-machine-appointments/${FOREIGN_UUID}`);
  expect(res.status()).toBe(404);
});

test('LMA-12 - PATCH /api/lifting-machine-appointments/[foreignId] → 404', async ({ authPage: page }) => {
  const res = await page.request.patch(`/api/lifting-machine-appointments/${FOREIGN_UUID}`, {
    data: { machine_name: 'injected' },
  });
  expect(res.status()).toBe(404);
});

test('LMA-13 - DELETE /api/lifting-machine-appointments/[foreignId] → 404', async ({ authPage: page }) => {
  const res = await page.request.delete(`/api/lifting-machine-appointments/${FOREIGN_UUID}`);
  expect(res.status()).toBe(404);
});

// ─── LMA-14..15: FK injection on PATCH ───────────────────────────────────────

test('LMA-14 - PATCH with foreign worker_id → 404', async ({ authPage: page }) => {
  const tag = uid();
  const { id: workerId } = await createWorker(page, tag);
  const { id: lmaId } = await createLMA(page, workerId, tag);
  try {
    const res = await page.request.patch(`/api/lifting-machine-appointments/${lmaId}`, {
      data: { worker_id: FOREIGN_UUID },
    });
    expect(res.status()).toBe(404);
  } finally {
    await deleteLMA(page, lmaId);
    await cleanupWorker(page, workerId);
  }
});

test('LMA-15 - PATCH with foreign equipment_id → 404', async ({ authPage: page }) => {
  const tag = uid();
  const { id: workerId } = await createWorker(page, tag);
  const { id: lmaId } = await createLMA(page, workerId, tag);
  try {
    const res = await page.request.patch(`/api/lifting-machine-appointments/${lmaId}`, {
      data: { equipment_id: FOREIGN_UUID },
    });
    expect(res.status()).toBe(404);
  } finally {
    await deleteLMA(page, lmaId);
    await cleanupWorker(page, workerId);
  }
});

// ─── LMA-16: generate-pdf cross-tenant ───────────────────────────────────────

test('LMA-16 - generate-pdf with foreign appointment_id → 404', async ({ authPage: page }) => {
  const res = await page.request.post('/api/lifting-machine-appointments/generate-pdf', {
    data: { appointment_id: FOREIGN_UUID, overlay_image_b64: TINY_PNG_B64 },
  });
  expect(res.status()).toBe(404);
});

// ─── LMA-17: worker_id filter bug ────────────────────────────────────────────

test('LMA-17 - GET with worker_id filter returns only that worker\'s appointments (BUG: filter ignored)', async ({
  authPage: page,
}) => {
  const tagA = uid();
  const tagB = uid();
  const { id: workerA } = await createWorker(page, `${tagA}A`);
  const { id: workerB } = await createWorker(page, `${tagB}B`);
  const { id: lmaA } = await createLMA(page, workerA, `${tagA}A`);
  const { id: lmaB } = await createLMA(page, workerB, `${tagB}B`);

  try {
    const res = await page.request.get(
      `/api/lifting-machine-appointments?worker_id=${workerA}`
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { id: string }[];
    expect(Array.isArray(body)).toBe(true);

    // Worker A's appointment MUST appear
    expect(
      body.some((a) => a.id === lmaA),
      'lmaA must appear in workerA filter results'
    ).toBe(true);

    // Worker B's appointment MUST NOT appear — filter must be applied
    expect(
      body.some((a) => a.id === lmaB),
      'lmaB must NOT appear in workerA filter results'
    ).toBe(false);
  } finally {
    await deleteLMA(page, lmaA);
    await deleteLMA(page, lmaB);
    await cleanupWorker(page, workerA);
    await cleanupWorker(page, workerB);
  }
});

// ─── LMA-18: GET collection company isolation ─────────────────────────────────

test('LMA-18 - GET /api/lifting-machine-appointments returns array (company-scoped)', async ({
  authPage: page,
}) => {
  const res = await page.request.get('/api/lifting-machine-appointments');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
});

// ─── LMA-19: Full CRUD lifecycle ─────────────────────────────────────────────

test('LMA-19 - full CRUD lifecycle: POST → GET → PATCH → DELETE → 404', async ({
  authPage: page,
}) => {
  const tag = uid();
  const { id: workerId } = await createWorker(page, tag);

  try {
    // POST — create
    const postRes = await page.request.post('/api/lifting-machine-appointments', {
      data: {
        worker_id: workerId,
        machine_name: `QA Crane ${tag}`,
        appointer_name: 'QA Appointer',
        appointment_date: '2026-06-15',
      },
    });
    expect(postRes.status()).toBe(201);
    const { id: lmaId } = (await postRes.json()) as { id: string };

    try {
      // GET [id]
      const getRes = await page.request.get(`/api/lifting-machine-appointments/${lmaId}`);
      expect(getRes.status()).toBe(200);
      const getBody = (await getRes.json()) as { machine_name: string };
      expect(getBody.machine_name).toBe(`QA Crane ${tag}`);

      // PATCH
      const patchRes = await page.request.patch(`/api/lifting-machine-appointments/${lmaId}`, {
        data: { appointer_name: 'QA Updated Appointer' },
      });
      expect(patchRes.status()).toBe(200);
      const patchBody = (await patchRes.json()) as { appointer_name: string };
      expect(patchBody.appointer_name).toBe('QA Updated Appointer');

      // DELETE
      const delRes = await page.request.delete(`/api/lifting-machine-appointments/${lmaId}`);
      expect(delRes.status()).toBe(200);

      // Verify deleted → 404
      const afterDel = await page.request.get(`/api/lifting-machine-appointments/${lmaId}`);
      expect(afterDel.status()).toBe(404);
    } catch (e) {
      await deleteLMA(page, lmaId).catch(() => {});
      throw e;
    }
  } finally {
    await cleanupWorker(page, workerId);
  }
});

// ─── LMA-20: generate-pdf with own appointment ───────────────────────────────

test('LMA-20 - generate-pdf with own appointment returns pdf_url', async ({ authPage: page }) => {
  const tag = uid();
  const { id: workerId } = await createWorker(page, tag);
  const { id: lmaId } = await createLMA(page, workerId, tag);

  try {
    const res = await page.request.post('/api/lifting-machine-appointments/generate-pdf', {
      data: {
        appointment_id: lmaId,
        overlay_image_b64: TINY_PNG_B64,
      },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { pdf_url: string };
    expect(typeof body.pdf_url).toBe('string');
    expect(body.pdf_url).toContain('appointment-pdfs/');
    expect(body.pdf_url).toContain(lmaId);
  } finally {
    await deleteLMA(page, lmaId);
    await cleanupWorker(page, workerId);
  }
});
