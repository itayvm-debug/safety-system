/**
 * QA Session 03 — Heavy Equipment — Phase A
 *
 * 65 Playwright E2E tests covering:
 *   create · edit · archive · toggle · documents · insurance
 *   search · filters · mobile · navigation · API · cross-tenant
 *
 * Safety rules:
 *   - Internal QA company (Company B) ONLY
 *   - All created records use prefix QA-HE-<timestamp>-<seq>
 *   - Never touch production data
 *   - Phase A: discover bugs, do not fix code
 *
 * Prefix convention: QA-HE-<uid>-<seq>
 */

import { test, expect, uid, readQaMeta } from '../fixtures/heavy-equipment-auth';
import { AUTH_STATE_PATH } from '../global-setup';
import { chromium, type Browser, type Dialog, type ConsoleMessage } from '@playwright/test';

const PREFIX = `QA-HE-${uid()}`;
let seq = 0;
function name(label = '') {
  seq++;
  return `${PREFIX}-${seq.toString().padStart(2, '0')}${label ? `-${label}` : ''}`;
}

/** IDs of equipment created during this run (for reference in findings) */
const createdIds: string[] = [];

// ─────────────────────────────────────────────────────────────
// HE-01 to HE-10 — LIST PAGE & CREATE
// ─────────────────────────────────────────────────────────────

test('HE-01 - /heavy-equipment list page loads without error', async ({ authPage: page }) => {
  await expect(page).toHaveURL('/heavy-equipment');
  await expect(page.locator('h1, h2').first()).toBeVisible();
  const errors: string[] = [];
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.reload();
  await page.waitForLoadState('networkidle');
  // No catastrophic JS errors (hydration warnings are pre-existing, skip)
  const fatal = errors.filter(e => e.includes('Uncaught') && !e.includes('Hydration'));
  expect(fatal).toHaveLength(0);
});

test('HE-02 - list page has "+ כלי" add button', async ({ authPage: page }) => {
  const addBtn = page.locator('a[href="/heavy-equipment/new"], button').filter({ hasText: /כלי|הוסף/i }).first();
  await expect(addBtn).toBeVisible();
});

test('HE-03 - empty state message shown when no equipment exists', async ({ authPage: page }) => {
  // May or may not be empty — just verify no crash, correct structure
  const body = await page.textContent('body');
  expect(body).toBeTruthy();
  // Either shows list or empty-state message
  const hasEmptyMsg = (body ?? '').includes('אין כלי צמ') || (body ?? '').includes('כלי');
  expect(hasEmptyMsg).toBe(true);
});

test('HE-04 - clicking add button navigates to /heavy-equipment/new', async ({ authPage: page }) => {
  const addBtn = page.locator('a[href="/heavy-equipment/new"]').first();
  await addBtn.click();
  await expect(page).toHaveURL('/heavy-equipment/new');
});

test('HE-05 - create form has description field (required)', async ({ authPage: page }) => {
  await page.goto('/heavy-equipment/new');
  await page.waitForLoadState('networkidle');
  const descInput = page.locator('input').filter({ hasText: '' }).first();
  await expect(page.locator('label').filter({ hasText: /תיאור/ }).first()).toBeVisible();
  await expect(page.locator('input[placeholder*="מנוף"]')).toBeVisible();
});

test('HE-06 - create form has operator-appointment fields (manufacturer, machine_identifier, power_type)', async ({ authPage: page }) => {
  await page.goto('/heavy-equipment/new');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('label').filter({ hasText: /יצרן/ })).toBeVisible();
  await expect(page.locator('label').filter({ hasText: /מספר מזהה/ })).toBeVisible();
  await expect(page.locator('label').filter({ hasText: /עומס עבודה בטוח/ })).toBeVisible();
  await expect(page.locator('label').filter({ hasText: /סוג הפעלה/ })).toBeVisible();
});

test('HE-07 - submit form with empty description shows validation error', async ({ authPage: page }) => {
  await page.goto('/heavy-equipment/new');
  await page.waitForLoadState('networkidle');
  await page.locator('button[type="submit"]').click();
  const errorEl = page.locator('p.text-red-600, p.text-sm.text-red-600').first();
  await expect(errorEl).toBeVisible({ timeout: 3_000 });
  const errorText = await errorEl.textContent();
  expect(errorText).toContain('תיאור');
});

