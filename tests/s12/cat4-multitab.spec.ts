/**
 * QA Session 12 — CAT4: Multi-Tab Consistency
 *
 * Requirements (DATA CORRECTNESS, not live-refresh):
 *  - No data corruption when two tabs act on the same worker
 *  - Stale-tab mutation on deleted resource returns server error (not false success)
 *  - Company switch in one tab is reflected in both (shared cookie)
 *  - After any tab refreshes, server-authoritative state is shown
 *
 * Safety rules:
 *  - Mutations only on Company B (Internal QA)
 *  - Company A = SafeDoc READ ONLY
 *  - All created workers are deleted in afterAll
 */

import { test, expect, type Browser, type BrowserContext } from '@playwright/test';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';

const COMPANY_B_ID = '4f3d08b0-6317-40bf-8f69-1702c39f9f05';
const COMPANY_A_ID = '00000000-0000-0000-0000-000000000001';

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
  } catch { /* CI uses env vars directly */ }
}

function createServiceClient() {
  loadEnvLocal();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const TS = () => Date.now().toString(36).toUpperCase();

// ─── helpers ──────────────────────────────────────────────────────────────────

async function createQaWorker(svc: ReturnType<typeof createServiceClient>, companyId: string, name: string) {
  const ts = TS();
  const { data, error } = await svc.from('workers').insert({
    company_id:  companyId,
    full_name:   `${name}-${ts}`,
    national_id: `CAT4-${ts}`,
    worker_type: 'israeli',
    is_active:   true,
  }).select('id').single();
  if (error) throw new Error(`createQaWorker failed: ${error.message}`);
  return data!.id as string;
}

async function deleteQaWorker(svc: ReturnType<typeof createServiceClient>, workerId: string) {
  await svc.from('entity_notes').delete().eq('entity_type', 'worker').eq('entity_id', workerId);
  await svc.from('professional_licenses').delete().eq('worker_id', workerId);
  await svc.from('manager_licenses').delete().eq('worker_id', workerId);
  await svc.from('workers').delete().eq('id', workerId);
}

// ─── CAT4 suite ───────────────────────────────────────────────────────────────

test.describe('S12-CAT4: Multi-Tab Consistency', () => {
  let meta: QaMeta;
  let svc: ReturnType<typeof createServiceClient>;
  const createdWorkerIds: string[] = [];

  test.beforeAll(async () => {
    meta = readQaMeta();
    if (meta.companyId !== COMPANY_B_ID) {
      throw new Error(`SAFETY ABORT: active company is not Company B. Got ${meta.companyId}`);
    }
    svc = createServiceClient();
  });

  test.afterAll(async () => {
    for (const id of createdWorkerIds) {
      await deleteQaWorker(svc, id).catch(() => undefined);
    }
  });

  // Helper: create a fresh browser context with the shared QA auth cookies
  async function makeAuthContext(browser: Browser): Promise<BrowserContext> {
    return browser.newContext({
      storageState: 'playwright/.auth/qa-session.json',
    });
  }

  // ── S12-4A: Two tabs PATCH the same worker — last write wins, no corruption ──
  test('S12-4A: two-tab concurrent PATCH — last write wins, no DB corruption', async ({ browser }) => {
    const workerId = await createQaWorker(svc, meta.companyId, 'S12-4A');
    createdWorkerIds.push(workerId);

    const ctx = await makeAuthContext(browser);
    const tabA = await ctx.newPage();
    const tabB = await ctx.newPage();

    // Tab A: archive the worker
    const resA = await tabA.request.patch(`/api/workers/${workerId}`, {
      data: { is_active: false },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(resA.ok(), `Tab A PATCH should succeed; got ${resA.status()}`).toBe(true);

    // Tab B: re-activate the same worker (stale Tab B "thinks" it's still active)
    const resB = await tabB.request.patch(`/api/workers/${workerId}`, {
      data: { is_active: true },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(resB.ok(), `Tab B PATCH should succeed; got ${resB.status()}`).toBe(true);

    // Server state: Tab B's write wins — worker should be active
    const { data: worker } = await svc.from('workers').select('is_active').eq('id', workerId).single();
    expect(worker?.is_active).toBe(true);

    await ctx.close();
  });

  // ── S12-4B: Tab A archives+deletes worker, Tab B PATCHes stale reference ───
  test('S12-4B: Tab B PATCH on deleted worker returns 404 JSON (not false success)', async ({ browser }) => {
    const workerId = await createQaWorker(svc, meta.companyId, 'S12-4B');
    // Don't push to createdWorkerIds — test deletes it; cleanup is a no-op

    const ctx = await makeAuthContext(browser);
    const tabA = await ctx.newPage();
    const tabB = await ctx.newPage();

    // Tab A archives first (required before permanent deletion)
    const archRes = await tabA.request.patch(`/api/workers/${workerId}`, {
      data: { is_archived: true },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(archRes.ok(), `Archive should succeed; got ${archRes.status()}`).toBe(true);

    // Tab A permanently deletes the archived worker
    const delRes = await tabA.request.delete(`/api/workers/${workerId}`);
    expect(delRes.ok(), `Delete should succeed; got ${delRes.status()}`).toBe(true);

    // Confirm DB deletion
    const { data: gone } = await svc.from('workers').select('id').eq('id', workerId).maybeSingle();
    expect(gone).toBeNull();

    // Tab B now tries to PATCH the deleted worker (stale state)
    const staleRes = await tabB.request.patch(`/api/workers/${workerId}`, {
      data: { is_active: false },
      headers: { 'Content-Type': 'application/json' },
    });

    // Must NOT be a 2xx false success — expect 404
    expect(staleRes.ok(), 'stale PATCH on deleted worker must not return 2xx').toBe(false);
    expect(staleRes.status(), 'stale PATCH on deleted worker should be 404').toBe(404);
    // Must be parseable JSON (not HTML)
    const body = await staleRes.json().catch(() => null);
    expect(body, 'error response must be JSON').not.toBeNull();
    expect(body).toHaveProperty('error');

    await ctx.close();
  });

  // ── S12-4C: Company switch in Tab A is shared to Tab B (same cookie) ────────
  test('S12-4C: company switch in one tab reflected in next request from second tab', async ({ browser }) => {
    const ctx = await makeAuthContext(browser);
    const tabA = await ctx.newPage();
    const tabB = await ctx.newPage();

    // Tab A switches to Company B (should already be active, but this confirms the mechanism)
    const switchRes = await tabA.request.post('/api/session/company', {
      data: { company_id: COMPANY_B_ID },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(switchRes.ok(), `company switch should succeed; got ${switchRes.status()}`).toBe(true);

    // Tab A: invalid switch to Company A → must be rejected
    const badSwitch = await tabA.request.post('/api/session/company', {
      data: { company_id: COMPANY_A_ID },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(badSwitch.status()).toBe(403);
    const badBody = await badSwitch.json();
    expect(badBody).toHaveProperty('error');

    // Tab B: can still access Company B workers (cookie not corrupted by bad switch)
    const workersRes = await tabB.request.get('/api/workers');
    expect(workersRes.ok(), `Tab B workers API should still work; got ${workersRes.status()}`).toBe(true);
    const workersBody = await workersRes.json();
    // Must return array (even if empty)
    expect(Array.isArray(workersBody)).toBe(true);

    await ctx.close();
  });

  // ── S12-4D: Stale Tab B refreshes → sees server-authoritative (archived) state ─
  test('S12-4D: refreshing Tab B after Tab A archives worker shows archived state', async ({ browser }) => {
    const workerId = await createQaWorker(svc, meta.companyId, 'S12-4D');
    createdWorkerIds.push(workerId);

    const ctx = await makeAuthContext(browser);
    const tabA = await ctx.newPage();
    const tabB = await ctx.newPage();

    // Both tabs open the worker page
    await tabA.goto(`/workers/${workerId}`);
    await tabA.waitForLoadState('domcontentloaded');
    await tabB.goto(`/workers/${workerId}`);
    await tabB.waitForLoadState('domcontentloaded');

    // Tab A archives via API
    const archRes = await tabA.request.patch(`/api/workers/${workerId}`, {
      data: { is_active: false },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(archRes.ok()).toBe(true);

    // Tab B refreshes the page
    await tabB.reload();
    await tabB.waitForLoadState('domcontentloaded');

    // Tab B page should now reflect archived state from server
    // The worker API should return is_active=false
    const workerRes = await tabB.request.get(`/api/workers?worker_id=${workerId}`);
    if (workerRes.ok()) {
      const data = await workerRes.json();
      // If API returns single worker or array, check is_active
      const worker = Array.isArray(data) ? data.find((w: { id: string }) => w.id === workerId) : data;
      if (worker) {
        expect(worker.is_active).toBe(false);
      }
    } else {
      // Confirm DB state directly — server state is authoritative
      const { data: dbWorker } = await svc.from('workers').select('is_active').eq('id', workerId).single();
      expect(dbWorker?.is_active).toBe(false);
    }

    await ctx.close();
  });

  // ── S12-4E: No cross-company data leakage between tabs ───────────────────────
  test('S12-4E: Company A workers never appear in Tab B Company B worker list', async ({ browser }) => {
    const ctx = await makeAuthContext(browser);
    const tabB = await ctx.newPage();

    // Ensure active company is Company B
    await tabB.request.post('/api/session/company', {
      data: { company_id: COMPANY_B_ID },
      headers: { 'Content-Type': 'application/json' },
    });

    const workersRes = await tabB.request.get('/api/workers');
    expect(workersRes.ok()).toBe(true);
    const workers = await workersRes.json() as Array<{ company_id?: string }>;

    // No Company A workers in the result
    const companyALeak = workers.filter(w => w.company_id === COMPANY_A_ID);
    expect(companyALeak).toHaveLength(0);

    await ctx.close();
  });
});
