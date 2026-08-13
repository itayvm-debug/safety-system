/**
 * QA Session 10 — Application-Wide Security & Integration Audit
 *
 * Covers systemic defects that individual module suites may miss:
 *   SS-01..08   Storage isolation (signed-url, upload)
 *   FK-01..08   Cross-company FK injection integration scenarios
 *   AL-01..02   Alerts company scoping
 *   SC-01..02   Session/company API isolation
 *   SF-01..03   Site-feedback auth boundary
 *   RP-01..02   Reports auth boundary
 *   AI-01..04   AI extraction auth + storage isolation (CF-01 regression)
 *   INT-01..04  Cross-entity integration lifecycle
 *
 * Safety:
 *   All mutations target Company B = Internal QA only.
 *   Fixture aborts if active company ≠ Internal QA.
 *   Every test cleans up its own data.
 */

import type { Page } from '@playwright/test';
import { test, expect, uid } from '../fixtures/workers-auth';

const FOREIGN_UUID = '00000000-0000-0000-0000-000000000099';
// A path that looks valid in format but belongs to no company
const NONEXISTENT_PATH = 'documents/99999999-fake-qa-path-00000000.jpg';
// Path traversal attempts
const TRAVERSAL_PATH = '../../../etc/passwd';
const ENCODED_TRAVERSAL = '%2e%2e%2f%2e%2e%2fetc%2fpasswd';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function createWorker(page: Page, tag: string) {
  const national_id = tag.replace(/\D/g, '').slice(-9).padStart(9, '0');
  const res = await page.request.post('/api/workers', {
    data: { full_name: `QA SecAudit Worker ${tag}`, national_id, is_foreign_worker: false },
  });
  expect(res.status(), `createWorker ${tag}`).toBe(201);
  return (await res.json()) as { id: string };
}

async function cleanupWorker(page: Page, workerId: string) {
  await page.request.patch(`/api/workers/${workerId}`, { data: { is_archived: true } });
  await page.request.delete(`/api/workers/${workerId}`);
}

async function createHeavyEquipment(page: Page, tag: string) {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: `QA SecAudit HE ${tag}` },
  });
  expect(res.status(), `createHeavyEquipment ${tag}`).toBe(201);
  return (await res.json()) as { id: string };
}

async function cleanupHeavyEquipment(page: Page, heId: string) {
  await page.request.patch(`/api/heavy-equipment/${heId}`, { data: { is_archived: true } });
  await page.request.delete(`/api/heavy-equipment/${heId}`);
}


// ═══════════════════════════════════════════════════════════════════════════
// SS: Storage Isolation (signed-url + upload)
// ═══════════════════════════════════════════════════════════════════════════

test('SS-01 - unauthenticated GET /api/signed-url → 401', async ({ request }) => {
  const res = await request.get(`/api/signed-url?path=${NONEXISTENT_PATH}`);
  expect(res.status()).toBe(401);
});

test('SS-02 - GET /api/signed-url with nonexistent clean path → 403', async ({ authPage: page }) => {
  const res = await page.request.get(`/api/signed-url?path=${NONEXISTENT_PATH}`);
  expect(res.status()).toBe(403);
});

test('SS-03 - GET /api/signed-url with path traversal → 403', async ({ authPage: page }) => {
  const res = await page.request.get(`/api/signed-url?path=${encodeURIComponent(TRAVERSAL_PATH)}`);
  expect(res.status()).toBe(403);
});

test('SS-04 - GET /api/signed-url with double-encoded traversal → 403', async ({ authPage: page }) => {
  const res = await page.request.get(`/api/signed-url?path=${ENCODED_TRAVERSAL}`);
  expect(res.status()).toBe(403);
});

test('SS-05 - unauthenticated DELETE /api/upload → 401', async ({ request }) => {
  const res = await request.delete(`/api/upload?path=${NONEXISTENT_PATH}`);
  expect(res.status()).toBe(401);
});

test('SS-06 - DELETE /api/upload with missing path → 400', async ({ authPage: page }) => {
  const res = await page.request.delete('/api/upload');
  expect(res.status()).toBe(400);
});

test('SS-07 - DELETE /api/upload with path traversal → 403', async ({ authPage: page }) => {
  const res = await page.request.delete(
    `/api/upload?path=${encodeURIComponent(TRAVERSAL_PATH)}`
  );
  expect(res.status()).toBe(403);
});

test('SS-08 - POST /api/upload unauthenticated → 401', async ({ request }) => {
  const formData = new FormData();
  formData.append('folder', 'documents');
  const res = await request.post('/api/upload', { multipart: { folder: 'documents' } });
  expect(res.status()).toBe(401);
});

