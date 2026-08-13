/**
 * QA Session 04 — Lifting Equipment E2E test suite (Phase B — bugs fixed).
 *
 * Safety constraints (identical to all QA sessions):
 *  - ONLY operates against Internal QA / Company B.
 *  - authPage fixture aborts if active company is not "Internal QA".
 *  - All created records use the "qa-le-" prefix.
 *  - test.afterAll cleans up all qa-le records via service-role client.
 *
 * Bugs fixed in Phase B:
 *  B-01 — lifting-equipment/[id]/route.ts rewritten with proper GET/PATCH/DELETE.
 *  B-02 — lifting-machine-appointments/[id]/route.ts rewritten with proper GET/PATCH/DELETE.
 *  B-03 — handleDelete: alert() replaced with inline archiveError state + try/catch/finally.
 *  B-04 — handleToggleActive: toggleError state added, catch block added.
 *  B-05 — handleSaveExpiry: saveError state + float bar shows error on failure.
 *  B-06 — LiftingImageUploader: uploadError state added, PATCH failure handled.
 *  B-07 — POST /api/lifting-equipment: subcontractor_id ownership validated.
 *  B-08 — handleDeleteFile: try/catch added.
 */

import type { Dialog, Route } from '@playwright/test';
import { test, expect, readQaMeta, uid } from '../fixtures/lifting-equipment-auth';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── helpers ──────────────────────────────────────────────────────────────────

function loadEnvLocal() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {}
}

function makeSupabase() {
  loadEnvLocal();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const PREFIX = 'qa-le';
function name(tag: string): string {
  return `${PREFIX}-${uid()}-${tag}`;
}

// Shared worker for LMA tests (worker_id NOT NULL on lifting_machine_appointments)
let lmaWorkerId: string | null = null;

// ─── global setup / cleanup ────────────────────────────────────────────────────

test.beforeAll(async () => {
  const db = makeSupabase();
  const { companyId } = readQaMeta();
  // Create a shared QA worker for LMA tests
  const { data: w } = await db.from('workers').insert({
    company_id: companyId,
    full_name: name('lma-worker'),
    id_number: `qa-lma-${uid()}`,
    worker_type: 'israeli',
  }).select('id').single();
  lmaWorkerId = w?.id ?? null;
});

test.afterAll(async () => {
  const db = makeSupabase();
  const { companyId } = readQaMeta();
  await db.from('lifting_machine_appointments').delete().eq('company_id', companyId);
  await db.from('lifting_equipment').delete().eq('company_id', companyId);
  if (lmaWorkerId) await db.from('workers').delete().eq('id', lmaWorkerId);
});

// ─── LE-01 to LE-10: List page basics ─────────────────────────────────────────

test('LE-01 - /lifting-equipment list page loads without error', async ({ authPage: page }) => {
  const errEl = page.locator('text=Error').or(page.locator('[data-testid="error"]'));
  await expect(errEl).not.toBeVisible();
  await expect(page.locator('h1', { hasText: 'ציוד הרמה' })).toBeVisible();
});

test('LE-02 - list page has "+ ציוד הרמה חדש" add button', async ({ authPage: page }) => {
  await expect(page.locator('a', { hasText: /\+ ציוד הרמה חדש/ })).toBeVisible();
});

test('LE-03 - empty state shown when no equipment exists', async ({ authPage: page }) => {
  // global-setup cleaned all LE records before this run; this test runs before any creates
  const emptyText = page.locator('text=אין ציוד הרמה רשום עדיין');
  await expect(emptyText).toBeVisible({ timeout: 5_000 });
});

test('LE-04 - clicking "+ ציוד הרמה חדש" navigates to /lifting-equipment/new', async ({ authPage: page }) => {
  await page.locator('a', { hasText: /\+ ציוד הרמה חדש/ }).click();
  await expect(page).toHaveURL('/lifting-equipment/new');
});

test('LE-05 - create form heading "ציוד הרמה חדש" visible', async ({ authPage: page }) => {
  await page.goto('/lifting-equipment/new');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1', { hasText: 'ציוד הרמה חדש' })).toBeVisible();
});

test('LE-06 - create form has תיאור הציוד input (required)', async ({ authPage: page }) => {
  await page.goto('/lifting-equipment/new');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('label', { hasText: /תיאור הציוד/ })).toBeVisible();
  await expect(page.locator('input[placeholder*="חגורות"]')).toBeVisible();
});

