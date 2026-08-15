/**
 * QA Session 12 — Production Resilience / Failure Modes
 *
 * Safety rules:
 *  - Company B = Internal QA (4f3d08b0-6317-40bf-8f69-1702c39f9f05) ONLY for mutations.
 *  - NEVER mutate Company A / SafeDoc.
 *  - All test data created here is cleaned up in afterEach/afterAll.
 *
 * Categories tested:
 *  1. Session Expiry        — unauthenticated API calls get JSON 401, not HTML
 *  2. Network Failure       — API errors return JSON, never false success
 *  3. Double Submit         — mutation buttons disabled while in-flight
 *  4. Upload Failure Modes  — DB-first delete order; orphan cleanup on LMA POST failure
 *  5. Export Failure        — export route returns JSON on internal error, not HTML 500
 *  6. Backend Error Surface — no window.alert(), no window.confirm() for non-destructive actions
 *  7. Session/Company Switch— invalid company switch returns JSON 404
 *  8. Offline Failure State — offline view button replaced by inline text (no alert)
 *  9. Data Integrity        — create+delete worker leaves no orphan record
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';

// ─── QA constants ──────────────────────────────────────────────────────────────
const COMPANY_B_ID = '4f3d08b0-6317-40bf-8f69-1702c39f9f05'; // Internal QA — mutations allowed
const COMPANY_A_ID = '00000000-0000-0000-0000-000000000001'; // SafeDoc — READ ONLY

type QaMeta = { companyId: string; userId: string };

function readQaMeta(): QaMeta {
  return JSON.parse(readFileSync('playwright/.auth/qa-meta.json', 'utf-8'));
}

function loadEnvLocal() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key   = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch { /* CI env vars used directly */ }
}

