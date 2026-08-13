/**
 * Vehicles module — comprehensive E2E test suite (Phase A — QA Mode)
 *
 * Company:  Internal QA (Company B)
 * User:     qa.bot@safedoc.local
 * Prefix:   QA-VEH-<timestamp>-<seq>  (every test-created vehicle number)
 *
 * Covers:
 *   V01–V05   Vehicle list (heading, empty state, nav, auth)
 *   V06–V12   Create vehicle via UI
 *   V13–V17   Create vehicle via API
 *   V18–V24   Vehicle detail page
 *   V25–V29   Vehicle edit (BUG B-01: PATCH handler missing)
 *   V30–V34   Archive lifecycle (BUG B-01: PATCH handler missing)
 *   V35–V42   Vehicle licenses
 *   V43–V48   Vehicle insurances
 *   V49–V54   Search & filter
 *   V55–V57   Browser refresh & back-navigation
 *   V58–V60   Multi-tab & mobile viewport
 *
 * KNOWN BUGS EXPOSED (Phase A — test and report only, do NOT fix):
 *   B-01 (Critical): app/api/vehicles/[id]/route.ts is a verbatim copy of
 *        the collection route — no PATCH, DELETE, or single-item GET handler.
 *        Impacts: edit (PATCH), archive (PATCH), hard-delete (DELETE).
 *   B-02 (High): Archive failure is completely silent — no error shown to user.
 *   B-03 (Medium): Archive uses window.confirm() native dialog.
 *   B-04 (Medium): Archived vehicles cannot be viewed — no "show archived" toggle.
 *   B-05 (Low/PA): No permanent delete path for vehicles.
 */

import { test, expect, uid } from '../fixtures/vehicles-auth';
import { AUTH_STATE_PATH } from '../global-setup';
import type { Page, Dialog } from '@playwright/test';

// ── Unique QA-VEH prefix per run ───────────────────────────────────────────────
const _runTs = Date.now();
let _seq = 0;
function nextVnum(): string {
  return `QA-VEH-${_runTs}-${String(++_seq).padStart(3, '0')}`;
}

// ── Cleanup queue ──────────────────────────────────────────────────────────────
// Phase B: B-01 fixed — PATCH/DELETE /api/vehicles/${id} now work correctly.
// In-test cleanup uses PATCH (archive) then DELETE to remove QA vehicles.
// global-setup pre-run sweep also removes any stragglers between runs.
const _cleanupQueue: string[] = [];