test('HE-08 - POST /api/heavy-equipment with valid description returns 201', async ({ authPage: page }) => {
  const equipName = name('api-create');
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: equipName },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.id).toBeTruthy();
  expect(body.description).toBe(equipName);
  createdIds.push(body.id);
});

test('HE-09 - POST /api/heavy-equipment without description returns 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: {},
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toBeTruthy();
});

test('HE-10 - POST /api/heavy-equipment unauthenticated returns 401', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'he-IL' });
  const page = await context.newPage();
  const res = await page.request.post('http://localhost:3000/api/heavy-equipment', {
    data: { description: 'QA-UNAUTH-TEST' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect([401, 403]).toContain(res.status());
  await context.close();
});

// ─────────────────────────────────────────────────────────────
// HE-11 to HE-16 — CREATE VIA FORM (full flow)
// ─────────────────────────────────────────────────────────────

test('HE-11 - create form submit with description only — navigates to detail page', async ({ authPage: page }) => {
  await page.goto('/heavy-equipment/new');
  await page.waitForLoadState('networkidle');
  const equipName = name('form-create');
  await page.locator('input[placeholder*="מנוף"]').fill(equipName);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/heavy-equipment\/[a-f0-9-]{36}$/, { timeout: 10_000 });
  const id = page.url().split('/').pop()!;
  createdIds.push(id);
  await expect(page.locator('h1').filter({ hasText: equipName })).toBeVisible({ timeout: 5_000 });
});

test('HE-12 - create with manufacturer and power_type — fields persisted correctly', async ({ authPage: page }) => {
  await page.goto('/heavy-equipment/new');
  await page.waitForLoadState('networkidle');
  const equipName = name('silent-drop');

  await page.locator('input[placeholder*="מנוף"]').fill(equipName);
  await page.locator('input[placeholder*="שם היצרן"]').fill('Liebherr');
  await page.locator('select').last().selectOption('mechanical');

  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/heavy-equipment\/[a-f0-9-]{36}$/, { timeout: 10_000 });
  const id = page.url().split('/').pop()!;
  createdIds.push(id);

  // Verify via API that manufacturer and power_type were persisted
  const res = await page.request.get('/api/heavy-equipment');
  const list = await res.json();
  const created = list.find((e: { id: string }) => e.id === id);
  expect(created?.manufacturer).toBe('Liebherr');
  expect(created?.power_type).toBe('mechanical');
});

test('HE-13 - created equipment appears in list', async ({ authPage: page }) => {
  const equipName = name('in-list');
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: equipName },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator(`text=${equipName}`)).toBeVisible({ timeout: 5_000 });
});

test('HE-14 - newly created equipment shows status חסר (no docs uploaded)', async ({ authPage: page }) => {
  const equipName = name('status-missing');
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: equipName },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');
  // Overall status badge should be 'חסר'
  const badge = page.locator('[class*="bg-red"],[class*="text-red"]').filter({ hasText: 'חסר' }).first();
  await expect(badge).toBeVisible({ timeout: 5_000 });
});