test('LE-07 - submit form with empty description shows "תיאור נדרש"', async ({ authPage: page }) => {
  await page.goto('/lifting-equipment/new');
  await page.waitForLoadState('networkidle');
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('p.text-red-600')).toContainText('תיאור נדרש');
});

test('LE-08 - list page has search input when equipment exists', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  await db.from('lifting_equipment').insert({ company_id: companyId, description: name('search-input') });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('input[placeholder="חיפוש לפי תיאור..."]')).toBeVisible();
});

test('LE-09 - StatusFilterTabs rendered with הכל / לא תקין / עומד לפוג / תקין', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  await db.from('lifting_equipment').insert({ company_id: companyId, description: name('status-tabs') });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('button', { hasText: /^הכל/ })).toBeVisible();
  await expect(page.locator('button', { hasText: /^לא תקין/ })).toBeVisible();
  await expect(page.locator('button', { hasText: /^עומד לפוג/ })).toBeVisible();
  await expect(page.locator('button', { hasText: /^תקין/ })).toBeVisible();
});

test('LE-10 - mobile viewport: list page renders without horizontal scroll', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/lifting-equipment');
  await page.waitForLoadState('networkidle');
  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(377);
});

// ─── LE-11 to LE-20: Create / POST ────────────────────────────────────────────

test('LE-11 - POST /api/lifting-equipment with valid description returns 201', async ({ authPage: page }) => {
  const res = await page.request.post('/api/lifting-equipment', {
    data: { description: name('post-201') },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.id).toBeTruthy();
  expect(typeof body.description).toBe('string');
});

test('LE-12 - POST /api/lifting-equipment without description returns 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/lifting-equipment', {
    data: {},
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(400);
});

test('LE-13 - POST /api/lifting-equipment unauthenticated returns 401', async ({ request }) => {
  const res = await request.post('/api/lifting-equipment', {
    data: { description: 'unauth-test' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(401);
});

test('LE-14 - create form submit with description — navigates to detail page', async ({ authPage: page }) => {
  await page.goto('/lifting-equipment/new');
  await page.waitForLoadState('networkidle');
  const desc = name('form-create');
  await page.locator('input[placeholder*="חגורות"]').fill(desc);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/lifting-equipment\/[a-f0-9-]{36}$/, { timeout: 10_000 });
  await expect(page.locator('h1', { hasText: desc })).toBeVisible({ timeout: 5_000 });
});

test('LE-15 - created equipment appears in list', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const desc = name('appears-in-list');
  await db.from('lifting_equipment').insert({ company_id: companyId, description: desc });
  await page.goto('/lifting-equipment');
  await page.waitForLoadState('networkidle');
  await expect(page.locator(`text=${desc}`)).toBeVisible({ timeout: 5_000 });
});

test('LE-16 - create with project_name — field persisted in DB', async ({ authPage: page }) => {
  const db = makeSupabase();
  const desc = name('proj-name');
  const proj = `qa-proj-${uid()}`;
  const res = await page.request.post('/api/lifting-equipment', {
    data: { description: desc, project_name: proj },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(201);
  const created = await res.json();
  const { data } = await db.from('lifting_equipment').select('project_name').eq('id', created.id).single();
  expect(data?.project_name).toBe(proj);
});

test('LE-17 - POST /api/lifting-equipment — company_id set to current company', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const res = await page.request.post('/api/lifting-equipment', {
    data: { description: name('company-check') },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(201);
  const created = await res.json();
  expect(created.company_id).toBe(companyId);
});

test('LE-18 - newly created equipment has is_archived=false and is_active=true', async ({ authPage: page }) => {
  const res = await page.request.post('/api/lifting-equipment', {
    data: { description: name('defaults') },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.is_archived).toBe(false);
  expect(body.is_active).toBe(true);
});

test('LE-19 - GET /api/lifting-equipment returns only Internal QA company data', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const res = await page.request.get('/api/lifting-equipment');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
  for (const item of body) {
    expect(item.company_id).toBe(companyId);
  }
});

test('LE-20 - GET /api/lifting-equipment unauthenticated returns 401', async ({ request }) => {
  const res = await request.get('/api/lifting-equipment');
  expect(res.status()).toBe(401);
});

// ─── LE-21 to LE-28: Detail page UI ───────────────────────────────────────────

test('LE-21 - detail page loads for created equipment', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const desc = name('detail-loads');
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: desc }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1', { hasText: desc })).toBeVisible();
});

test('LE-22 - detail page shows equipment description in h1', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const desc = name('detail-h1');
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: desc }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1.text-xl')).toContainText(desc);
});

test('LE-23 - detail page has "עריכת פרטים" link to edit', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('edit-link') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  const editLink = page.locator('a', { hasText: 'עריכת פרטים' });
  await expect(editLink).toBeVisible();
  await expect(editLink).toHaveAttribute('href', `/lifting-equipment/${eq!.id}/edit`);
});