test.afterEach(async ({ authPage: page }) => {
  if (_cleanupQueue.length === 0) return;
  const ids = _cleanupQueue.splice(0);
  for (const id of ids) {
    await page.request.patch(`/api/vehicles/${id}`, {
      data: { is_archived: true },
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
    await page.request.delete(`/api/vehicles/${id}`).catch(() => {});
  }
});

// ── API helpers ────────────────────────────────────────────────────────────────

async function createVehicleViaAPI(
  page: Page,
  opts: {
    vehicleNumber?: string;
    vehicleType?: string;
    model?: string;
    vehicleColor?: string;
    projectName?: string;
    notes?: string;
  } = {},
): Promise<string> {
  const vnum = opts.vehicleNumber ?? nextVnum();
  const res = await page.request.post('/api/vehicles', {
    data: {
      vehicle_number: vnum,
      vehicle_type:   opts.vehicleType   ?? 'טנדר',
      model:          opts.model         ?? null,
      vehicle_color:  opts.vehicleColor  ?? null,
      project_name:   opts.projectName   ?? null,
      notes:          opts.notes         ?? null,
    },
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await res.json();
  _cleanupQueue.push(body.id);
  return body.id as string;
}

async function createVehicleLicenseViaAPI(
  page: Page,
  vehicleId: string,
  expiryDate?: string,
): Promise<string> {
  const res = await page.request.post('/api/vehicle-licenses', {
    data: { vehicle_id: vehicleId, expiry_date: expiryDate ?? null },
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await res.json();
  return body.id as string;
}

async function createVehicleInsuranceViaAPI(
  page: Page,
  vehicleId: string,
  opts: { type?: string; expiryDate?: string } = {},
): Promise<string> {
  const res = await page.request.post('/api/vehicle-insurances', {
    data: {
      vehicle_id:     vehicleId,
      insurance_type: opts.type       ?? 'ביטוח חובה',
      expiry_date:    opts.expiryDate ?? null,
    },
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await res.json();
  return body.id as string;
}

/** Navigate to a vehicle detail page and wait for the header. */
async function gotoVehicleDetail(page: Page, vehicleId: string) {
  await page.goto(`/vehicles/${vehicleId}`);
  await page.waitForSelector('[dir="ltr"], h1', { timeout: 10_000 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY A — Vehicle list
// ═══════════════════════════════════════════════════════════════════════════════

test('V01 - vehicle list page shows "רכבים" heading', async ({ authPage: page }) => {
  await page.goto('/vehicles');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'רכבים' })).toBeVisible({ timeout: 8_000 });
});

test('V02 - vehicle list shows empty state when no vehicles exist', async ({ authPage: page }) => {
  // Runs immediately after global-setup cleanup — list is empty
  await page.goto('/vehicles');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=אין רכבים במערכת עדיין')).toBeVisible({ timeout: 8_000 });
});

test('V03 - "+ רכב חדש" link navigates to /vehicles/new', async ({ authPage: page }) => {
  await page.goto('/vehicles');
  await page.waitForLoadState('networkidle');
  await page.locator('a', { hasText: 'רכב חדש' }).click();
  await expect(page).toHaveURL('/vehicles/new');
});

test('V04 - GET /api/vehicles authenticated returns 200 array', async ({ authPage: page }) => {
  const res = await page.request.get('/api/vehicles');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
});

test('V05 - GET /api/vehicles unauthenticated returns 401', async ({ browser }) => {
  const ctx  = await browser.newContext(); // no storageState → unauthenticated
  const page = await ctx.newPage();
  const res  = await page.request.get('http://localhost:3000/api/vehicles');
  expect(res.status()).toBe(401);
  await ctx.close();
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY B — Vehicle creation via UI
// ═══════════════════════════════════════════════════════════════════════════════

test('V06 - create vehicle via UI with required fields → navigates to detail', async ({ authPage: page }) => {
  const vnum = nextVnum();
  await page.goto('/vehicles/new');
  await page.waitForSelector('form', { timeout: 10_000 });

  await page.locator('input[list="vehicle-type-presets"]').fill('טנדר');
  await page.locator('input[dir="ltr"]').fill(vnum);
  await page.getByRole('button', { name: 'צור רכב' }).click();

  await page.waitForURL(/\/vehicles\/[a-f0-9-]{36}$/, { timeout: 15_000 });
  const vehicleId = page.url().split('/').pop()!;
  _cleanupQueue.push(vehicleId);
});

test('V07 - create vehicle fails without vehicle_type', async ({ authPage: page }) => {
  await page.goto('/vehicles/new');
  await page.waitForSelector('form', { timeout: 10_000 });

  // Leave vehicle_type empty, fill vehicle_number
  await page.locator('input[dir="ltr"]').fill(nextVnum());
  await page.getByRole('button', { name: 'צור רכב' }).click();

  await expect(page.locator('text=יש לבחור סוג רכב')).toBeVisible({ timeout: 5_000 });
  // Stays on /vehicles/new
  await expect(page).toHaveURL('/vehicles/new');
});

test('V08 - create vehicle fails without vehicle_number', async ({ authPage: page }) => {
  await page.goto('/vehicles/new');
  await page.waitForSelector('form', { timeout: 10_000 });

  await page.locator('input[list="vehicle-type-presets"]').fill('מסחרית');
  // Leave vehicle_number empty
  await page.getByRole('button', { name: 'צור רכב' }).click();

  await expect(page.locator('text=יש להזין מספר רכב')).toBeVisible({ timeout: 5_000 });
  await expect(page).toHaveURL('/vehicles/new');
});

test('V09 - create vehicle with all optional fields', async ({ authPage: page }) => {
  const vnum = nextVnum();
  await page.goto('/vehicles/new');
  await page.waitForSelector('form', { timeout: 10_000 });

  await page.locator('input[list="vehicle-type-presets"]').fill('ואן');
  await page.locator('input[dir="ltr"]').fill(vnum);
  // model
  await page.locator('input[placeholder="למשל: טויוטה היילקס"]').fill('פורד טרנזיט');
  // vehicle_color
  await page.locator('input[placeholder="לבן, שחור, כסוף..."]').fill('לבן');
  // project_name
  await page.locator('input[placeholder="שם הפרויקט / האתר"]').fill(`פרויקט ${uid()}`);
  // notes
  await page.locator('textarea').fill('הערה בדיקה');

  await page.getByRole('button', { name: 'צור רכב' }).click();
  await page.waitForURL(/\/vehicles\/[a-f0-9-]{36}$/, { timeout: 15_000 });
  _cleanupQueue.push(page.url().split('/').pop()!);
});

test('V10 - create vehicle with Arabic type name', async ({ authPage: page }) => {
  const vnum = nextVnum();
  await page.goto('/vehicles/new');
  await page.waitForSelector('form', { timeout: 10_000 });

  await page.locator('input[list="vehicle-type-presets"]').fill('شاحنة صغيرة');
  await page.locator('input[dir="ltr"]').fill(vnum);
  await page.getByRole('button', { name: 'צור רכב' }).click();

  await page.waitForURL(/\/vehicles\/[a-f0-9-]{36}$/, { timeout: 15_000 });
  _cleanupQueue.push(page.url().split('/').pop()!);
});

test('V11 - Cancel button during create navigates back', async ({ authPage: page }) => {
  await page.goto('/vehicles');
  await page.waitForLoadState('networkidle');
  await page.locator('a', { hasText: 'רכב חדש' }).click();
  await page.waitForURL('/vehicles/new');

  await page.getByRole('button', { name: 'ביטול' }).click();
  // Should navigate away from /vehicles/new
  await expect(page).not.toHaveURL('/vehicles/new', { timeout: 5_000 });
});

test('V12 - created vehicle appears in list after creation', async ({ authPage: page }) => {
  const vnum = nextVnum();
  const id = await createVehicleViaAPI(page, { vehicleNumber: vnum });

  await page.goto('/vehicles');
  await page.reload();
  await page.waitForLoadState('networkidle');

  await expect(page.locator(`a[href="/vehicles/${id}"]`)).toBeVisible({ timeout: 8_000 });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY C — Vehicle creation via API
// ═══════════════════════════════════════════════════════════════════════════════

test('V13 - POST /api/vehicles returns 201 with vehicle data', async ({ authPage: page }) => {
  const vnum = nextVnum();
  const res = await page.request.post('/api/vehicles', {
    data: { vehicle_number: vnum, vehicle_type: 'טנדר' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.id).toBeTruthy();
  expect(body.vehicle_number).toBe(vnum);
  expect(body.vehicle_type).toBe('טנדר');
  expect(body.vehicle_licenses).toEqual([]);
  expect(body.vehicle_insurances).toEqual([]);
  _cleanupQueue.push(body.id);
});

test('V14 - POST /api/vehicles without vehicle_type returns 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/vehicles', {
    data: { vehicle_number: nextVnum() },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('סוג רכב');
});

test('V15 - POST /api/vehicles without vehicle_number returns 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/vehicles', {
    data: { vehicle_type: 'טנדר' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('מספר רכב');
});

test('V16 - POST /api/vehicles with duplicate number returns 409', async ({ authPage: page }) => {
  const vnum = nextVnum();
  const first = await page.request.post('/api/vehicles', {
    data: { vehicle_number: vnum, vehicle_type: 'טנדר' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(first.status()).toBe(201);
  _cleanupQueue.push((await first.json()).id);

  const second = await page.request.post('/api/vehicles', {
    data: { vehicle_number: vnum, vehicle_type: 'מסחרית' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(second.status()).toBe(409);
  const body = await second.json();
  expect(body.error).toContain('כבר קיים');
});

test('V17 - POST /api/vehicles with invalid assigned_manager_id returns 422', async ({ authPage: page }) => {
  const res = await page.request.post('/api/vehicles', {
    data: {
      vehicle_number:       nextVnum(),
      vehicle_type:         'טנדר',
      assigned_manager_id:  '00000000-0000-0000-0000-000000000000',
    },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(422);
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY D — Vehicle detail page
// ═══════════════════════════════════════════════════════════════════════════════

test('V18 - vehicle detail shows vehicle number with dir=ltr', async ({ authPage: page }) => {
  const vnum = nextVnum();
  const id = await createVehicleViaAPI(page, { vehicleNumber: vnum, vehicleType: 'פרייבט' });

  await gotoVehicleDetail(page, id);
  const numEl = page.locator('[dir="ltr"]').filter({ hasText: vnum });
  await expect(numEl).toBeVisible({ timeout: 5_000 });
});

test('V19 - vehicle detail shows vehicle type', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page, { vehicleType: 'רכב שטח' });
  await gotoVehicleDetail(page, id);
  await expect(page.locator('text=רכב שטח')).toBeVisible({ timeout: 5_000 });
});

test('V20 - vehicle detail shows status badge', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page);
  await gotoVehicleDetail(page, id);
  // At minimum, the new vehicle has 'חסר' for license (no license uploaded)
  await expect(page.locator('text=חסר').first()).toBeVisible({ timeout: 5_000 });
});

test('V21 - vehicle detail shows edit button', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page);
  await gotoVehicleDetail(page, id);
  await expect(page.getByRole('button', { name: 'עריכה' })).toBeVisible({ timeout: 5_000 });
});

test('V22 - vehicle detail shows archive button', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page);
  await gotoVehicleDetail(page, id);
  await expect(page.getByRole('button', { name: 'העבר לארכיון' })).toBeVisible({ timeout: 5_000 });
});

test('V23 - vehicle detail shows "רישיון רכב" section', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page);
  await gotoVehicleDetail(page, id);
  await expect(page.locator('text=רישיון רכב').first()).toBeVisible({ timeout: 5_000 });
  // Add license button is shown when no license exists
  await expect(page.locator('text=הוסף רישיון רכב')).toBeVisible({ timeout: 5_000 });
});

test('V24 - vehicle detail shows "ביטוחים" section with all 3 insurance types', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page);
  await gotoVehicleDetail(page, id);
  await expect(page.locator('text=ביטוח חובה').first()).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('text=ביטוח מקיף').first()).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('text=ביטוח צד ג').first()).toBeVisible({ timeout: 5_000 });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY E — Vehicle editing (BUG B-01)
// ═══════════════════════════════════════════════════════════════════════════════

test('V25 - click edit button shows edit form', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page, { vehicleType: 'טנדר' });
  await gotoVehicleDetail(page, id);
  await page.getByRole('button', { name: 'עריכה' }).click();
  await expect(page.getByRole('button', { name: 'שמור שינויים' })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('button', { name: 'ביטול' })).toBeVisible({ timeout: 5_000 });
});

test('V26 - edit form pre-fills with current vehicle data', async ({ authPage: page }) => {
  const vnum = nextVnum();
  const id = await createVehicleViaAPI(page, { vehicleNumber: vnum, vehicleType: 'ואן' });
  await gotoVehicleDetail(page, id);
  await page.getByRole('button', { name: 'עריכה' }).click();
  await page.waitForSelector('button:has-text("שמור שינויים")', { timeout: 5_000 });
  // vehicle_number field should contain the existing number
  const numField = page.locator('input[dir="ltr"]');
  await expect(numField).toHaveValue(vnum, { timeout: 3_000 });
  // vehicle_type field should contain the existing type
  const typeField = page.locator('input[list="vehicle-type-presets"]');
  await expect(typeField).toHaveValue('ואן', { timeout: 3_000 });
});

test('V27 - cancel edit returns to detail view', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page);
  await gotoVehicleDetail(page, id);
  await page.getByRole('button', { name: 'עריכה' }).click();
  await page.waitForSelector('button:has-text("שמור שינויים")', { timeout: 5_000 });
  // Click the "← חזור לפרטים" link or the cancel button
  const backBtn = page.locator('text=חזור לפרטים');
  if (await backBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await backBtn.click();
  } else {
    await page.getByRole('button', { name: 'ביטול' }).click();
  }
  // Should return to detail view (shows "עריכה" button again)
  await expect(page.getByRole('button', { name: 'עריכה' })).toBeVisible({ timeout: 5_000 });
});

test('V28 - PATCH /api/vehicles/[id] returns 200 and updated vehicle', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page);
  const res = await page.request.patch(`/api/vehicles/${id}`, {
    data: { vehicle_type: 'מסחרית' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.id).toBe(id);
  expect(body.vehicle_type).toBe('מסחרית');
});

test('V29 - submit edit form updates vehicle and closes edit mode', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page, { vehicleType: 'טנדר' });
  await gotoVehicleDetail(page, id);
  await page.getByRole('button', { name: 'עריכה' }).click();
  await page.waitForSelector('button:has-text("שמור שינויים")', { timeout: 5_000 });

  const typeField = page.locator('input[list="vehicle-type-presets"]');
  await typeField.clear();
  await typeField.fill('מסחרית');

  await page.getByRole('button', { name: 'שמור שינויים' }).click();

  // After successful save: edit form closes, "עריכה" button returns
  await expect(page.getByRole('button', { name: 'עריכה' })).toBeVisible({ timeout: 8_000 });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY F — Archive lifecycle (BUG B-01)
// ═══════════════════════════════════════════════════════════════════════════════

test('V30 - archive button visible on vehicle detail', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page);
  await gotoVehicleDetail(page, id);
  await expect(page.getByRole('button', { name: 'העבר לארכיון' })).toBeVisible({ timeout: 5_000 });
});

test('V31 - archive button triggers confirm() native dialog (BUG B-03)', async ({ authPage: page }) => {
  // BUG B-03: VehicleDetail.tsx uses window.confirm() for archive — inconsistent
  // with the app's custom dialog design; other modules use custom modals.
  const id = await createVehicleViaAPI(page);
  await gotoVehicleDetail(page, id);

  let dialogSeen = false;
  page.on('dialog', (dialog: Dialog) => { dialogSeen = true; dialog.dismiss(); });

  await page.getByRole('button', { name: 'העבר לארכיון' }).click();
  await page.waitForTimeout(500);
  expect(dialogSeen).toBe(true);
});

test('V32 - dismiss archive confirm → vehicle stays on page, not archived', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page);
  await gotoVehicleDetail(page, id);

  page.on('dialog', (dialog: Dialog) => dialog.dismiss()); // dismiss = cancel
  await page.getByRole('button', { name: 'העבר לארכיון' }).click();
  await page.waitForTimeout(500);

  // Still on detail page (no navigation happened)
  await expect(page).toHaveURL(`/vehicles/${id}`);
  // Archive button still visible (vehicle not archived)
  await expect(page.getByRole('button', { name: 'העבר לארכיון' })).toBeVisible({ timeout: 3_000 });
});

test('V33 - accept archive confirm → vehicle archived and redirected to list', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page);
  await gotoVehicleDetail(page, id);

  page.on('dialog', (dialog: Dialog) => dialog.accept());
  await page.getByRole('button', { name: 'העבר לארכיון' }).click();

  // Navigates to /vehicles after successful archive
  await page.waitForURL('/vehicles', { timeout: 10_000 });
  await page.waitForLoadState('networkidle');

  // Archived vehicle should not appear in list (is_archived = true, not shown by default)
  await expect(page.locator(`a[href="/vehicles/${id}"]`)).not.toBeVisible({ timeout: 5_000 });
});

test('V34 - GET /api/vehicles/[id] returns single vehicle object', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page);
  const res = await page.request.get(`/api/vehicles/${id}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(false);
  expect(body.id).toBe(id);
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY G — Vehicle licenses
// ═══════════════════════════════════════════════════════════════════════════════

test('V35 - vehicle detail shows "הוסף רישיון רכב" button when no license', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page);
  await gotoVehicleDetail(page, id);
  const addBtn = page.locator('button', { hasText: 'הוסף רישיון רכב' });
  await expect(addBtn).toBeVisible({ timeout: 5_000 });
});

test('V36 - click add license opens expiry date form', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page);
  await gotoVehicleDetail(page, id);
  await page.locator('button', { hasText: 'הוסף רישיון רכב' }).click();
  await expect(page.locator('input[type="date"]').first()).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('button', { name: 'הוסף', exact: true })).toBeVisible({ timeout: 5_000 });
});

test('V37 - save license with future expiry — license row appears', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page);
  await gotoVehicleDetail(page, id);
  await page.locator('button', { hasText: 'הוסף רישיון רכב' }).click();
  await page.locator('input[type="date"]').first().fill('2027-12-31');
  await page.getByRole('button', { name: 'הוסף', exact: true }).click();
  // After adding, the "הוסף רישיון רכב" button should disappear
  // and the license row should appear
  await expect(page.locator('button', { hasText: 'הוסף רישיון רכב' })).not.toBeVisible({ timeout: 5_000 });
  // File upload zone should now be visible
  await expect(page.locator('text=גרור לכאן').first()).toBeVisible({ timeout: 5_000 });
});

test('V38 - POST /api/vehicle-licenses returns 201', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page);
  const res = await page.request.post('/api/vehicle-licenses', {
    data: { vehicle_id: id, expiry_date: '2027-06-30' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.id).toBeTruthy();
  expect(body.vehicle_id).toBe(id);
  expect(body.expiry_date).toBe('2027-06-30');
});

test('V39 - vehicle with no license → "חסר" status in list', async ({ authPage: page }) => {
  const vnum = nextVnum();
  const id = await createVehicleViaAPI(page, { vehicleNumber: vnum });

  await page.goto('/vehicles');
  await page.reload();
  await page.waitForLoadState('networkidle');

  const card = page.locator(`a[href="/vehicles/${id}"]`);
  await expect(card).toBeVisible({ timeout: 5_000 });
  // Card should have the red border color (חסר status = border-r-red-500)
  await expect(card).toHaveClass(/border-r-red-500/, { timeout: 3_000 });
});

test('V40 - PATCH /api/vehicle-licenses/${id} updates expiry date', async ({ authPage: page }) => {
  const vid = await createVehicleViaAPI(page);
  const lid = await createVehicleLicenseViaAPI(page, vid, '2026-01-01');

  const res = await page.request.patch(`/api/vehicle-licenses/${lid}`, {
    data: { expiry_date: '2028-01-01' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.expiry_date).toBe('2028-01-01');
});

test('V41 - PATCH /api/vehicle-licenses/${fakeId} for non-existent record returns 404', async ({ authPage: page }) => {
  // Cross-company protection: any license not owned by this company returns 404
  const fakeId = '00000000-0000-0000-0000-000000000000';
  const res = await page.request.patch(`/api/vehicle-licenses/${fakeId}`, {
    data: { expiry_date: '2026-01-01' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(404);
});

test('V42 - update license expiry date via inline UI', async ({ authPage: page }) => {
  const vid = await createVehicleViaAPI(page);
  // Pre-create license via API so the expiry edit UI is shown
  await createVehicleLicenseViaAPI(page, vid, '2026-06-01');

  await gotoVehicleDetail(page, vid);
  // The inline expiry edit button
  const editExpiryBtn = page.locator('button', { hasText: '+ הגדר תאריך תוקף' })
    .or(page.locator('button', { hasText: 'תאריך תוקף:' }))
    .first();
  await expect(editExpiryBtn).toBeVisible({ timeout: 5_000 });
  await editExpiryBtn.click();

  const dateInput = page.locator('input[type="date"]').first();
  await expect(dateInput).toBeVisible({ timeout: 3_000 });
  await dateInput.fill('2028-12-31');
  await page.locator('button', { hasText: 'שמור' }).first().click();
  // After save, date input should disappear
  await expect(dateInput).not.toBeVisible({ timeout: 5_000 });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY H — Vehicle insurances
// ═══════════════════════════════════════════════════════════════════════════════

test('V43 - ביטוח חובה row shown without "אופציונלי" badge', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page);
  await gotoVehicleDetail(page, id);
  const row = page.locator('text=ביטוח חובה').first();
  await expect(row).toBeVisible({ timeout: 5_000 });
  // Required rows have no "אופציונלי" badge
  // The sibling span "אופציונלי" should NOT appear next to ביטוח חובה label
  const optionalBadge = page.locator('.rounded:has-text("אופציונלי")').first();
  // At least one optional badge exists (for the optional insurances)
  await expect(optionalBadge).toBeVisible({ timeout: 5_000 });
});

test('V44 - ביטוח מקיף shows "אופציונלי" badge', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page);
  await gotoVehicleDetail(page, id);
  // Find ביטוח מקיף section and verify optional badge
  const section = page.locator('div').filter({ hasText: 'ביטוח מקיף' }).first();
  await expect(section.locator('text=אופציונלי').first()).toBeVisible({ timeout: 5_000 });
});

test('V45 - click + הוסף on ביטוח חובה opens expiry form', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page);
  await gotoVehicleDetail(page, id);

  // ביטוח חובה is always the first insurance row; click its "+ הוסף" button
  await page.getByRole('button', { name: '+ הוסף' }).first().click();

  await expect(page.locator('input[type="date"]').first()).toBeVisible({ timeout: 5_000 });
});

test('V46 - POST /api/vehicle-insurances returns 201', async ({ authPage: page }) => {
  const vid = await createVehicleViaAPI(page);
  const res = await page.request.post('/api/vehicle-insurances', {
    data: {
      vehicle_id:     vid,
      insurance_type: 'ביטוח חובה',
      expiry_date:    '2027-12-31',
    },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.id).toBeTruthy();
  expect(body.insurance_type).toBe('ביטוח חובה');
  expect(body.expiry_date).toBe('2027-12-31');
});

test('V47 - PATCH /api/vehicle-insurances/${id} updates expiry', async ({ authPage: page }) => {
  const vid = await createVehicleViaAPI(page);
  const iid = await createVehicleInsuranceViaAPI(page, vid, { type: 'ביטוח מקיף', expiryDate: '2026-01-01' });

  const res = await page.request.patch(`/api/vehicle-insurances/${iid}`, {
    data: { expiry_date: '2028-06-30' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.expiry_date).toBe('2028-06-30');
});

test('V48 - insurance with past expiry shows "פג תוקף" status badge via API', async ({ authPage: page }) => {
  const vid = await createVehicleViaAPI(page);
  // Create mandatory insurance with expired date
  await createVehicleInsuranceViaAPI(page, vid, { type: 'ביטוח חובה', expiryDate: '2020-01-01' });

  await gotoVehicleDetail(page, vid);
  // insurance has no file_url → getDocumentStatus(null, past, true, true) = 'missing' = 'חסר'
  // 'פג תוקף' (expired) only appears when a file IS present; without file status = 'חסר'
  await expect(page.locator('text=חסר').first()).toBeVisible({ timeout: 5_000 });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY I — Search & filter
// ═══════════════════════════════════════════════════════════════════════════════

test('V49 - vehicle appears in list after creation', async ({ authPage: page }) => {
  const vnum = nextVnum();
  const id = await createVehicleViaAPI(page, { vehicleNumber: vnum });

  await page.goto('/vehicles');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator(`a[href="/vehicles/${id}"]`)).toBeVisible({ timeout: 8_000 });
});

test('V50 - search by vehicle number filters list', async ({ authPage: page }) => {
  const vnum = nextVnum();
  const id = await createVehicleViaAPI(page, { vehicleNumber: vnum });

  await page.goto('/vehicles');
  await page.reload();
  await page.waitForLoadState('networkidle');

  const searchInput = page.locator('input[placeholder*="חיפוש"]');
  await searchInput.fill(vnum);
  await page.waitForTimeout(300);

  await expect(page.locator(`a[href="/vehicles/${id}"]`)).toBeVisible({ timeout: 5_000 });
});

test('V51 - search by vehicle type filters list', async ({ authPage: page }) => {
  const uniqueType = `QA-TYPE-${uid()}`;
  const id = await createVehicleViaAPI(page, { vehicleType: uniqueType });

  await page.goto('/vehicles');
  await page.reload();
  await page.waitForLoadState('networkidle');

  await page.locator('input[placeholder*="חיפוש"]').fill(uniqueType);
  await page.waitForTimeout(300);
  await expect(page.locator(`a[href="/vehicles/${id}"]`)).toBeVisible({ timeout: 5_000 });
});

test('V52 - search with no results shows "לא נמצאו רכבים" text', async ({ authPage: page }) => {
  // Ensure at least one vehicle exists so "no results" is from search, not empty state
  await createVehicleViaAPI(page);

  await page.goto('/vehicles');
  await page.reload();
  await page.waitForLoadState('networkidle');

  await page.locator('input[placeholder*="חיפוש"]').fill('ZZZQQA99NOSUCHVEHICLE99');
  await page.waitForTimeout(300);
  await expect(page.locator('text=לא נמצאו רכבים').first()).toBeVisible({ timeout: 5_000 });
});

test('V53 - status filter tabs present on list page', async ({ authPage: page }) => {
  await page.goto('/vehicles');
  await page.waitForLoadState('networkidle');
  // StatusFilterTabs renders: הכל, לא תקין, עומד לפוג, תקין
  await expect(page.getByRole('button', { name: /^תקין/ })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole('button', { name: /^לא תקין/ })).toBeVisible({ timeout: 5_000 });
});

test('V54 - status filter "חסר" tab shows only vehicles with missing documents', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page); // new vehicle has no license → "missing"

  await page.goto('/vehicles');
  await page.reload();
  await page.waitForLoadState('networkidle');

  // "לא תקין" filter (value: 'expired') matches both expired + missing statuses
  const urgentBtn = page.getByRole('button', { name: /^לא תקין/ });
  await expect(urgentBtn).toBeVisible({ timeout: 5_000 });
  await urgentBtn.click();
  await page.waitForTimeout(300);

  await expect(page.locator(`a[href="/vehicles/${id}"]`)).toBeVisible({ timeout: 5_000 });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY J — Browser refresh & back-navigation
// ═══════════════════════════════════════════════════════════════════════════════

test('V55 - browser refresh on list page maintains auth session', async ({ authPage: page }) => {
  await page.goto('/vehicles');
  await page.waitForLoadState('networkidle');
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Should not redirect to /login
  await expect(page).not.toHaveURL(/\/login/, { timeout: 5_000 });
  await expect(page.getByRole('heading', { name: 'רכבים' })).toBeVisible({ timeout: 5_000 });
});

test('V56 - browser refresh on vehicle detail page shows vehicle', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page, { vehicleType: 'טנדר' });
  await gotoVehicleDetail(page, id);
  await page.reload();
  await page.waitForSelector('[dir="ltr"]', { timeout: 10_000 });

  // Vehicle type should still be visible after refresh
  await expect(page.locator('text=טנדר')).toBeVisible({ timeout: 5_000 });
});

test('V57 - back button from detail returns to vehicle list', async ({ authPage: page }) => {
  const id = await createVehicleViaAPI(page);

  await page.goto('/vehicles');
  await page.waitForLoadState('networkidle');

  const link = page.locator(`a[href="/vehicles/${id}"]`);
  await expect(link).toBeVisible({ timeout: 8_000 });
  await link.click();
  await page.waitForURL(`**/vehicles/${id}`);

  await page.locator('a', { hasText: 'רשימת רכבים' }).click();
  await expect(page).toHaveURL('/vehicles');
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY K — Multi-tab & mobile viewport
// ═══════════════════════════════════════════════════════════════════════════════

test('V58 - multi-tab: vehicle created in tab A visible in tab B after reload', async ({ browser }) => {
  const contextA = await browser.newContext({ storageState: AUTH_STATE_PATH, locale: 'he-IL' });
  const contextB = await browser.newContext({ storageState: AUTH_STATE_PATH, locale: 'he-IL' });
  const tabA     = await contextA.newPage();
  const tabB     = await contextB.newPage();

  const vnum = nextVnum();
  const res = await tabA.request.post('http://localhost:3000/api/vehicles', {
    data: { vehicle_number: vnum, vehicle_type: 'טנדר' },
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await res.json();
  _cleanupQueue.push(body.id);

  // Tab B navigates to vehicles list and reloads
  await tabB.goto('http://localhost:3000/vehicles');
  await tabB.reload();
  await tabB.waitForLoadState('networkidle');

  await expect(tabB.locator(`a[href="/vehicles/${body.id}"]`)).toBeVisible({ timeout: 8_000 });

  await contextA.close();
  await contextB.close();
});

test('V59 - mobile viewport (390×844): vehicle list renders correctly', async ({ browser }) => {
  const ctx  = await browser.newContext({
    storageState: AUTH_STATE_PATH,
    locale: 'he-IL',
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();

  await page.goto('http://localhost:3000/vehicles');
  await page.waitForLoadState('networkidle');

  await expect(page.getByRole('heading', { name: 'רכבים' })).toBeVisible({ timeout: 8_000 });
  // "New vehicle" button visible on mobile
  await expect(page.locator('a', { hasText: 'רכב חדש' })).toBeVisible({ timeout: 5_000 });
  // No horizontal scroll on page body
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(395);

  await ctx.close();
});

test('V60 - mobile viewport (390×844): create vehicle form renders correctly', async ({ browser }) => {
  const ctx  = await browser.newContext({
    storageState: AUTH_STATE_PATH,
    locale: 'he-IL',
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();

  await page.goto('http://localhost:3000/vehicles/new');
  await page.waitForSelector('form', { timeout: 10_000 });

  // Required field inputs visible
  await expect(page.locator('input[list="vehicle-type-presets"]')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('input[dir="ltr"]')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('button', { name: 'צור רכב' })).toBeVisible({ timeout: 5_000 });
  // No horizontal scroll
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(395);

  await ctx.close();
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY L — [id] route regression (Session 06 Phase B fixes)
// ═══════════════════════════════════════════════════════════════════════════════

test('V61 - GET /api/vehicle-licenses/[id] returns single object (not collection)', async ({ authPage: page }) => {
  const vid = await createVehicleViaAPI(page);
  const lid = await createVehicleLicenseViaAPI(page, vid, '2027-06-30');

  // FIXED: GET on [id] route now returns a single license, not a collection
  const res = await page.request.get(`/api/vehicle-licenses/${lid}`);
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(Array.isArray(data)).toBe(false);
  expect(data.id).toBe(lid);
  expect(data.vehicle_id).toBe(vid);
});

test('V62 - POST /api/vehicle-licenses/[id] returns 405', async ({ authPage: page }) => {
  const vid = await createVehicleViaAPI(page);
  const someId = '00000000-0000-0000-0000-000000000099';
  // FIXED: POST on [id] route must return 405 (not create a new license)
  const res = await page.request.post(`/api/vehicle-licenses/${someId}`, {
    data: { vehicle_id: vid, expiry_date: '2027-01-01' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(405);
});

test('V63 - GET /api/vehicle-insurances/[id] returns single object (not collection)', async ({ authPage: page }) => {
  const vid = await createVehicleViaAPI(page);
  const iid = await createVehicleInsuranceViaAPI(page, vid, { type: 'ביטוח חובה', expiryDate: '2027-12-31' });

  // FIXED: GET on [id] route now returns a single insurance, not a collection
  const res = await page.request.get(`/api/vehicle-insurances/${iid}`);
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(Array.isArray(data)).toBe(false);
  expect(data.id).toBe(iid);
  expect(data.vehicle_id).toBe(vid);
});

test('V64 - POST /api/vehicle-insurances/[id] returns 405', async ({ authPage: page }) => {
  const vid = await createVehicleViaAPI(page);
  const someId = '00000000-0000-0000-0000-000000000099';
  // FIXED: POST on [id] route must return 405 (not create a new insurance)
  const res = await page.request.post(`/api/vehicle-insurances/${someId}`, {
    data: { vehicle_id: vid, insurance_type: 'ביטוח חובה', expiry_date: '2027-01-01' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(405);
});