// ═══════════════════════════════════════════════════════════════════════════
// FK: Cross-company FK injection — integration scenarios
// ═══════════════════════════════════════════════════════════════════════════

test('FK-01 - POST /api/documents with foreign worker_id → 404', async ({ authPage: page }) => {
  const res = await page.request.post('/api/documents', {
    data: { worker_id: FOREIGN_UUID, doc_type: 'id_document' },
  });
  expect(res.status()).toBe(404);
});

test('FK-02 - DELETE /api/safety-briefings with foreign briefing_id → 404', async ({
  authPage: page,
}) => {
  const res = await page.request.delete('/api/safety-briefings', {
    data: { briefing_id: FOREIGN_UUID },
  });
  expect(res.status()).toBe(404);
});

test('FK-03 - PATCH own worker with foreign subcontractor_id → 404', async ({ authPage: page }) => {
  const tag = uid();
  const { id: workerId } = await createWorker(page, tag);
  try {
    const res = await page.request.patch(`/api/workers/${workerId}`, {
      data: { subcontractor_id: FOREIGN_UUID },
    });
    expect(res.status()).toBe(404);
  } finally {
    await cleanupWorker(page, workerId);
  }
});

test('FK-04 - POST /api/heavy-equipment with foreign subcontractor_id → 404', async ({
  authPage: page,
}) => {
  const tag = uid();
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: `QA FK-04 ${tag}`, subcontractor_id: FOREIGN_UUID },
  });
  expect(res.status()).toBe(404);
});

test('FK-05 - PATCH own heavy-equipment with foreign subcontractor_id → 404', async ({
  authPage: page,
}) => {
  const tag = uid();
  const { id: heId } = await createHeavyEquipment(page, tag);
  try {
    const res = await page.request.patch(`/api/heavy-equipment/${heId}`, {
      data: { subcontractor_id: FOREIGN_UUID },
    });
    expect(res.status()).toBe(404);
  } finally {
    await cleanupHeavyEquipment(page, heId);
  }
});

test('FK-06 - POST /api/vehicles with foreign assigned_manager_id → 422', async ({
  authPage: page,
}) => {
  const tag = uid();
  const res = await page.request.post('/api/vehicles', {
    data: {
      vehicle_type: 'truck',
      vehicle_number: `QA${tag.replace(/\D/g, '').slice(-8)}`,
      assigned_manager_id: FOREIGN_UUID,
    },
  });
  expect(res.status()).toBe(422);
});

test('FK-07 - POST /api/documents DELETE with foreign doc_id → 404', async ({
  authPage: page,
}) => {
  const res = await page.request.delete('/api/documents', {
    data: { doc_id: FOREIGN_UUID },
  });
  expect(res.status()).toBe(404);
});