test('LE-24 - detail page has "העבר לארכיון" button', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('archive-btn') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('button', { hasText: 'העבר לארכיון' })).toBeVisible();
});

test('LE-25 - detail page shows תסקיר section with "תעודת תסקיר"', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('inspect-section') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h2', { hasText: 'תסקיר' })).toBeVisible();
  await expect(page.locator('h3', { hasText: 'תעודת תסקיר' })).toBeVisible();
});

test('LE-26 - back link "רשימת ציוד הרמה" navigates to list', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('back-link') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  await page.locator('a', { hasText: /רשימת ציוד הרמה/ }).click();
  await expect(page).toHaveURL('/lifting-equipment');
});

test('LE-27 - refresh detail page keeps data visible (SSR)', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const desc = name('ssr-refresh');
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: desc }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1', { hasText: desc })).toBeVisible();
});

test('LE-28 - non-existent equipment ID → detail h1 not shown (notFound)', async ({ authPage: page }) => {
  await page.goto('/lifting-equipment/00000000-0000-0000-0000-000000000099');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1.text-xl')).not.toBeVisible({ timeout: 3_000 });
});

// ─── LE-29 to LE-33: API [id] route — B-01 fixed ─────────────────────────────

test('LE-29 - GET /api/lifting-equipment/[id] returns single object with matching id', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('get-single') }).select().single();
  const res = await page.request.get(`/api/lifting-equipment/${eq!.id}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(false);
  expect(body.id).toBe(eq!.id);
});

test('LE-30 - PATCH /api/lifting-equipment/[id] returns 200 with updated object', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('patch-ok') }).select().single();
  const newDesc = name('patch-updated');
  const res = await page.request.patch(`/api/lifting-equipment/${eq!.id}`, {
    data: { description: newDesc },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.description).toBe(newDesc);
});

test('LE-31 - DELETE /api/lifting-equipment/[id] returns 200 with success:true', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('delete-ok') }).select().single();
  const res = await page.request.delete(`/api/lifting-equipment/${eq!.id}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
});

test('LE-32 - GET /api/lifting-equipment/[id] returns only the requested item', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const desc = name('get-exact');
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: desc }).select().single();
  const res = await page.request.get(`/api/lifting-equipment/${eq!.id}`);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(false);
  expect(body.id).toBe(eq!.id);
  expect(body.description).toBe(desc);
});

test('LE-33 - POST /api/lifting-equipment/[id] returns 405', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('post-405') }).select().single();
  const res = await page.request.post(`/api/lifting-equipment/${eq!.id}`, {
    data: { description: name('should-not-create') },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(405);
});

// ─── LE-34 to LE-38: Edit form ────────────────────────────────────────────────

test('LE-34 - "עריכת פרטים" link navigates to /lifting-equipment/[id]/edit', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('edit-nav') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  await page.locator('a', { hasText: 'עריכת פרטים' }).click();
  await expect(page).toHaveURL(`/lifting-equipment/${eq!.id}/edit`);
});

test('LE-35 - edit form page heading "עריכת ציוד הרמה" visible', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('edit-heading') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}/edit`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1', { hasText: 'עריכת ציוד הרמה' })).toBeVisible();
});

test('LE-36 - edit form pre-populated with existing description', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const desc = name('prepopulated');
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: desc }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}/edit`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('input[placeholder*="חגורות"]')).toHaveValue(desc);
});