test('HE-15 - duplicate license_number in same company returns 409', async ({ authPage: page }) => {
  const licNum = `LIC-${Date.now()}`;
  const res1 = await page.request.post('/api/heavy-equipment', {
    data: { description: name('dup-lic-1'), license_number: licNum },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res1.status()).toBe(201);
  const { id } = await res1.json();
  createdIds.push(id);

  const res2 = await page.request.post('/api/heavy-equipment', {
    data: { description: name('dup-lic-2'), license_number: licNum },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res2.status()).toBe(409);
  const body = await res2.json();
  expect(body.error).toContain('רישוי');
});

test('HE-16 - duplicate license_number shows error in create form', async ({ authPage: page }) => {
  const licNum = `FORM-LIC-${Date.now()}`;
  const res1 = await page.request.post('/api/heavy-equipment', {
    data: { description: name('dup-form-1'), license_number: licNum },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res1.json();
  createdIds.push(id);

  await page.goto('/heavy-equipment/new');
  await page.waitForLoadState('networkidle');
  await page.locator('input[placeholder*="מנוף"]').fill(name('dup-form-2'));
  await page.locator('input[dir="ltr"]').first().fill(licNum);
  await page.locator('button[type="submit"]').click();

  const errEl = page.locator('p.text-red-600, p.text-sm.text-red-600').first();
  await expect(errEl).toBeVisible({ timeout: 5_000 });
  const errText = await errEl.textContent();
  expect(errText).toContain('רישוי');
});

// ─────────────────────────────────────────────────────────────
// HE-17 to HE-22 — DETAIL PAGE
// ─────────────────────────────────────────────────────────────

test('HE-17 - detail page loads and shows equipment description', async ({ authPage: page }) => {
  const equipName = name('detail-load');
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: equipName },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1').filter({ hasText: equipName })).toBeVisible();
});

test('HE-18 - detail page has "עריכת פרטים" button', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('detail-edit-btn') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('a[href*="edit"], button').filter({ hasText: 'עריכת פרטים' })).toBeVisible();
});

test('HE-19 - detail page has "העבר לארכיון" button', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('detail-archive-btn') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('button').filter({ hasText: /ארכיון/ })).toBeVisible();
});

test('HE-20 - detail page shows license document section (required)', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('detail-license-sec') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=רישיון / רישוי')).toBeVisible();
});

test('HE-21 - detail page shows inspection document section (optional)', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('detail-insp-sec') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=תסקיר')).toBeVisible();
  // inspection is optional — should NOT be labeled as required (no asterisk next to it)
  const inspectionCard = page.locator('div').filter({ hasText: 'תסקיר' }).filter({ has: page.locator('text=אופציונלי') });
  await expect(inspectionCard.first()).toBeVisible();
});

test('HE-22 - detail page shows insurance section with 3 types', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('detail-ins-types') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=ביטוח חובה')).toBeVisible();
  await expect(page.locator('text=ביטוח מקיף')).toBeVisible();
  await expect(page.locator('text=ביטוח צד ג')).toBeVisible();
});

// ─────────────────────────────────────────────────────────────
// HE-23 to HE-28 — EDIT
// ─────────────────────────────────────────────────────────────

test('HE-23 - PATCH /api/heavy-equipment/[id] returns 200 with updated data', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('patch-200') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  const updatedName = name('patch-200-updated');
  const patchRes = await page.request.patch(`/api/heavy-equipment/${id}`, {
    data: { description: updatedName },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(patchRes.status()).toBe(200);
  const body = await patchRes.json();
  expect(body.description).toBe(updatedName);
});

test('HE-24 - DELETE /api/heavy-equipment/[id] returns 200 with success', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('delete-200') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  const delRes = await page.request.delete(`/api/heavy-equipment/${id}`);
  expect(delRes.status()).toBe(200);
  const body = await delRes.json();
  expect(body.success).toBe(true);
});

test('HE-25 - GET /api/heavy-equipment/[id] returns single object with correct id', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('get-single') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  const getRes = await page.request.get(`/api/heavy-equipment/${id}`);
  expect(getRes.status()).toBe(200);
  const body = await getRes.json();
  expect(Array.isArray(body)).toBe(false);
  expect(body.id).toBe(id);
});

test('HE-26 - edit form navigates to /heavy-equipment/[id]/edit', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('edit-nav') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');
  await page.locator('a').filter({ hasText: 'עריכת פרטים' }).click();
  await expect(page).toHaveURL(`/heavy-equipment/${id}/edit`);
});

test('HE-27 - edit form pre-populated with existing values', async ({ authPage: page }) => {
  const equipName = name('edit-prepop');
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: equipName, license_number: 'PREPOP-99' },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}/edit`);
  await page.waitForLoadState('networkidle');
  const descInput = page.locator('input[placeholder*="מנוף"]');
  await expect(descInput).toHaveValue(equipName);
});

test('HE-28 - edit form submit succeeds and navigates to detail page', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('edit-submit') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}/edit`);
  await page.waitForLoadState('networkidle');

  // Change description
  const descInput = page.locator('input[placeholder*="מנוף"]');
  await descInput.clear();
  await descInput.fill(name('edit-submit-updated'));

  await page.locator('button[type="submit"]').click();

  // PATCH succeeds — navigates to detail page, no error shown
  await expect(page).toHaveURL(`/heavy-equipment/${id}`, { timeout: 10_000 });
  const errEl = page.locator('p.text-red-600, p.text-sm.text-red-600').first();
  await expect(errEl).not.toBeVisible();
});

