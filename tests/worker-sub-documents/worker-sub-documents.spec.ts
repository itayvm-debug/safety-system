/**
 * QA Session 09 — Worker Sub-Documents: Manager Licenses + Entity Notes
 *
 * Endpoints:
 *   GET/POST   /api/manager-licenses
 *   GET/PATCH/DELETE /api/manager-licenses/[id]
 *   GET/POST   /api/entity-notes
 *   PATCH/DELETE /api/entity-notes/[id]
 *
 * Coverage:
 *   ML-01..04    Auth boundary — manager-licenses unauthenticated → 401
 *   ML-05..06    Input validation → 400
 *   ML-07        FK injection (POST foreign worker_id) → 404
 *   ML-08..10    Cross-tenant [id] (GET/PATCH/DELETE foreign) → 404
 *   ML-11        GET worker_id param scopes to company (foreign worker → 404)
 *   ML-12        Full CRUD lifecycle
 *   EN-01..04    Auth boundary — entity-notes unauthenticated → 401
 *   EN-05..07    Input validation → 400
 *   EN-08        POST with foreign entity_id → 404
 *   EN-09        GET with foreign entity_id → 404
 *   EN-10..11    [id] PATCH/DELETE foreign note_id → 404
 *   EN-12        invalid entity_type → 400
 *   EN-13        Full lifecycle (POST → PATCH [id] → DELETE [id])
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

async function createWorker(page: Page, tag: string) {
  const national_id = tag.replace(/\D/g, '').slice(-9).padStart(9, '0');
  const res = await page.request.post('/api/workers', {
    data: {
      full_name: `QA SubDoc Worker ${tag}`,
      national_id,
      is_foreign_worker: false,
    },
  });
  expect(res.status(), `createWorker ${tag}`).toBe(201);
  return (await res.json()) as { id: string };
}

async function cleanupWorker(page: Page, workerId: string) {
  await page.request.patch(`/api/workers/${workerId}`, { data: { is_archived: true } });
  await page.request.delete(`/api/workers/${workerId}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// ML: Manager Licenses
// ═══════════════════════════════════════════════════════════════════════════

test('ML-01 - unauthenticated GET /api/manager-licenses → 401', async ({ request }) => {
  const res = await request.get(`/api/manager-licenses?worker_id=${FOREIGN_UUID}`);
  expect(res.status()).toBe(401);
});

test('ML-02 - unauthenticated POST /api/manager-licenses → 401', async ({ request }) => {
  const res = await request.post('/api/manager-licenses', {
    data: { worker_id: FOREIGN_UUID, license_type: 'crane' },
  });
  expect(res.status()).toBe(401);
});

test('ML-03 - unauthenticated GET /api/manager-licenses/[id] → 401', async ({ request }) => {
  const res = await request.get(`/api/manager-licenses/${FOREIGN_UUID}`);
  expect(res.status()).toBe(401);
});

test('ML-04 - unauthenticated PATCH /api/manager-licenses/[id] → 401', async ({ request }) => {
  const res = await request.patch(`/api/manager-licenses/${FOREIGN_UUID}`, {
    data: { license_type: 'forklift' },
  });
  expect(res.status()).toBe(401);
});

test('ML-05 - POST missing worker_id → 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/manager-licenses', {
    data: { license_type: 'crane' },
  });
  expect(res.status()).toBe(400);
});

test('ML-06 - POST missing license_type → 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/manager-licenses', {
    data: { worker_id: FOREIGN_UUID },
  });
  expect(res.status()).toBe(400);
});

test('ML-07 - POST with foreign worker_id → 404', async ({ authPage: page }) => {
  const res = await page.request.post('/api/manager-licenses', {
    data: { worker_id: FOREIGN_UUID, license_type: 'crane' },
  });
  expect(res.status()).toBe(404);
});

test('ML-08 - GET /api/manager-licenses/[foreignId] → 404', async ({ authPage: page }) => {
  const res = await page.request.get(`/api/manager-licenses/${FOREIGN_UUID}`);
  expect(res.status()).toBe(404);
});

test('ML-09 - PATCH /api/manager-licenses/[foreignId] → 404', async ({ authPage: page }) => {
  const res = await page.request.patch(`/api/manager-licenses/${FOREIGN_UUID}`, {
    data: { license_type: 'forklift' },
  });
  expect(res.status()).toBe(404);
});

test('ML-10 - DELETE /api/manager-licenses/[foreignId] → 404', async ({ authPage: page }) => {
  const res = await page.request.delete(`/api/manager-licenses/${FOREIGN_UUID}`);
  expect(res.status()).toBe(404);
});

test('ML-11 - GET with foreign worker_id param → 404 (company ownership enforced)', async ({
  authPage: page,
}) => {
  const res = await page.request.get(`/api/manager-licenses?worker_id=${FOREIGN_UUID}`);
  expect(res.status()).toBe(404);
});

test('ML-12 - full CRUD lifecycle: POST → GET → GET[id] → PATCH[id] → DELETE[id]', async ({
  authPage: page,
}) => {
  const tag = uid();
  const { id: workerId } = await createWorker(page, tag);

  try {
    // POST
    const postRes = await page.request.post('/api/manager-licenses', {
      data: { worker_id: workerId, license_type: 'crane', expiry_date: '2027-06-01' },
    });
    expect(postRes.status()).toBe(201);
    const { id: licId } = (await postRes.json()) as { id: string };

    try {
      // GET collection by worker
      const listRes = await page.request.get(`/api/manager-licenses?worker_id=${workerId}`);
      expect(listRes.status()).toBe(200);
      const list = (await listRes.json()) as { id: string }[];
      expect(list.some(l => l.id === licId)).toBe(true);

      // GET [id]
      const getRes = await page.request.get(`/api/manager-licenses/${licId}`);
      expect(getRes.status()).toBe(200);
      const getBody = (await getRes.json()) as { license_type: string };
      expect(getBody.license_type).toBe('crane');

      // PATCH [id]
      const patchRes = await page.request.patch(`/api/manager-licenses/${licId}`, {
        data: { license_type: 'forklift' },
      });
      expect(patchRes.status()).toBe(200);
      const patchBody = (await patchRes.json()) as { license_type: string };
      expect(patchBody.license_type).toBe('forklift');

      // DELETE [id]
      const delRes = await page.request.delete(`/api/manager-licenses/${licId}`);
      expect(delRes.status()).toBe(200);

      // Verify deleted
      const afterDel = await page.request.get(`/api/manager-licenses/${licId}`);
      expect(afterDel.status()).toBe(404);
    } catch (e) {
      await page.request.delete(`/api/manager-licenses/${licId}`).catch(() => {});
      throw e;
    }
  } finally {
    await cleanupWorker(page, workerId);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EN: Entity Notes
// ═══════════════════════════════════════════════════════════════════════════

test('EN-01 - unauthenticated GET /api/entity-notes → 401', async ({ request }) => {
  const res = await request.get(`/api/entity-notes?entity_type=worker&entity_id=${FOREIGN_UUID}`);
  expect(res.status()).toBe(401);
});

test('EN-02 - unauthenticated POST /api/entity-notes → 401', async ({ request }) => {
  const res = await request.post('/api/entity-notes', {
    data: { entity_type: 'worker', entity_id: FOREIGN_UUID, content: 'test' },
  });
  expect(res.status()).toBe(401);
});

test('EN-03 - unauthenticated PATCH /api/entity-notes/[id] → 401', async ({ request }) => {
  const res = await request.patch(`/api/entity-notes/${FOREIGN_UUID}`, {
    data: { content: 'injected' },
  });
  expect(res.status()).toBe(401);
});

test('EN-04 - unauthenticated DELETE /api/entity-notes/[id] → 401', async ({ request }) => {
  const res = await request.delete(`/api/entity-notes/${FOREIGN_UUID}`);
  expect(res.status()).toBe(401);
});

test('EN-05 - GET missing entity_type → 400', async ({ authPage: page }) => {
  const res = await page.request.get(`/api/entity-notes?entity_id=${FOREIGN_UUID}`);
  expect(res.status()).toBe(400);
});

test('EN-06 - GET invalid entity_type → 400', async ({ authPage: page }) => {
  const res = await page.request.get(`/api/entity-notes?entity_type=banana&entity_id=${FOREIGN_UUID}`);
  expect(res.status()).toBe(400);
});

test('EN-07 - POST missing content → 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/entity-notes', {
    data: { entity_type: 'worker', entity_id: FOREIGN_UUID, content: '' },
  });
  expect(res.status()).toBe(400);
});

test('EN-08 - POST with foreign entity_id → 404', async ({ authPage: page }) => {
  const res = await page.request.post('/api/entity-notes', {
    data: { entity_type: 'worker', entity_id: FOREIGN_UUID, content: 'injected note' },
  });
  expect(res.status()).toBe(404);
});

test('EN-09 - GET with foreign entity_id → 404', async ({ authPage: page }) => {
  const res = await page.request.get(
    `/api/entity-notes?entity_type=worker&entity_id=${FOREIGN_UUID}`
  );
  expect(res.status()).toBe(404);
});

test('EN-10 - PATCH /api/entity-notes/[foreignId] → 404', async ({ authPage: page }) => {
  const res = await page.request.patch(`/api/entity-notes/${FOREIGN_UUID}`, {
    data: { content: 'injected' },
  });
  expect(res.status()).toBe(404);
});

test('EN-11 - DELETE /api/entity-notes/[foreignId] → 404', async ({ authPage: page }) => {
  const res = await page.request.delete(`/api/entity-notes/${FOREIGN_UUID}`);
  expect(res.status()).toBe(404);
});

test('EN-12 - POST with invalid entity_type → 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/entity-notes', {
    data: { entity_type: 'invalid_table', entity_id: FOREIGN_UUID, content: 'test' },
  });
  expect(res.status()).toBe(400);
});

test('EN-13 - entity-notes full lifecycle: POST → GET collection → PATCH[id] → DELETE[id]', async ({
  authPage: page,
}) => {
  const tag = uid();
  const { id: workerId } = await createWorker(page, tag);

  try {
    // POST
    const postRes = await page.request.post('/api/entity-notes', {
      data: { entity_type: 'worker', entity_id: workerId, content: 'QA test note', status: 'ok' },
    });
    expect(postRes.status()).toBe(201);
    const { id: noteId } = (await postRes.json()) as { id: string };

    try {
      // GET collection
      const listRes = await page.request.get(
        `/api/entity-notes?entity_type=worker&entity_id=${workerId}`
      );
      expect(listRes.status()).toBe(200);
      const list = (await listRes.json()) as { id: string }[];
      expect(list.some(n => n.id === noteId)).toBe(true);

      // PATCH [id]
      const patchRes = await page.request.patch(`/api/entity-notes/${noteId}`, {
        data: { content: 'Updated note content', status: 'needs_attention' },
      });
      expect(patchRes.status()).toBe(200);
      const patchBody = (await patchRes.json()) as { content: string; status: string };
      expect(patchBody.content).toBe('Updated note content');
      expect(patchBody.status).toBe('needs_attention');

      // DELETE [id]
      const delRes = await page.request.delete(`/api/entity-notes/${noteId}`);
      expect(delRes.status()).toBe(200);
    } catch (e) {
      await page.request.delete(`/api/entity-notes/${noteId}`).catch(() => {});
      throw e;
    }
  } finally {
    await cleanupWorker(page, workerId);
  }
});