test('LE-37 - edit form submit → PATCH → 200 → navigates to detail page', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('edit-success') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}/edit`);
  await page.waitForLoadState('networkidle');
  await page.locator('input[placeholder*="חגורות"]').fill(name('edit-updated'));
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/lifting-equipment\/[^/]+$/, { timeout: 10_000 });
  await expect(page.locator('p.text-red-600')).not.toBeVisible();
});

test('LE-38 - edit form submit → PATCH → 200 → URL leaves edit page', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('edit-nav-away') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}/edit`);
  await page.waitForLoadState('networkidle');
  await page.locator('input[placeholder*="חגורות"]').fill(name('edit-updated'));
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/lifting-equipment\/[^/]+$/, { timeout: 10_000 });
  expect(page.url()).not.toContain('/edit');
});

// ─── LE-39 to LE-44: Archive ───────────────────────────────────────────────────

test('LE-39 - archive button shows window.confirm dialog containing equipment description', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const desc = name('archive-confirm');
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: desc }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  let capturedType = '';
  let capturedMsg = '';
  page.once('dialog', (d: Dialog) => {
    capturedType = d.type();
    capturedMsg = d.message();
    d.dismiss();
  });
  await page.locator('button', { hasText: /העבר לארכיון/ }).click();
  await page.waitForTimeout(500);
  expect(capturedType).toBe('confirm');
  expect(capturedMsg).toContain(desc);
});

test('LE-40 - cancel archive dialog — stays on detail page', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('archive-cancel') }).select().single();
  const id = eq!.id;
  await page.goto(`/lifting-equipment/${id}`);
  await page.waitForLoadState('networkidle');
  page.once('dialog', (d: Dialog) => d.dismiss());
  await page.locator('button', { hasText: /העבר לארכיון/ }).click();
  await expect(page).toHaveURL(`/lifting-equipment/${id}`);
});

test('LE-41 - archive confirm → no alert dialog fired (inline error replaces alert)', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('archive-no-alert') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  let dialogCount = 0;
  page.on('dialog', (d: Dialog) => {
    dialogCount++;
    d.accept();
  });
  await page.locator('button', { hasText: /העבר לארכיון/ }).click();
  // Wait for navigation or timeout
  await page.waitForURL('/lifting-equipment', { timeout: 10_000 }).catch(() => {});
  // Only the confirm dialog should have fired — no alert('שגיאה') afterward
  expect(dialogCount).toBe(1);
});

test('LE-42 - archive confirm → navigates to /lifting-equipment', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('archive-nav') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  page.once('dialog', (d: Dialog) => d.accept());
  await page.locator('button', { hasText: /העבר לארכיון/ }).click();
  await expect(page).toHaveURL('/lifting-equipment', { timeout: 10_000 });
});

test('LE-43 - archive confirm → is_archived becomes true in DB', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('archive-db') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  page.once('dialog', (d: Dialog) => d.accept());
  await page.locator('button', { hasText: /העבר לארכיון/ }).click();
  await page.waitForURL('/lifting-equipment', { timeout: 10_000 });
  const { data } = await db.from('lifting_equipment').select('is_archived').eq('id', eq!.id).single();
  expect(data?.is_archived).toBe(true);
});

test('LE-44 - archived equipment no longer appears in active list', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const desc = name('archive-gone');
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: desc }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  page.once('dialog', (d: Dialog) => d.accept());
  await page.locator('button', { hasText: /העבר לארכיון/ }).click();
  await page.waitForURL('/lifting-equipment', { timeout: 10_000 });
  await expect(page.locator(`text=${desc}`)).not.toBeVisible({ timeout: 3_000 });
});

// ─── LE-45 to LE-49: Toggle is_active ─────────────────────────────────────────

test('LE-45 - toggle in list row: optimistic flip persists after PATCH → 200', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('list-toggle-persist') }).select().single();
  await page.goto('/lifting-equipment');
  await page.waitForLoadState('networkidle');
  const toggle = page.locator(`a[href="/lifting-equipment/${eq!.id}"]`).locator('[role="switch"]');
  const initialChecked = await toggle.getAttribute('aria-checked');
  await toggle.click();
  await page.waitForTimeout(2_000);
  const finalChecked = await toggle.getAttribute('aria-checked');
  // PATCH → 200 → eq updated → toggle persists (does not revert)
  expect(finalChecked).not.toBe(initialChecked);
});