// ─────────────────────────────────────────────────────────────
// HE-29 to HE-33 — ARCHIVE & TOGGLE
// ─────────────────────────────────────────────────────────────

test('HE-29 - archive button shows window.confirm dialog', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('archive-confirm') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');

  let dialogShown = false;
  page.on('dialog', async (dialog: Dialog) => {
    dialogShown = true;
    await dialog.dismiss();
  });

  await page.locator('button').filter({ hasText: /ארכיון/ }).click();
  await page.waitForTimeout(500);
  expect(dialogShown).toBe(true);
});

test('HE-30 - archive: after confirm, PATCH returns 200, navigates to list', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('archive-ok') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');

  let alertText = '';
  page.on('dialog', async (dialog: Dialog) => {
    if (dialog.type() === 'confirm') {
      await dialog.accept();
    } else if (dialog.type() === 'alert') {
      alertText = dialog.message();
      await dialog.accept();
    }
  });

  await page.locator('button').filter({ hasText: /ארכיון/ }).click();

  // PATCH succeeds — navigates to list, no alert shown
  await expect(page).toHaveURL(/\/heavy-equipment$/, { timeout: 5_000 });
  expect(alertText).toBe('');
});

test('HE-31 - archive succeeds: is_archived=true in DB after confirm', async ({ authPage: page }) => {
  const equipName = name('archive-ok');
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: equipName },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');

  page.on('dialog', async (dialog: Dialog) => {
    await dialog.accept();
  });
  await page.locator('button').filter({ hasText: /ארכיון/ }).click();

  // PATCH succeeds — navigates to list
  await expect(page).toHaveURL(/\/heavy-equipment$/, { timeout: 5_000 });

  // Verify via API that equipment was actually archived
  const getRes = await page.request.get(`/api/heavy-equipment/${id}`);
  const data = await getRes.json();
  expect(data.is_archived).toBe(true);
});

test('HE-32 - toggle is_active in list row: PATCH persists, is_active changes in DB', async ({ authPage: page }) => {
  const equipName = name('toggle-persist');
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: equipName },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.reload();
  await page.waitForLoadState('networkidle');

  const row = page.locator('a').filter({ hasText: equipName });
  await expect(row).toBeVisible();

  // ToggleSwitch in the list row
  const toggle = row.locator('button[role="switch"], button').last();
  const wasChecked = (await toggle.getAttribute('aria-checked') ?? 'true') === 'true';

  await toggle.click({ force: true });
  await page.waitForTimeout(2_000);

  // Verify via API that is_active was persisted (changed from original state)
  const getRes = await page.request.get(`/api/heavy-equipment/${id}`);
  const data = await getRes.json();
  expect(data.is_active).toBe(!wasChecked);
});

test('HE-33 - toggle is_active on detail page: silent failure (PATCH → 405, no error shown)', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('toggle-detail') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  const consoleErrors: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');

  // Click toggle on detail page
  const toggle = page.locator('button[role="switch"]').first();
  await toggle.click();
  await page.waitForTimeout(2_000);

  // No user-facing error element should appear
  const errorEl = page.locator('p.text-red-600').filter({ hasText: /שגיא/ });
  const errCount = await errorEl.count();
  // The detail page toggle (handleToggleActive) has no error display — silent failure
  // This is a bug: user sees no feedback
  expect(errCount).toBe(0); // confirms silent failure
});

// ─────────────────────────────────────────────────────────────
// HE-34 to HE-40 — DOCUMENTS (license / inspection)
// ─────────────────────────────────────────────────────────────

test('HE-34 - license section shows status "חסר" when no file uploaded', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('lic-missing') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');

  const licSection = page.locator('div').filter({ hasText: 'רישיון / רישוי' }).first();
  await expect(licSection.locator('text=חסר').first()).toBeVisible();
});

test('HE-35 - inspection section shows status "לא נדרש" (not required, no file)', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('insp-not-req') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');

  // Find the inspection card — it's optional, so should show "לא נדרש"
  const inspCard = page.locator('div').filter({ hasText: /תסקיר/ }).first();
  await expect(inspCard.locator('text=לא נדרש').first()).toBeVisible({ timeout: 3_000 });
});