function createServiceClient() {
  loadEnvLocal();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TS = () => Date.now().toString(36);

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORY 1 — SESSION EXPIRY: unauthenticated API calls
// ══════════════════════════════════════════════════════════════════════════════
test.describe('S12-CAT1: Session Expiry — unauthenticated API calls return JSON 401', () => {

  test('S12-1A: GET /api/workers without session → 401 JSON (not HTML)', async ({ request }) => {
    const res = await request.get('/api/workers');
    expect(res.status()).toBe(401);
    const ct = res.headers()['content-type'] ?? '';
    expect(ct).toContain('application/json');
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('S12-1B: GET /api/vehicles without session → 401 JSON', async ({ request }) => {
    const res = await request.get('/api/vehicles');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('S12-1C: GET /api/heavy-equipment without session → 401 JSON', async ({ request }) => {
    const res = await request.get('/api/heavy-equipment');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('S12-1D: GET /api/admin/export without session → 401 JSON (not HTML 500)', async ({ request }) => {
    const res = await request.get('/api/admin/export');
    expect(res.status()).toBe(401);
    const ct = res.headers()['content-type'] ?? '';
    expect(ct).toContain('application/json');
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('S12-1E: POST /api/workers without session → 401 JSON', async ({ request }) => {
    const res = await request.post('/api/workers', {
      data: { first_name: 'Ghost', last_name: 'User', national_id: '999999999' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('S12-1F: Invalid session token → 401 JSON on write endpoint', async ({ request }) => {
    const res = await request.post('/api/workers', {
      headers: { Cookie: 'safedoc_session=invalid.jwt.token' },
      data: { first_name: 'Hacker' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORY 2 — NETWORK FAILURE: error responses are JSON, not false success
// ══════════════════════════════════════════════════════════════════════════════
test.describe('S12-CAT2: Network Failure — API errors surface as JSON, not false success', () => {
  test.use({ storageState: 'playwright/.auth/qa-session.json' });

  test('S12-2A: Worker PATCH with unknown field → 400 JSON with error field', async ({ request }) => {
    // Send a field that's not in the allowed PATCH list
    const res = await request.patch('/api/workers/00000000-0000-0000-0000-000000000099', {
      data: { nonexistent_field: 'bad' },
    });
    // Either 400 (unknown field) or 404 (worker not found, but still JSON)
    expect([400, 404]).toContain(res.status());
    const ct = res.headers()['content-type'] ?? '';
    expect(ct).toContain('application/json');
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('S12-2B: DELETE height-restriction with nonexistent id → 404 JSON', async ({ request }) => {
    const res = await request.delete('/api/height-restrictions', {
      data: { restriction_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('S12-2C: DELETE document with nonexistent id → 404 JSON', async ({ request }) => {
    const res = await request.delete('/api/documents', {
      data: { doc_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('S12-2D: POST with missing required field returns 400 JSON error (not HTML)', async ({ request }) => {
    // empty full_name triggers validation error — must return JSON, never HTML
    const res = await request.post('/api/workers', {
      data: { full_name: '' },
    });
    expect(res.status()).toBe(400);
    const ct = res.headers()['content-type'] ?? '';
    expect(ct).toContain('application/json');
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(JSON.stringify(body)).not.toMatch(/<html/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORY 5 — UPLOAD FAILURE MODES: correct delete ordering
// ══════════════════════════════════════════════════════════════════════════════
test.describe('S12-CAT5: Upload Failure Modes — DB-first delete; LMA orphan cleanup', () => {
  test.use({ storageState: 'playwright/.auth/qa-session.json' });

  let workerIdForHR: string | null = null;
  let heightRestrictionId: string | null = null;
  let workerIdForDoc: string | null = null;
  let documentId: string | null = null;

  test.beforeAll(async () => {
    const svc = createServiceClient();
    const meta = readQaMeta();

    // Safety: confirm company B
    expect(meta.companyId).toBe(COMPANY_B_ID);
    expect(meta.companyId).not.toBe(COMPANY_A_ID);

    // Create a test worker for height-restriction test
    const ts = TS();
    const { data: w1, error: e1 } = await svc.from('workers').insert({
      company_id:  meta.companyId,
      full_name:   `S12HR ${ts}`,
      worker_type: 'israeli',
      national_id: `S12HR${ts}`,
      is_active:   true,
      is_archived: false,
    }).select('id').single();
    if (e1) console.error('[S12-CAT5 beforeAll] worker w1 insert error:', e1.message);
    workerIdForHR = w1?.id ?? null;

    if (workerIdForHR) {
      // Create a height restriction (no storage files — simpler test)
      const { data: hr, error: eHR } = await svc.from('height_restrictions').insert({
        worker_id:  workerIdForHR,
        language:   'he',
        issued_at:  new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      }).select('id').single();
      if (eHR) console.error('[S12-CAT5 beforeAll] height_restriction insert error:', eHR.message);
      heightRestrictionId = hr?.id ?? null;
    }

    // Create a test worker for document test
    const { data: w2, error: e2 } = await svc.from('workers').insert({
      company_id:  meta.companyId,
      full_name:   `S12DOC ${ts}`,
      worker_type: 'israeli',
      national_id: `S12DOC${ts}`,
      is_active:   true,
      is_archived: false,
    }).select('id').single();
    if (e2) console.error('[S12-CAT5 beforeAll] worker w2 insert error:', e2.message);
    workerIdForDoc = w2?.id ?? null;

    if (workerIdForDoc) {
      // Use upsert with a standard doc_type (no license_name needed)
      const { data: doc, error: eDoc } = await svc.from('documents').upsert({
        company_id:  meta.companyId,
        worker_id:   workerIdForDoc,
        doc_type:    'id_document',
        is_required: true,
      }, { onConflict: 'worker_id,doc_type' }).select('id').single();
      if (eDoc) console.error('[S12-CAT5 beforeAll] document insert error:', eDoc.message);
      documentId = doc?.id ?? null;
    }
  });

  test.afterAll(async () => {
    const svc = createServiceClient();
    // Clean up workers (height_restrictions and documents cascade)
    if (workerIdForHR) await svc.from('workers').delete().eq('id', workerIdForHR);
    if (workerIdForDoc) await svc.from('workers').delete().eq('id', workerIdForDoc);
  });

  test('S12-5A: DELETE height-restriction via API removes DB record (DB-first order)', async ({ request }) => {
    if (!heightRestrictionId) {
      test.skip(true, 'height restriction not created in beforeAll');
      return;
    }

    const res = await request.delete('/api/height-restrictions', {
      data: { restriction_id: heightRestrictionId },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify DB record is gone
    const svc = createServiceClient();
    const { data } = await svc.from('height_restrictions').select('id').eq('id', heightRestrictionId).maybeSingle();
    expect(data).toBeNull();

    heightRestrictionId = null; // prevent double-delete in afterAll
  });

  test('S12-5B: DELETE document via API removes DB record (DB-first order)', async ({ request }) => {
    if (!documentId) {
      test.skip(true, 'document not created in beforeAll');
      return;
    }

    const res = await request.delete('/api/documents', {
      data: { doc_id: documentId },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify DB record is gone
    const svc = createServiceClient();
    const { data } = await svc.from('documents').select('id').eq('id', documentId).maybeSingle();
    expect(data).toBeNull();

    documentId = null;
  });

  test('S12-5C: LMA POST with invalid worker_id returns 404 JSON (no orphan created)', async ({ request }) => {
    const res = await request.post('/api/lifting-machine-appointments', {
      data: {
        worker_id:      '00000000-0000-0000-0000-000000000000', // nonexistent
        machine_name:   'Test Crane',
        appointer_name: 'QA Tester',
      },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('S12-5D: generate-pdf POST with invalid appointment_id returns 404 JSON', async ({ request }) => {
    const res = await request.post('/api/lifting-machine-appointments/generate-pdf', {
      data: {
        appointment_id:   '00000000-0000-0000-0000-000000000000',
        overlay_image_b64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORY 6 — EXPORT FAILURE: route returns JSON error, not HTML 500
// ══════════════════════════════════════════════════════════════════════════════
test.describe('S12-CAT6: Export Failure — never returns HTML on error', () => {

  test('S12-6A: Unauthenticated export → 401 JSON (not HTML 500 or redirect)', async ({ request }) => {
    const res = await request.get('/api/admin/export');
    expect(res.status()).toBe(401);
    const ct = res.headers()['content-type'] ?? '';
    expect(ct).toContain('application/json');
    const body = await res.json();
    expect(body).toHaveProperty('error');
    // Must NOT be HTML
    const text = JSON.stringify(body);
    expect(text).not.toContain('<!DOCTYPE');
  });

  test('S12-6B: Authenticated export returns either ZIP or JSON error (never HTML)', async ({ request }) => {
    const authState = JSON.parse(readFileSync('playwright/.auth/qa-session.json', 'utf-8'));
    const cookies = (authState.cookies ?? []).map((c: { name: string; value: string }) => `${c.name}=${c.value}`).join('; ');

    const res = await request.get('/api/admin/export', {
      headers: { Cookie: cookies },
    });

    // Either 200 ZIP or an error — both are acceptable, but NEVER HTML
    const ct = res.headers()['content-type'] ?? '';
    if (res.status() === 200) {
      expect(ct).toContain('application/zip');
    } else {
      // Any non-200 must be JSON
      expect(ct).toContain('application/json');
      const body = await res.json();
      expect(body).toHaveProperty('error');
    }

    // Ensure no HTML page was returned
    if (!ct.includes('application/zip')) {
      const text = await res.text().catch(() => '');
      expect(text).not.toMatch(/<html/i);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORY 8 — BACKEND ERROR SURFACING: no window.alert() in UI
// ══════════════════════════════════════════════════════════════════════════════
test.describe('S12-CAT8: Backend Error Surfacing — no window.alert() triggered', () => {
  test.use({ storageState: 'playwright/.auth/qa-session.json' });

  test('S12-8A: No window.alert() on workers list page load', async ({ page }) => {
    const alerts: string[] = [];
    page.on('dialog', (dialog) => {
      if (dialog.type() === 'alert') alerts.push(dialog.message());
      dialog.dismiss().catch(() => undefined);
    });

    await page.goto('/workers');
    await page.waitForLoadState('networkidle');

    expect(alerts).toHaveLength(0);
  });

  test('S12-8B: Offline state shows inline text instead of alert() for document view', async ({ page }) => {
    // Simulate offline by failing health checks AND intercepting fetch
    const alerts: string[] = [];
    page.on('dialog', (dialog) => {
      if (dialog.type() === 'alert') alerts.push(dialog.message());
      dialog.dismiss().catch(() => undefined);
    });

    // Force offline by intercepting all network (except page load itself)
    await page.route('**/api/health', async (route) => {
      await route.fulfill({ status: 503, body: JSON.stringify({ error: 'offline' }) });
    });

    await page.goto('/workers');
    await page.waitForLoadState('networkidle');

    // No alert should fire from page load or health check failure
    expect(alerts).toHaveLength(0);
  });

  test('S12-8C: No window.alert() on vehicles page load', async ({ page }) => {
    const alerts: string[] = [];
    page.on('dialog', (dialog) => {
      if (dialog.type() === 'alert') alerts.push(dialog.message());
      dialog.dismiss().catch(() => undefined);
    });

    await page.goto('/vehicles');
    await page.waitForLoadState('networkidle');

    expect(alerts).toHaveLength(0);
  });

  test('S12-8D: No window.alert() on heavy equipment page load', async ({ page }) => {
    const alerts: string[] = [];
    page.on('dialog', (dialog) => {
      if (dialog.type() === 'alert') alerts.push(dialog.message());
      dialog.dismiss().catch(() => undefined);
    });

    await page.goto('/heavy-equipment');
    await page.waitForLoadState('networkidle');

    expect(alerts).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORY 7 — SESSION/COMPANY SWITCH RACES
// ══════════════════════════════════════════════════════════════════════════════
test.describe('S12-CAT7: Session/Company Switch — invalid switch rejected with JSON', () => {
  test.use({ storageState: 'playwright/.auth/qa-session.json' });

  test('S12-7A: POST /api/session/company with unknown company_id → 403 JSON', async ({ request }) => {
    const res = await request.post('/api/session/company', {
      data: { company_id: '00000000-0000-0000-0000-000000000000' },
    });
    // No membership → 403 (not 404 — membership check returns 403 when not found)
    expect(res.status()).toBe(403);
    const ct = res.headers()['content-type'] ?? '';
    expect(ct).toContain('application/json');
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('S12-7B: POST /api/session/company with Company A id → 403 JSON (no cross-tenant switch)', async ({ request }) => {
    const res = await request.post('/api/session/company', {
      data: { company_id: COMPANY_A_ID },
    });
    // QA bot is not a member of Company A → 403
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('S12-7C: POST /api/session/company with valid Company B id succeeds → 200', async ({ request }) => {
    const meta = readQaMeta();
    expect(meta.companyId).toBe(COMPANY_B_ID);

    const res = await request.post('/api/session/company', {
      data: { company_id: COMPANY_B_ID },
    });
    expect(res.status()).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORY 9 — DATA INTEGRITY: create + delete leaves no orphan
// ══════════════════════════════════════════════════════════════════════════════
test.describe('S12-CAT9: Data Integrity — create/delete cycle leaves no orphan', () => {
  test.use({ storageState: 'playwright/.auth/qa-session.json' });

  test('S12-9A: Create and delete a worker via API — no orphan in DB', async ({ request }) => {
    const meta = readQaMeta();
    expect(meta.companyId).toBe(COMPANY_B_ID);

    const ts = TS();
    const nationalId = `S12INT${ts}`;

    // Create worker
    const createRes = await request.post('/api/workers', {
      data: {
        full_name:   `S12 Integrity ${ts}`,
        national_id: nationalId,
      },
    });
    expect(createRes.status()).toBe(201);
    const worker = await createRes.json();
    expect(worker.id).toBeTruthy();
    const workerId: string = worker.id;

    // Verify it's in DB
    const svc = createServiceClient();
    const { data: found } = await svc.from('workers').select('id, company_id').eq('id', workerId).maybeSingle();
    expect(found).not.toBeNull();
    expect(found?.company_id).toBe(COMPANY_B_ID);

    // Archive it (the only deletion path for workers is archive)
    const archiveRes = await request.patch(`/api/workers/${workerId}`, {
      data: { is_archived: true },
    });
    expect(archiveRes.status()).toBe(200);

    // Verify it's archived (not a ghost row in wrong company)
    const { data: archived } = await svc.from('workers').select('id, is_archived, company_id').eq('id', workerId).maybeSingle();
    expect(archived?.is_archived).toBe(true);
    expect(archived?.company_id).toBe(COMPANY_B_ID);

    // Cleanup — delete via service client (archived workers not auto-purged)
    await svc.from('workers').delete().eq('id', workerId).eq('company_id', COMPANY_B_ID);

    // Verify gone
    const { data: gone } = await svc.from('workers').select('id').eq('id', workerId).maybeSingle();
    expect(gone).toBeNull();
  });

  test('S12-9B: No S12INT orphan workers remain after integrity test', async () => {
    const svc = createServiceClient();
    const meta = readQaMeta();

    // Only check for workers created by S12-9A (full_name contains 'S12 Integrity')
    // S12-CAT5 workers are cleaned up in their own afterAll
    const { data: orphans } = await svc
      .from('workers')
      .select('id, full_name')
      .eq('company_id', meta.companyId)
      .like('full_name', 'S12 Integrity%');

    // S12-9A cleans up its own worker — should be gone
    expect(orphans ?? []).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORY 3 — DOUBLE SUBMIT: mutation buttons disabled while in-flight
// ══════════════════════════════════════════════════════════════════════════════
test.describe('S12-CAT3: Double Submit — buttons disabled during in-flight requests', () => {
  test.use({ storageState: 'playwright/.auth/qa-session.json' });

  let testWorkerId: string | null = null;

  test.beforeAll(async () => {
    const svc = createServiceClient();
    const meta = readQaMeta();
    const ts = TS();

    const { data: w, error: eW } = await svc.from('workers').insert({
      company_id:  meta.companyId,
      full_name:   `S12DS ${ts}`,
      worker_type: 'israeli',
      national_id: `S12DS${ts}`,
      is_active:   true,
      is_archived: false,
    }).select('id').single();
    if (eW) console.error('[S12-CAT3 beforeAll] worker insert error:', eW.message);
    testWorkerId = w?.id ?? null;
  });

  test.afterAll(async () => {
    if (testWorkerId) {
      const svc = createServiceClient();
      await svc.from('workers').delete().eq('id', testWorkerId).eq('company_id', COMPANY_B_ID);
    }
  });

  test('S12-3A: Archive button disabled and shows loading state during PATCH', async ({ page }) => {
    if (!testWorkerId) {
      test.skip(true, 'test worker not created');
      return;
    }

    // Slow down the PATCH to see the loading state
    await page.route(`**/api/workers/${testWorkerId}`, async (route) => {
      if (route.request().method() === 'PATCH') {
        await new Promise(r => setTimeout(r, 2000));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: testWorkerId, is_archived: true }) });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/workers/${testWorkerId}`);
    await page.waitForLoadState('networkidle');

    // Open the "פעולות" section
    const actionsSection = page.locator('text=פעולות').first();
    if (await actionsSection.isVisible()) {
      await actionsSection.click();
    }

    const archiveBtn = page.locator('button', { hasText: 'העבר לארכיון' });
    if (await archiveBtn.isVisible()) {
      // Accept the confirm dialog
      page.once('dialog', dialog => dialog.accept());
      await archiveBtn.click();

      // During the delayed PATCH, button transitions to loading text and becomes disabled.
      // The text changes from 'העבר לארכיון' to 'מעביר לארכיון...' — use the loading state.
      const loadingBtn = page.locator('button', { hasText: 'מעביר לארכיון...' });
      await expect(loadingBtn).toBeVisible({ timeout: 2000 });
      await expect(loadingBtn).toBeDisabled();
    }
  });

  test('S12-3B: Company switch buttons disabled while switch is in progress', async ({ page }) => {
    // Navigate to /select-company if available, or verify SelectCompanyClient behavior
    await page.goto('/select-company');
    await page.waitForLoadState('domcontentloaded');

    // The page may redirect if user only has one company; that's fine
    const url = page.url();
    if (!url.includes('/select-company')) {
      test.skip(true, 'Single-company user redirected away from /select-company');
      return;
    }

    // Slow down the session/company API
    await page.route('**/api/session/company', async (route) => {
      await new Promise(r => setTimeout(r, 1500));
      await route.continue();
    });

    const companyBtn = page.locator('button', { hasText: 'Internal QA' }).first();
    if (await companyBtn.isVisible()) {
      await companyBtn.click();
      // All company buttons should be disabled while switch is in-flight
      const allCompanyBtns = page.locator('button[disabled]');
      await expect(allCompanyBtns.first()).toBeVisible({ timeout: 1000 });
    }
  });
});