test('LE-46 - toggle in list row: is_active changes in DB after PATCH → 200', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('list-toggle-db') }).select().single();
  await page.goto('/lifting-equipment');
  await page.waitForLoadState('networkidle');
  const toggle = page.locator(`a[href="/lifting-equipment/${eq!.id}"]`).locator('[role="switch"]');
  await toggle.click();
  await page.waitForTimeout(2_000);
  const { data } = await db.from('lifting_equipment').select('is_active').eq('id', eq!.id).single();
  // PATCH → 200 → DB value changed
  expect(data?.is_active).toBe(false);
});

test('LE-47 - toggle on detail page → PATCH → 200 → is_active changes in DB', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('detail-toggle-db') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  const toggle = page.locator('[role="switch"]').first();
  await toggle.click();
  await page.waitForTimeout(2_000);
  const { data } = await db.from('lifting_equipment').select('is_active').eq('id', eq!.id).single();
  // PATCH → 200 → setEq(data) → DB changed
  expect(data?.is_active).toBe(false);
});

test('LE-48 - toggle on detail page: no error message shown on successful toggle', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('detail-toggle-no-err') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  const toggle = page.locator('[role="switch"]').first();
  await toggle.click();
  await page.waitForTimeout(2_000);
  await expect(page.locator('p.text-red-600')).not.toBeVisible();
});

test('LE-49 - toggle on detail page: toggle state changes after PATCH → 200', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('detail-toggle-changed') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  const toggle = page.locator('[role="switch"]').first();
  const initialChecked = await toggle.getAttribute('aria-checked');
  await toggle.click();
  await page.waitForTimeout(2_000);
  const finalChecked = await toggle.getAttribute('aria-checked');
  // PATCH → 200 → setEq(data) updates is_active → toggle state changes
  expect(finalChecked).not.toBe(initialChecked);
});

// ─── LE-50 to LE-55: Inspection / Expiry ──────────────────────────────────────

test('LE-50 - inspection section "תסקיר" with date input shown on detail page', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('inspect-date') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h2', { hasText: 'תסקיר' })).toBeVisible();
  await expect(page.locator('input[type="date"]')).toBeVisible();
});

test('LE-51 - changing inspection expiry shows float bar "שינוי תאריך ממתין לשמירה"', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('expiry-pending') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="date"]').fill('2027-12-31');
  await expect(page.locator('text=שינוי תאריך ממתין לשמירה')).toBeVisible({ timeout: 2_000 });
});

test('LE-52 - cancel expiry change removes float bar', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('expiry-cancel') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="date"]').fill('2027-12-31');
  await expect(page.locator('text=שינוי תאריך ממתין לשמירה')).toBeVisible({ timeout: 2_000 });
  await page.locator('button', { hasText: 'ביטול' }).click();
  await expect(page.locator('text=שינוי תאריך ממתין לשמירה')).not.toBeVisible();
});

test('LE-53 - save expiry → PATCH → 200 → success message shown and float bar dismisses', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('expiry-save-ok') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="date"]').fill('2027-12-31');
  await expect(page.locator('text=שינוי תאריך ממתין לשמירה')).toBeVisible({ timeout: 2_000 });
  await page.locator('button', { hasText: 'שמור שינויים' }).click();
  await expect(page.locator('text=נשמר בהצלחה')).toBeVisible({ timeout: 5_000 });
  // Success message auto-dismisses after 3s and float bar disappears
  await expect(page.locator('text=שינוי תאריך ממתין לשמירה')).not.toBeVisible({ timeout: 5_000 });
});

test('LE-54 - save expiry → inspection_expiry updated in DB', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('expiry-db-ok') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="date"]').fill('2027-06-15');
  await page.locator('button', { hasText: 'שמור שינויים' }).click();
  await expect(page.locator('text=נשמר בהצלחה')).toBeVisible({ timeout: 5_000 });
  const { data } = await db.from('lifting_equipment').select('inspection_expiry').eq('id', eq!.id).single();
  expect(data?.inspection_expiry).toBe('2027-06-15');
});