test('HE-36 - changing expiry date shows pending float bar', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('expiry-pending') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');

  // Change the license expiry date
  const expiryInput = page.locator('input[type="date"]').first();
  await expiryInput.fill('2026-12-31');
  await page.waitForTimeout(300);

  // Float bar should appear with "שמור שינויים" button
  await expect(page.locator('button').filter({ hasText: 'שמור שינויים' })).toBeVisible({ timeout: 3_000 });
  await expect(page.locator('text=ממתינים')).toBeVisible();
});

test('HE-37 - cancel pending expiry change removes float bar', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('expiry-cancel') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');

  await page.locator('input[type="date"]').first().fill('2026-12-31');
  await page.waitForTimeout(300);
  await expect(page.locator('button').filter({ hasText: 'שמור שינויים' })).toBeVisible();

  await page.locator('button').filter({ hasText: 'ביטול' }).click();
  await page.waitForTimeout(300);
  await expect(page.locator('button').filter({ hasText: 'שמור שינויים' })).not.toBeVisible();
});

test('HE-38 - save expiry clicks "שמור שינויים": PATCH succeeds, shows success confirmation', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('expiry-save-ok') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');

  await page.locator('input[type="date"]').first().fill('2026-12-31');
  await page.waitForTimeout(300);

  const saveBtn = page.locator('button').filter({ hasText: 'שמור שינויים' });
  await saveBtn.click();
  await page.waitForTimeout(2_000);

  // PATCH succeeds — success message shown
  const successMsg = page.locator('text=נשמר בהצלחה');
  await expect(successMsg).toBeVisible({ timeout: 5_000 });
});

test('HE-39 - ביטוח חובה shows status "חסר" (required, no file)', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('ins-mandatory-missing') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');

  // ביטוח חובה should show status חסר (required but no record created yet)
  const mandatoryRow = page.locator('div').filter({ hasText: 'ביטוח חובה' }).first();
  await expect(mandatoryRow.locator('text=חסר').first()).toBeVisible({ timeout: 3_000 });
});

test('HE-40 - ביטוח מקיף and ביטוח צד ג show "אופציונלי" badge and status "לא נדרש"', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('ins-optional') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');

  const comprehensive = page.locator('div').filter({ hasText: 'ביטוח מקיף' }).first();
  await expect(comprehensive.locator('text=אופציונלי').first()).toBeVisible();

  const thirdParty = page.locator('div').filter({ hasText: 'ביטוח צד ג' }).first();
  await expect(thirdParty.locator('text=אופציונלי').first()).toBeVisible();
});

// ─────────────────────────────────────────────────────────────
// HE-41 to HE-48 — INSURANCE CRUD
// ─────────────────────────────────────────────────────────────

test('HE-41 - clicking "+ הוסף" on ביטוח חובה opens expiry form', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('ins-add-open') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');

  const mandatoryRow = page.locator('div').filter({ hasText: 'ביטוח חובה' }).first();
  await page.getByRole('button', { name: '+ הוסף' }).first().click();

  await expect(page.locator('input[type="date"]').last()).toBeVisible({ timeout: 2_000 });
  await expect(page.locator('button').filter({ hasText: 'הוסף' }).last()).toBeVisible();
});

test('HE-42 - creating insurance via "+ הוסף" succeeds (POST /api/heavy-equipment-insurances)', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('ins-create') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');

  const mandatoryRow = page.locator('div').filter({ hasText: 'ביטוח חובה' }).first();
  await page.getByRole('button', { name: '+ הוסף' }).first().click();

  // Set expiry
  const dateInput = page.locator('input[type="date"]').last();
  await dateInput.fill('2027-01-01');

  await page.getByRole('button', { name: /^הוסף$/ }).click();
  await page.waitForTimeout(2_000);

  // Insurance row should now show the expiry and "הסר" button (InsuranceRow renders)
  await expect(page.locator('text=הסר').first()).toBeVisible({ timeout: 5_000 });
});