test('FK-08 - PATCH own lifting-equipment with foreign subcontractor_id → 404', async ({
  authPage: page,
}) => {
  // Create own lifting equipment first
  const tag = uid();
  const createRes = await page.request.post('/api/lifting-equipment', {
    data: { description: `QA FK-08 ${tag}`, equipment_type: 'crane' },
  });
  expect(createRes.status()).toBe(201);
  const { id: leId } = (await createRes.json()) as { id: string };

  try {
    const patchRes = await page.request.patch(`/api/lifting-equipment/${leId}`, {
      data: { subcontractor_id: FOREIGN_UUID },
    });
    expect(patchRes.status()).toBe(404);
  } finally {
    await page.request.patch(`/api/lifting-equipment/${leId}`, { data: { is_archived: true } });
    await page.request.delete(`/api/lifting-equipment/${leId}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// AL: Alerts company scoping
// ═══════════════════════════════════════════════════════════════════════════

test('AL-01 - unauthenticated GET /api/alerts → 401', async ({ request }) => {
  const res = await request.get('/api/alerts');
  expect(res.status()).toBe(401);
});

test('AL-02 - GET /api/alerts authenticated → 200 with array', async ({ authPage: page }) => {
  const res = await page.request.get('/api/alerts');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
});

// ═══════════════════════════════════════════════════════════════════════════
// SC: Session / company API isolation
// ═══════════════════════════════════════════════════════════════════════════

test('SC-01 - unauthenticated GET /api/session/companies → 401', async ({ request }) => {
  const res = await request.get('/api/session/companies');
  expect(res.status()).toBe(401);
});

test('SC-02 - GET /api/session/companies → 200 with companies array', async ({
  authPage: page,
}) => {
  const res = await page.request.get('/api/session/companies');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { companies: unknown[]; activeCompanyId: string | null };
  expect(Array.isArray(body.companies)).toBe(true);
  expect(body.companies.length).toBeGreaterThan(0);
  // Verify session/companies response contains user's own company info
  expect(body).toHaveProperty('activeCompanyId');
});

// ═══════════════════════════════════════════════════════════════════════════
// SF: Site feedback auth boundary
// ═══════════════════════════════════════════════════════════════════════════

test('SF-01 - unauthenticated GET /api/site-feedback → 401', async ({ request }) => {
  const res = await request.get('/api/site-feedback');
  expect(res.status()).toBe(401);
});

test('SF-02 - GET /api/site-feedback returns data (QA user is platform-admin) or 403 (company-only user)', async ({
  authPage: page,
}) => {
  const res = await page.request.get('/api/site-feedback');
  // QA user is provisioned with platform-admin role → 200
  // A pure company-user would get 403. Verify it's NOT 401 (auth works).
  expect([200, 403]).toContain(res.status());
});

test('SF-03 - unauthenticated POST /api/site-feedback → 401', async ({ request }) => {
  const res = await request.post('/api/site-feedback', {
    data: { full_name: 'Test', subject: 'Test', content: 'Test content' },
  });
  expect(res.status()).toBe(401);
});

// ═══════════════════════════════════════════════════════════════════════════
// RP: Reports auth boundary
// ═══════════════════════════════════════════════════════════════════════════

test('RP-01 - GET /api/reports/weekly-status without CRON_SECRET → 401', async ({ request }) => {
  const res = await request.get('/api/reports/weekly-status');
  expect(res.status()).toBe(401);
});

test('RP-02 - GET /api/reports/weekly-status with wrong secret → 401', async ({ request }) => {
  const res = await request.get('/api/reports/weekly-status', {
    headers: { authorization: 'Bearer wrong-secret' },
  });
  expect(res.status()).toBe(401);
});

test('RP-03 - unauthenticated POST /api/reports/weekly-status → 401', async ({ request }) => {
  const res = await request.post('/api/reports/weekly-status', {
    data: { test_email: 'test@example.com' },
  });
  expect(res.status()).toBe(401);
});

// ═══════════════════════════════════════════════════════════════════════════
// AI: Extract-worker-identity auth + storage isolation
// ═══════════════════════════════════════════════════════════════════════════

test('AI-01 - unauthenticated POST /api/ai/extract-worker-identity → 401', async ({ request }) => {
  const res = await request.post('/api/ai/extract-worker-identity', {
    data: { path: NONEXISTENT_PATH, document_type: 'israeli_id' },
  });
  expect(res.status()).toBe(401);
});

test('AI-02 - POST /api/ai/extract-worker-identity with path traversal → 404 (CF-01 resolved)', async ({
  authPage: page,
}) => {
  const res = await page.request.post('/api/ai/extract-worker-identity', {
    data: { path: TRAVERSAL_PATH, document_type: 'israeli_id' },
  });
  // normalizeStoragePath runs BEFORE the ANTHROPIC_API_KEY guard (CF-01 fix).
  // Traversal paths are always rejected with 404 regardless of API key availability.
  expect(res.status()).toBe(404);
});

test('AI-03 - POST /api/ai/extract-worker-identity with foreign path → 404 or ai_unavailable (no data exposed)', async ({
  authPage: page,
}) => {
  const res = await page.request.post('/api/ai/extract-worker-identity', {
    data: { path: NONEXISTENT_PATH, document_type: 'israeli_id' },
  });
  // Valid-format path: passes normalizeStoragePath → hits apiKey guard.
  // When no API key configured (test environment): 200 + ai_unavailable.
  // When API key is set: authorizeStorageObjectAccess returns 404.
  if (res.status() === 200) {
    const body = (await res.json()) as { success: boolean; error?: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe('ai_unavailable');
  } else {
    expect(res.status()).toBe(404);
  }
});

test('AI-04 - CF-01 regression: traversal path rejected even when ANTHROPIC_API_KEY is absent', async ({
  authPage: page,
}) => {
  // This test proves CF-01 is resolved. It runs in the test environment where
  // ANTHROPIC_API_KEY is NOT set. Before the fix, both paths below returned
  // 200 + {success:false, error:'ai_unavailable'} because the early return fired
  // before normalizeStoragePath. After the fix, normalizeStoragePath runs first
  // and rejects traversal with 404 regardless of API key state.

  // Raw traversal
  const res1 = await page.request.post('/api/ai/extract-worker-identity', {
    data: { path: TRAVERSAL_PATH, document_type: 'israeli_id' },
  });
  expect(res1.status(), 'raw traversal path must be rejected with 404').toBe(404);

  // Double-encoded traversal
  const res2 = await page.request.post('/api/ai/extract-worker-identity', {
    data: { path: ENCODED_TRAVERSAL, document_type: 'israeli_id' },
  });
  expect(res2.status(), 'double-encoded traversal path must be rejected with 404').toBe(404);
});

// ═══════════════════════════════════════════════════════════════════════════
// INT: Cross-entity integration lifecycle
// ═══════════════════════════════════════════════════════════════════════════

test('INT-01 - Worker → Document: create document scoped to own worker, verify company isolation', async ({
  authPage: page,
}) => {
  const tag = uid();
  const { id: workerId } = await createWorker(page, tag);
  try {
    // POST document on own worker
    const docRes = await page.request.post('/api/documents', {
      data: { worker_id: workerId, doc_type: 'id_document' },
    });
    expect(docRes.status()).toBe(200); // upsert returns 200 for id_document
    const doc = (await docRes.json()) as { id: string; company_id: string };
    expect(doc).toHaveProperty('id');

    // Verify foreign worker_id rejected for same doc_type
    const foreignDocRes = await page.request.post('/api/documents', {
      data: { worker_id: FOREIGN_UUID, doc_type: 'id_document' },
    });
    expect(foreignDocRes.status()).toBe(404);
  } finally {
    await cleanupWorker(page, workerId);
  }
});

test('INT-02 - Worker → Safety Briefing → Verify DELETE cross-tenant protection', async ({
  authPage: page,
}) => {
  const tag = uid();
  const { id: workerId } = await createWorker(page, tag);
  try {
    // POST briefing on own worker
    const briefingRes = await page.request.post('/api/safety-briefings', {
      data: {
        worker_id: workerId,
        mode: 'external',
        briefed_at: new Date().toISOString().slice(0, 10),
      },
    });
    expect(briefingRes.status()).toBe(200);
    const briefing = (await briefingRes.json()) as { id: string };

    try {
      // Verify foreign briefing_id is rejected on DELETE
      const delForeignRes = await page.request.delete('/api/safety-briefings', {
        data: { briefing_id: FOREIGN_UUID },
      });
      expect(delForeignRes.status()).toBe(404);

      // Delete own briefing — should succeed
      const delOwnRes = await page.request.delete('/api/safety-briefings', {
        data: { briefing_id: briefing.id },
      });
      expect(delOwnRes.status()).toBe(200);
    } catch (e) {
      // cleanup if assertion failed mid-test
      await page.request.delete('/api/safety-briefings', { data: { briefing_id: briefing.id } }).catch(() => {});
      throw e;
    }
  } finally {
    await cleanupWorker(page, workerId);
  }
});

test('INT-03 - Vehicle → FK injection → assigned_manager from foreign company rejected', async ({
  authPage: page,
}) => {
  const tag = uid();
  const vehicle_number = `QA${tag.replace(/\D/g, '').slice(-8)}`;

  // Attempt to assign foreign worker as manager
  const res = await page.request.post('/api/vehicles', {
    data: { vehicle_type: 'truck', vehicle_number, assigned_manager_id: FOREIGN_UUID },
  });
  expect(res.status()).toBe(422);

  // Verify vehicle was NOT created (clean path)
  const listRes = await page.request.get('/api/vehicles');
  expect(listRes.status()).toBe(200);
  const vehicles = (await listRes.json()) as { vehicle_number: string }[];
  expect(vehicles.some(v => v.vehicle_number === vehicle_number)).toBe(false);
});

test('INT-04 - Heavy Equipment → subcontractor chain: foreign sub rejected at POST and PATCH', async ({
  authPage: page,
}) => {
  const tag = uid();
  // POST with foreign subcontractor_id → 404
  const createForeignRes = await page.request.post('/api/heavy-equipment', {
    data: { description: `QA INT-04 ${tag}`, subcontractor_id: FOREIGN_UUID },
  });
  expect(createForeignRes.status()).toBe(404);

  // Create own equipment without subcontractor
  const { id: heId } = await createHeavyEquipment(page, `${tag}b`);
  try {
    // PATCH with foreign subcontractor_id → 404
    const patchForeignRes = await page.request.patch(`/api/heavy-equipment/${heId}`, {
      data: { subcontractor_id: FOREIGN_UUID },
    });
    expect(patchForeignRes.status()).toBe(404);

    // PATCH with null (clear) → 200
    const clearRes = await page.request.patch(`/api/heavy-equipment/${heId}`, {
      data: { subcontractor_id: null },
    });
    expect(clearRes.status()).toBe(200);
  } finally {
    await cleanupHeavyEquipment(page, heId);
  }
});