test('LE-55 - save expiry success: no error element shown', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('expiry-no-err') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="date"]').fill('2027-06-15');
  await page.locator('button', { hasText: 'שמור שינויים' }).click();
  await expect(page.locator('text=נשמר בהצלחה')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('p.text-red-600')).not.toBeVisible();
});

// ─── LE-56 to LE-60: Search & Filter ──────────────────────────────────────────

test('LE-56 - search by description filters list', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const desc = name('search-target');
  await db.from('lifting_equipment').insert({ company_id: companyId, description: desc });
  await page.goto('/lifting-equipment');
  await page.waitForLoadState('networkidle');
  await page.locator('input[placeholder="חיפוש לפי תיאור..."]').fill(desc);
  await expect(page.locator(`text=${desc}`)).toBeVisible({ timeout: 3_000 });
});

test('LE-57 - search with no match shows "לא נמצאו תוצאות התואמות את הסינון"', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  await db.from('lifting_equipment').insert({ company_id: companyId, description: name('no-match-base') });
  await page.goto('/lifting-equipment');
  await page.waitForLoadState('networkidle');
  await page.locator('input[placeholder="חיפוש לפי תיאור..."]').fill('zzz-xkjqwerty-no-match');
  await expect(page.locator('text=לא נמצאו תוצאות התואמות את הסינון')).toBeVisible({ timeout: 3_000 });
});

test('LE-58 - StatusFilter "לא תקין" shows newly created equipment (no inspection file)', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const desc = name('filter-invalid');
  await db.from('lifting_equipment').insert({ company_id: companyId, description: desc });
  await page.goto('/lifting-equipment');
  await page.waitForLoadState('networkidle');
  await page.locator('button', { hasText: /^לא תקין/ }).click();
  await expect(page.locator(`text=${desc}`)).toBeVisible({ timeout: 3_000 });
});

test('LE-59 - StatusFilter "תקין" does NOT show equipment without inspection file', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const desc = name('filter-no-valid');
  await db.from('lifting_equipment').insert({ company_id: companyId, description: desc, inspection_file_url: null });
  await page.goto('/lifting-equipment');
  await page.waitForLoadState('networkidle');
  await page.locator('button', { hasText: /^תקין/ }).click();
  await expect(page.locator(`text=${desc}`)).not.toBeVisible({ timeout: 3_000 });
});

test('LE-60 - filter "הכל" after filter change resets list', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const desc = name('filter-reset');
  await db.from('lifting_equipment').insert({ company_id: companyId, description: desc });
  await page.goto('/lifting-equipment');
  await page.waitForLoadState('networkidle');
  await page.locator('button', { hasText: /^לא תקין/ }).click();
  await page.locator('button', { hasText: /^הכל/ }).click();
  await expect(page.locator(`text=${desc}`)).toBeVisible({ timeout: 3_000 });
});

// ─── LE-61 to LE-66: Appointments API (B-02 fixed) ───────────────────────────

test('LE-61 - GET /api/lifting-machine-appointments returns 200 array (authenticated)', async ({ authPage: page }) => {
  const res = await page.request.get('/api/lifting-machine-appointments');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
});

test('LE-62 - GET /api/lifting-machine-appointments unauthenticated returns 401', async ({ request }) => {
  const res = await request.get('/api/lifting-machine-appointments');
  expect(res.status()).toBe(401);
});

test('LE-63 - GET /api/lifting-machine-appointments/[id] → 200 single object', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: appt } = await db.from('lifting_machine_appointments').insert({
    company_id: companyId,
    worker_id: lmaWorkerId!,
    machine_name: name('lma-get'),
    appointer_name: 'qa-appointer',
    appointment_date: new Date().toISOString().split('T')[0],
  }).select().single();
  const res = await page.request.get(`/api/lifting-machine-appointments/${appt!.id}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.id).toBe(appt!.id);
  expect(Array.isArray(body)).toBe(false);
});

test('LE-64 - PATCH /api/lifting-machine-appointments/[id] → 200 with updated field', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: appt } = await db.from('lifting_machine_appointments').insert({
    company_id: companyId,
    worker_id: lmaWorkerId!,
    machine_name: name('lma-patch'),
    appointer_name: 'qa-appointer',
    appointment_date: new Date().toISOString().split('T')[0],
  }).select().single();
  const newName = name('lma-patched');
  const res = await page.request.patch(`/api/lifting-machine-appointments/${appt!.id}`, {
    data: { machine_name: newName },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.machine_name).toBe(newName);
});

test('LE-65 - DELETE /api/lifting-machine-appointments/[id] → 200 with success:true', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: appt } = await db.from('lifting_machine_appointments').insert({
    company_id: companyId,
    worker_id: lmaWorkerId!,
    machine_name: name('lma-delete'),
    appointer_name: 'qa-appointer',
    appointment_date: new Date().toISOString().split('T')[0],
  }).select().single();
  const res = await page.request.delete(`/api/lifting-machine-appointments/${appt!.id}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  const { data } = await db.from('lifting_machine_appointments').select('id').eq('id', appt!.id).maybeSingle();
  expect(data).toBeNull();
});