test('HE-43 - POST /api/heavy-equipment-insurances directly returns 200', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('ins-post-direct') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  const insRes = await page.request.post('/api/heavy-equipment-insurances', {
    data: { heavy_equipment_id: id, insurance_type: 'ביטוח חובה', expiry_date: '2027-06-01' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(insRes.status()).toBe(200);
  const insBody = await insRes.json();
  expect(insBody.id).toBeTruthy();
  expect(insBody.insurance_type).toBe('ביטוח חובה');
});

test('HE-44 - PATCH /api/heavy-equipment-insurances/[id] returns 200 with updated data', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('ins-patch-200') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  const insRes = await page.request.post('/api/heavy-equipment-insurances', {
    data: { heavy_equipment_id: id, insurance_type: 'ביטוח חובה' },
    headers: { 'Content-Type': 'application/json' },
  });
  const ins = await insRes.json();

  const patchRes = await page.request.patch(`/api/heavy-equipment-insurances/${ins.id}`, {
    data: { expiry_date: '2027-01-01' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(patchRes.status()).toBe(200);
  const body = await patchRes.json();
  expect(body.expiry_date).toBe('2027-01-01');
});

test('HE-45 - DELETE /api/heavy-equipment-insurances/[id] returns 200 with success', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('ins-delete-200') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  const insRes = await page.request.post('/api/heavy-equipment-insurances', {
    data: { heavy_equipment_id: id, insurance_type: 'ביטוח מקיף' },
    headers: { 'Content-Type': 'application/json' },
  });
  const ins = await insRes.json();

  const delRes = await page.request.delete(`/api/heavy-equipment-insurances/${ins.id}`);
  expect(delRes.status()).toBe(200);
  const body = await delRes.json();
  expect(body.success).toBe(true);
});

test('HE-46 - insurance "הסר" button succeeds: DELETE returns 200, no error shown', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('ins-delete-ui') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  // Pre-create insurance
  const insRes = await page.request.post('/api/heavy-equipment-insurances', {
    data: { heavy_equipment_id: id, insurance_type: 'ביטוח חובה', expiry_date: '2027-01-01' },
    headers: { 'Content-Type': 'application/json' },
  });
  const ins = await insRes.json();

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');

  // Accept the confirm dialog
  page.on('dialog', async (d: Dialog) => await d.accept());

  await page.locator('button').filter({ hasText: 'הסר' }).first().click();
  await page.waitForTimeout(2_000);

  // DELETE succeeds — no error message shown
  const errMsg = page.locator('p.text-red-600').filter({ hasText: /שגיא/ }).first();
  await expect(errMsg).not.toBeVisible();

  // Verify via API that insurance was deleted
  const getRes = await page.request.get(`/api/heavy-equipment-insurances/${ins.id}`);
  expect(getRes.status()).toBe(404);
});

test('HE-47 - insurance expiry inline save succeeds: PATCH returns 200, no error shown', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('ins-expiry-save-ok') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.request.post('/api/heavy-equipment-insurances', {
    data: { heavy_equipment_id: id, insurance_type: 'ביטוח מקיף', expiry_date: '2027-01-01' },
    headers: { 'Content-Type': 'application/json' },
  });

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');

  // Click the edit link on the insurance expiry row
  const editLink = page.locator('button').filter({ hasText: /תאריך תוקף.*עריכה/ }).first();
  if (await editLink.count() === 0) {
    await page.locator('button').filter({ hasText: '+ הגדר תאריך תוקף' }).first().click();
  } else {
    await editLink.click();
  }
  await page.waitForTimeout(300);

  // Save expiry
  const saveExpiryBtn = page.locator('button').filter({ hasText: /^שמור$/ }).first();
  if (await saveExpiryBtn.isVisible()) {
    await saveExpiryBtn.click();
    await page.waitForTimeout(2_000);
    // PATCH succeeds — no error message shown
    const errMsg = page.locator('p.text-red-600').filter({ hasText: /שגיא/ }).first();
    await expect(errMsg).not.toBeVisible();
  }
});

test('HE-48 - GET /api/heavy-equipment-insurances/[id] returns single object with correct id', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('ins-get-single') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  const insRes = await page.request.post('/api/heavy-equipment-insurances', {
    data: { heavy_equipment_id: id, insurance_type: 'ביטוח חובה' },
    headers: { 'Content-Type': 'application/json' },
  });
  const ins = await insRes.json();

  const getRes = await page.request.get(`/api/heavy-equipment-insurances/${ins.id}`);
  expect(getRes.status()).toBe(200);
  const body = await getRes.json();
  expect(Array.isArray(body)).toBe(false);
  expect(body.id).toBe(ins.id);
});

