/**
 * QA Session 08 — Height Restrictions (HR) + Session Company Switch (SWC)
 *
 * Endpoints:
 *   POST/DELETE /api/height-restrictions
 *   POST/DELETE /api/session/company
 *
 * Coverage:
 *   HR-01..02    Auth boundary — unauthenticated → 401
 *   HR-03..04    POST validation — missing fields → 400
 *   HR-05        POST FK injection — foreign worker_id → 404
 *   HR-06        DELETE foreign restriction_id → 404
 *   HR-07        DELETE missing restriction_id → 400
 *   HR-08        Full lifecycle: POST create → DELETE → success
 *   HR-09        POST creates record with correct 1-year expiry window
 *   SWC-01       Unauthenticated POST /api/session/company → 401
 *   SWC-02       POST with foreign company_id → 403
 *   SWC-03       POST with own company_id → 200
 *   SWC-04       POST with missing company_id → 400
 *
 * Safety:
 *   All mutations target Internal QA (Company B) only.
 *   Fixture aborts if active company ≠ Internal QA.
 *   Every test cleans up its own data via finally blocks.
 */

import type { Page } from '@playwright/test';
import { test, expect, uid, readQaMeta } from '../fixtures/workers-auth';

const FOREIGN_UUID = '00000000-0000-0000-0000-000000000099';
const FOREIGN_COMPANY_UUID = '00000000-0000-0000-0000-000000000001';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function createWorker(page: Page, tag: string) {
  const national_id = tag.replace(/\D/g, '').slice(-9).padStart(9, '0');
  const res = await page.request.post('/api/workers', {
    data: {
      full_name: `QA HR Worker ${tag}`,
      national_id,
      is_foreign_worker: false,
    },
  });
  expect(res.status(), `createWorker ${tag}`).toBe(201);
  return (await res.json()) as { id: string };
}

async function createHeightRestriction(page: Page, workerId: string) {
  const res = await page.request.post('/api/height-restrictions', {
    data: { worker_id: workerId, language: 'he' },
  });
  expect(res.status(), 'createHeightRestriction').toBe(201);
  return (await res.json()) as { id: string; issued_at: string; expires_at: string };
}

async function cleanupWorker(page: Page, workerId: string) {
  await page.request.patch(`/api/workers/${workerId}`, { data: { is_archived: true } });
  await page.request.delete(`/api/workers/${workerId}`);
}

// ─── HR-01..02: Auth boundary ────────────────────────────────────────────────

test('HR-01 - unauthenticated POST /api/height-restrictions → 401', async ({ request }) => {
  const res = await request.post('/api/height-restrictions', {
    data: { worker_id: FOREIGN_UUID, language: 'he' },
  });
  expect(res.status()).toBe(401);
});

test('HR-02 - unauthenticated DELETE /api/height-restrictions → 401', async ({ request }) => {
  const res = await request.delete('/api/height-restrictions', {
    data: { restriction_id: FOREIGN_UUID },
  });
  expect(res.status()).toBe(401);
});

// ─── HR-03..04: POST validation ───────────────────────────────────────────────

test('HR-03 - POST missing worker_id → 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/height-restrictions', {
    data: { language: 'he' },
  });
  expect(res.status()).toBe(400);
});

test('HR-04 - POST missing language → 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/height-restrictions', {
    data: { worker_id: FOREIGN_UUID },
  });
  expect(res.status()).toBe(400);
});

// ─── HR-05: FK injection ──────────────────────────────────────────────────────

test('HR-05 - POST with foreign worker_id → 404', async ({ authPage: page }) => {
  const res = await page.request.post('/api/height-restrictions', {
    data: { worker_id: FOREIGN_UUID, language: 'he' },
  });
  expect(res.status()).toBe(404);
});

// ─── HR-06..07: DELETE protection ────────────────────────────────────────────

test('HR-06 - DELETE with foreign restriction_id → 404', async ({ authPage: page }) => {
  const res = await page.request.delete('/api/height-restrictions', {
    data: { restriction_id: FOREIGN_UUID },
  });
  expect(res.status()).toBe(404);
});

test('HR-07 - DELETE missing restriction_id → 400', async ({ authPage: page }) => {
  const res = await page.request.delete('/api/height-restrictions', {
    data: {},
  });
  expect(res.status()).toBe(400);
});

// ─── HR-08: Full lifecycle ────────────────────────────────────────────────────

test('HR-08 - full lifecycle: POST create → DELETE → success', async ({ authPage: page }) => {
  const tag = uid();
  const { id: workerId } = await createWorker(page, tag);

  try {
    // Create height restriction
    const { id: restrictionId } = await createHeightRestriction(page, workerId);

    // Delete it
    const delRes = await page.request.delete('/api/height-restrictions', {
      data: { restriction_id: restrictionId },
    });
    expect(delRes.status()).toBe(200);
    const delBody = (await delRes.json()) as { success: boolean };
    expect(delBody.success).toBe(true);

    // Re-delete should now return 404 (record gone)
    const redelRes = await page.request.delete('/api/height-restrictions', {
      data: { restriction_id: restrictionId },
    });
    expect(redelRes.status()).toBe(404);
  } finally {
    await cleanupWorker(page, workerId);
  }
});

// ─── HR-09: Expiry window ─────────────────────────────────────────────────────

test('HR-09 - POST creates restriction with issued_at now and expires_at ~1 year later', async ({
  authPage: page,
}) => {
  const tag = uid();
  const { id: workerId } = await createWorker(page, tag);

  try {
    const before = new Date();
    const rec = await createHeightRestriction(page, workerId);
    const after = new Date();

    const issuedAt = new Date(rec.issued_at);
    const expiresAt = new Date(rec.expires_at);

    // issued_at must be within the test window
    expect(issuedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 5_000);
    expect(issuedAt.getTime()).toBeLessThanOrEqual(after.getTime() + 5_000);

    // expires_at must be ~1 year after issued_at (within 2-day tolerance)
    const diffMs = expiresAt.getTime() - issuedAt.getTime();
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    expect(diffMs).toBeGreaterThan(oneYearMs - twoDaysMs);
    expect(diffMs).toBeLessThan(oneYearMs + twoDaysMs);

    // Cleanup
    await page.request.delete('/api/height-restrictions', {
      data: { restriction_id: rec.id },
    });
  } finally {
    await cleanupWorker(page, workerId);
  }
});

// ─── SWC-01..04: Session company switch ──────────────────────────────────────

test('SWC-01 - unauthenticated POST /api/session/company → 401', async ({ request }) => {
  const res = await request.post('/api/session/company', {
    data: { company_id: FOREIGN_COMPANY_UUID },
  });
  expect(res.status()).toBe(401);
});

test('SWC-02 - POST /api/session/company with foreign company_id → 403', async ({
  authPage: page,
}) => {
  const res = await page.request.post('/api/session/company', {
    data: { company_id: FOREIGN_COMPANY_UUID },
  });
  expect(res.status()).toBe(403);
});

test('SWC-03 - POST /api/session/company with own company_id → 200', async ({
  authPage: page,
}) => {
  const { companyId } = readQaMeta();
  const res = await page.request.post('/api/session/company', {
    data: { company_id: companyId },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { ok: boolean };
  expect(body.ok).toBe(true);
});

test('SWC-04 - POST /api/session/company missing company_id → 400', async ({
  authPage: page,
}) => {
  const res = await page.request.post('/api/session/company', {
    data: {},
  });
  expect(res.status()).toBe(400);
});