test('LE-66 - POST /api/lifting-machine-appointments/[id] → 405', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: appt } = await db.from('lifting_machine_appointments').insert({
    company_id: companyId,
    worker_id: lmaWorkerId!,
    machine_name: name('lma-post'),
    appointer_name: 'qa-appointer',
    appointment_date: new Date().toISOString().split('T')[0],
  }).select().single();
  const res = await page.request.post(`/api/lifting-machine-appointments/${appt!.id}`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(405);
});

// ─── LE-67 to LE-69: Subcontractor ownership (B-07) ──────────────────────────

test('LE-67 - POST /api/lifting-equipment with same-company subcontractor_id → 201', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: sub } = await db.from('subcontractors').insert({
    company_id: companyId,
    name: name('sub-same-co'),
  }).select().single();
  const res = await page.request.post('/api/lifting-equipment', {
    data: { description: name('le-with-sub'), subcontractor_id: sub!.id },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.subcontractor_id).toBe(sub!.id);
  // cleanup subcontractor
  await db.from('subcontractors').delete().eq('id', sub!.id);
});

test('LE-68 - POST /api/lifting-equipment with nonexistent subcontractor UUID → 404', async ({ authPage: page }) => {
  // subcontractor_id is a valid UUID format but does not exist in this company
  const res = await page.request.post('/api/lifting-equipment', {
    data: {
      description: name('le-no-sub'),
      subcontractor_id: '00000000-0000-0000-0000-777777777777',
    },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(404);
  const body = await res.json();
  expect(body.error).toContain('קבלן');
});

test('LE-69 - POST /api/lifting-equipment with null subcontractor_id → 201 (no validation needed)', async ({ authPage: page }) => {
  const res = await page.request.post('/api/lifting-equipment', {
    data: { description: name('le-null-sub'), subcontractor_id: null },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.subcontractor_id).toBeNull();
});

// ─── LE-70 to LE-73: Error state UI (B-03/B-04/B-05/B-06) ────────────────────

test('LE-70 - archive error shown inline when PATCH fails (no alert)', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('archive-err-inline') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  // Intercept the PATCH to return 500
  await page.route(`**/api/lifting-equipment/${eq!.id}`, async (route: Route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'שגיאת שרת' }) });
    } else {
      await route.continue();
    }
  });
  let alertFired = false;
  page.on('dialog', (d: Dialog) => {
    if (d.type() === 'confirm') d.accept();
    else { alertFired = true; d.accept(); }
  });
  await page.locator('button', { hasText: /העבר לארכיון/ }).click();
  await expect(page.locator('p.text-red-600')).toBeVisible({ timeout: 5_000 });
  expect(alertFired).toBe(false);
});

test('LE-71 - toggle error shown inline when PATCH fails', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('toggle-err-inline') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  await page.route(`**/api/lifting-equipment/${eq!.id}`, async (route: Route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'שגיאת שרת' }) });
    } else {
      await route.continue();
    }
  });
  const toggle = page.locator('[role="switch"]').first();
  await toggle.click();
  await expect(page.locator('p.text-red-600')).toBeVisible({ timeout: 5_000 });
});