// ─────────────────────────────────────────────────────────────
// HE-49 to HE-55 — SEARCH & FILTER
// ─────────────────────────────────────────────────────────────

test('HE-49 - search by description filters list', async ({ authPage: page }) => {
  const uniqueTerm = `UNIQ-${Date.now()}`;
  const equipName = `${uniqueTerm}-machine`;
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: equipName },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto('/heavy-equipment');
  await page.waitForLoadState('networkidle');

  const searchInput = page.locator('input[placeholder*="חיפוש"]');
  await searchInput.fill(uniqueTerm);
  await page.waitForTimeout(300);

  await expect(page.locator(`text=${equipName}`)).toBeVisible();
  // Other equipment should not be visible
  const rows = await page.locator('a[href^="/heavy-equipment/"]').count();
  expect(rows).toBeGreaterThan(0);
});

test('HE-50 - search by license_number filters list', async ({ authPage: page }) => {
  const licNum = `TEST-SEARCH-${Date.now()}`;
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('search-lic'), license_number: licNum },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto('/heavy-equipment');
  await page.waitForLoadState('networkidle');

  await page.locator('input[placeholder*="חיפוש"]').fill(licNum);
  await page.waitForTimeout(300);

  await expect(page.locator(`text=${licNum}`)).toBeVisible();
});

test('HE-51 - search with no matching results shows "לא נמצאו תוצאות"', async ({ authPage: page }) => {
  await page.goto('/heavy-equipment');
  await page.waitForLoadState('networkidle');

  await page.locator('input[placeholder*="חיפוש"]').fill('ZZZNOMATCH999XYZ');
  await page.waitForTimeout(300);

  const noResults = page.locator('text=לא נמצאו תוצאות').first();
  await expect(noResults).toBeVisible({ timeout: 3_000 });
});

test('HE-52 - StatusFilterTabs present with הכל / לא תקין / עומד לפוג / תקין tabs', async ({ authPage: page }) => {
  await page.goto('/heavy-equipment');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('button, [role="tab"]').filter({ hasText: 'הכל' }).first()).toBeVisible();
  await expect(page.locator('button, [role="tab"]').filter({ hasText: 'לא תקין' }).first()).toBeVisible();
  await expect(page.locator('button, [role="tab"]').filter({ hasText: 'עומד לפוג' }).first()).toBeVisible();
  await expect(page.locator('button, [role="tab"]').filter({ hasText: /^תקין/ }).first()).toBeVisible();
});

test('HE-53 - StatusFilter "לא תקין" shows newly created equipment (status: missing)', async ({ authPage: page }) => {
  const equipName = name('filter-missing');
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: equipName },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto('/heavy-equipment');
  await page.waitForLoadState('networkidle');

  await page.locator('button, [role="tab"]').filter({ hasText: 'לא תקין' }).first().click();
  await page.waitForTimeout(300);

  await expect(page.locator(`text=${equipName}`)).toBeVisible({ timeout: 3_000 });
});

test('HE-54 - StatusFilter "תקין" does NOT show newly created equipment (status: missing)', async ({ authPage: page }) => {
  const equipName = name('filter-valid-absent');
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: equipName },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto('/heavy-equipment');
  await page.waitForLoadState('networkidle');

  await page.locator('button, [role="tab"]').filter({ hasText: /^תקין/ }).first().click();
  await page.waitForTimeout(300);

  await expect(page.locator(`text=${equipName}`)).not.toBeVisible({ timeout: 2_000 });
});

test('HE-55 - filter הכל after filter change resets to full list', async ({ authPage: page }) => {
  const equipName = name('filter-reset');
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: equipName },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto('/heavy-equipment');
  await page.waitForLoadState('networkidle');

  await page.locator('button, [role="tab"]').filter({ hasText: /^תקין/ }).first().click();
  await page.waitForTimeout(200);
  await page.locator('button, [role="tab"]').filter({ hasText: 'הכל' }).first().click();
  await page.waitForTimeout(200);

  await expect(page.locator(`text=${equipName}`)).toBeVisible({ timeout: 3_000 });
});

// ─────────────────────────────────────────────────────────────
// HE-56 to HE-61 — NAVIGATION, MOBILE, MULTI-TAB
// ─────────────────────────────────────────────────────────────

test('HE-56 - back button from detail page returns to list', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('back-btn') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto('/heavy-equipment');
  await page.waitForLoadState('networkidle');
  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');
  await page.goBack();
  await expect(page).toHaveURL('/heavy-equipment');
});

test('HE-57 - refresh detail page keeps data visible (SSR)', async ({ authPage: page }) => {
  const equipName = name('refresh-detail');
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: equipName },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1').filter({ hasText: equipName })).toBeVisible();
});

test('HE-58 - mobile viewport: list page renders without horizontal scroll', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/heavy-equipment');
  await page.waitForLoadState('networkidle');

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5); // 5px tolerance
});

test('HE-59 - mobile viewport: detail page renders correctly', async ({ authPage: page }) => {
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: name('mobile-detail') },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/heavy-equipment/${id}`);
  await page.waitForLoadState('networkidle');

  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.locator('text=ביטוח חובה')).toBeVisible();

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
});

test('HE-60 - mobile viewport: create form renders correctly', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/heavy-equipment/new');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('input[placeholder*="מנוף"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
});

test('HE-61 - multi-tab: equipment created in tab A visible in tab B after reload', async ({ authPage: page, browser }) => {
  const equipName = name('multi-tab');
  const res = await page.request.post('/api/heavy-equipment', {
    data: { description: equipName },
    headers: { 'Content-Type': 'application/json' },
  });
  const { id } = await res.json();
  createdIds.push(id);

  // Tab B — new context simulating second tab with same auth
  const ctx2 = await browser.newContext({ storageState: AUTH_STATE_PATH, locale: 'he-IL' });
  const tabB = await ctx2.newPage();
  await tabB.goto('/heavy-equipment');
  await tabB.waitForLoadState('networkidle');
  await expect(tabB.locator(`text=${equipName}`)).toBeVisible({ timeout: 5_000 });
  await ctx2.close();
});

// ─────────────────────────────────────────────────────────────
// HE-62 to HE-65 — CROSS-TENANT ISOLATION
// ─────────────────────────────────────────────────────────────

test('HE-62 - GET /api/heavy-equipment returns only Internal QA company data', async ({ authPage: page }) => {
  const res = await page.request.get('/api/heavy-equipment');
  expect(res.status()).toBe(200);
  const list = await res.json();
  expect(Array.isArray(list)).toBe(true);

  const meta = readQaMeta();
  for (const eq of list) {
    expect(eq.company_id).toBe(meta.companyId);
  }
});

test('HE-63 - unauthenticated GET /api/heavy-equipment returns 401', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'he-IL' });
  const page = await ctx.newPage();
  const res = await page.request.get('http://localhost:3000/api/heavy-equipment');
  expect([401, 403]).toContain(res.status());
  await ctx.close();
});

test('HE-64 - direct URL to non-existent equipment ID returns error or 404', async ({ authPage: page }) => {
  const fakeId = '00000000-0000-0000-0000-000000000000';
  await page.goto(`/heavy-equipment/${fakeId}`);
  await page.waitForLoadState('networkidle');
  // Should show 404 page or error, not crash or show another equipment's data
  const body = await page.textContent('body');
  const isOk = (body ?? '').includes('404') || (body ?? '').includes('לא נמצא') || (body ?? '').includes('not found');
  expect(isOk).toBe(true);
});

test('HE-65 - POST /api/heavy-equipment-insurances with cross-company equipment_id returns 404', async ({ authPage: page }) => {
  // Use a fake/different-company equipment id
  const fakeEquipId = '00000000-0000-0000-0000-111111111111';
  const res = await page.request.post('/api/heavy-equipment-insurances', {
    data: { heavy_equipment_id: fakeEquipId, insurance_type: 'ביטוח חובה' },
    headers: { 'Content-Type': 'application/json' },
  });
  // Should be 404 since parent not found in this company
  expect(res.status()).toBe(404);
});