test('LE-72 - expiry save error shown in float bar when PATCH fails', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('expiry-err-bar') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  await page.route(`**/api/lifting-equipment/${eq!.id}`, async (route: Route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'שגיאת שרת' }) });
    } else {
      await route.continue();
    }
  });
  await page.locator('input[type="date"]').fill('2027-12-31');
  await expect(page.locator('text=שינוי תאריך ממתין לשמירה')).toBeVisible({ timeout: 2_000 });
  await page.locator('button', { hasText: 'שמור שינויים' }).click();
  // Error appears in float bar area
  await expect(page.locator('p.text-red-600')).toBeVisible({ timeout: 5_000 });
  // Pending message gone (saveError replaces it)
  await expect(page.locator('text=שינוי תאריך ממתין לשמירה')).not.toBeVisible({ timeout: 3_000 });
});

test('LE-73 - image upload failure shows inline error (no alert)', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: eq } = await db.from('lifting_equipment').insert({ company_id: companyId, description: name('img-upload-err') }).select().single();
  await page.goto(`/lifting-equipment/${eq!.id}`);
  await page.waitForLoadState('networkidle');
  // Intercept the upload endpoint to return failure
  await page.route('**/api/upload', async (route: Route) => {
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'שגיאה בהעלאה' }) });
  });
  let alertFired = false;
  page.on('dialog', (d: Dialog) => { alertFired = true; d.accept(); });
  // Set file on the image uploader's hidden input (identified by its accept attribute)
  await page.locator('input[type="file"][accept*="image/jpeg"]').first().setInputFiles({
    name: 'test.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('fake-image-data'),
  });
  await page.waitForTimeout(2_000);
  await expect(page.locator('p.text-xs.text-red-600')).toBeVisible({ timeout: 5_000 });
  expect(alertFired).toBe(false);
});

// ─── LE-74 to LE-76: LMA per-item operations (B-02 fixed, extended) ───────────

test('LE-74 - LMA GET /[id] returns single appointment; cross-company 404', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: appt } = await db.from('lifting_machine_appointments').insert({
    company_id: companyId,
    worker_id: lmaWorkerId!,
    machine_name: name('lma-get2'),
    appointer_name: 'qa-appointer',
    appointment_date: new Date().toISOString().split('T')[0],
  }).select().single();
  // Own record → 200
  const res = await page.request.get(`/api/lifting-machine-appointments/${appt!.id}`);
  expect(res.status()).toBe(200);
  expect((await res.json()).id).toBe(appt!.id);
  // Cross-company (fake ID) → 404
  const res2 = await page.request.get('/api/lifting-machine-appointments/00000000-0000-0000-0000-999999999999');
  expect(res2.status()).toBe(404);
});

test('LE-75 - LMA PATCH /[id] updates the appointment; missing record → 404', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: appt } = await db.from('lifting_machine_appointments').insert({
    company_id: companyId,
    worker_id: lmaWorkerId!,
    machine_name: name('lma-patch2'),
    appointer_name: 'qa-appointer',
    appointment_date: new Date().toISOString().split('T')[0],
  }).select().single();
  const updated = name('lma-updated');
  const res = await page.request.patch(`/api/lifting-machine-appointments/${appt!.id}`, {
    data: { machine_name: updated },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).machine_name).toBe(updated);
  // Unknown ID → 404
  const res2 = await page.request.patch('/api/lifting-machine-appointments/00000000-0000-0000-0000-999999999998', {
    data: { machine_name: 'x' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res2.status()).toBe(404);
});

test('LE-76 - LMA DELETE /[id] removes appointment; second DELETE → 404', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  const db = makeSupabase();
  const { data: appt } = await db.from('lifting_machine_appointments').insert({
    company_id: companyId,
    worker_id: lmaWorkerId!,
    machine_name: name('lma-del2'),
    appointer_name: 'qa-appointer',
    appointment_date: new Date().toISOString().split('T')[0],
  }).select().single();
  const res = await page.request.delete(`/api/lifting-machine-appointments/${appt!.id}`);
  expect(res.status()).toBe(200);
  expect((await res.json()).success).toBe(true);
  // Record gone from DB
  const { data } = await db.from('lifting_machine_appointments').select('id').eq('id', appt!.id).maybeSingle();
  expect(data).toBeNull();
  // Second DELETE → 404 (already gone)
  const res2 = await page.request.delete(`/api/lifting-machine-appointments/${appt!.id}`);
  expect(res2.status()).toBe(404);
});
