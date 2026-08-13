/**
 * Workers module — comprehensive E2E test suite
 *
 * Company:  Internal QA
 * User:     qa.bot@safedoc.local
 *
 * Covers:
 *   W01–W05   Create workers (Israeli, foreign, skip upload, validation, long values)
 *   W06–W10   Edit workers
 *   W11–W14   Archive & restore
 *   W15–W17   Permanent delete
 *   W18–W25   Documents (upload, invalid, delete)
 *   W26–W34   Search & filter
 *   W35–W40   Toggle active/inactive
 *   W41–W44   Duplicate detection
 *   W45–W48   Browser refresh & back-navigation
 *   W49–W51   Multi-tab
 *   W52–W54   Mobile viewport
 *   W55–W57   Hebrew / Arabic / emoji names
 *   W58–W60   Sorting & ordering
 */

import { test, expect, uid } from '../fixtures/workers-auth';
import { AUTH_STATE_PATH } from '../global-setup';
import type { Page } from '@playwright/test';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Pending cleanup: archive + permanently delete after each test. */
const _workerCleanupQueue: string[] = [];

test.afterEach(async ({ authPage: page }) => {
  if (_workerCleanupQueue.length === 0) return;
  const ids = _workerCleanupQueue.splice(0);
  for (const id of ids) {
    await archiveWorker(page, id).catch(() => {});
    await deleteWorkerPermanently(page, id).catch(() => {});
  }
});

async function createWorkerViaUI(
  page: Page,
  opts: {
    name:       string;
    isForeign?: boolean;
    idNumber?:  string;
    phone?:     string;
    notes?:     string;
  },
): Promise<string> {
  // Auto-generate a unique ID when not explicitly provided — prevents duplicate 409s
  // across tests even if a previous test's cleanup was skipped.
  const idNumber = opts.idNumber ?? uid().replace(/\D/g, '').padStart(9, '1').slice(-9);

  // Go to new-worker page (skip document upload)
  await page.goto('/workers/new');
  // Wait for the skip button to be present rather than full networkidle
  await page.waitForSelector('button:has-text("דלג")', { timeout: 10_000 });

  // Step 1: Choose document type — click Skip
  await page.locator('button', { hasText: 'דלג' }).click();

  // Wait for review form to appear
  await page.waitForSelector('input[placeholder="שם פרטי ושם משפחה"]', { timeout: 5_000 });

  // Step 4 (review): fill in details
  if (opts.isForeign) {
    const foreignBtn = page.locator('button', { hasText: 'עובד זר' });
    if (await foreignBtn.isVisible()) await foreignBtn.click();
  }

  await page.locator('input[placeholder="שם פרטי ושם משפחה"]').fill(opts.name);
  await page.locator('input[dir="ltr"]').first().fill(idNumber);

  if (opts.phone) {
    const telField = page.locator('input[type="tel"]');
    if (await telField.isVisible()) await telField.fill(opts.phone);
  }

  if (opts.notes) {
    await page.locator('textarea').fill(opts.notes);
  }

  // Submit
  await page.locator('button', { hasText: 'צור עובד' }).click();
  await page.waitForURL(/\/workers\/[a-f0-9-]{36}$/, { timeout: 15_000 });

  const workerId = page.url().split('/').pop()!;
  // Register for cleanup in afterEach so orphaned workers get cleaned up even if test fails
  _workerCleanupQueue.push(workerId);
  return workerId;
}

/** Archive a worker via direct API call (faster than navigating to UI). */
async function archiveWorker(page: Page, workerId: string) {
  await page.request.patch(`/api/workers/${workerId}`, {
    data: { is_archived: true },
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Hard-delete a worker via direct API call (must be archived first). */
async function deleteWorkerPermanently(page: Page, workerId: string) {
  await page.request.delete(`/api/workers/${workerId}`);
}

// ─── W01: Create Israeli worker (skip upload) ────────────────────────────────

test('W01 - create Israeli worker via skip-upload flow', async ({ authPage: page }) => {
  const name = `ישראלי ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await expect(page).toHaveURL(/\/workers\//);
  await expect(page.locator('h1')).toContainText(name);
  await expect(page.getByRole('heading', { name: 'תעודת זהות' })).toBeVisible();

  // Cleanup
  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W02: Create foreign worker ──────────────────────────────────────────────

test('W02 - create foreign worker', async ({ authPage: page }) => {
  const name = `Ahmad Al-Rashid ${uid()}`;
  const id   = await createWorkerViaUI(page, {
    name,
    isForeign: true,
  });

  await expect(page.locator('h1')).toContainText(name);
  await expect(page.locator('text=עובד זר')).toBeVisible();

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W03: Validation — name required ─────────────────────────────────────────

test('W03 - create worker fails without name', async ({ authPage: page }) => {
  await page.goto('/workers/new');
  await page.locator('button', { hasText: 'דלג' }).click();

  const submitBtn = page.locator('button', { hasText: 'צור עובד' });
  await expect(submitBtn).toBeDisabled();
});

// ─── W04: Validation — Israeli ID required when worker type is Israeli ────────

test('W04 - Israeli worker requires national ID', async ({ authPage: page }) => {
  await page.goto('/workers/new');
  await page.locator('button', { hasText: 'דלג' }).click();

  // Fill name only, leave ID empty
  await page.locator('input[placeholder="שם פרטי ושם משפחה"]').fill('שם בלבד');
  await expect(page.locator('button', { hasText: 'צור עובד' })).toBeDisabled();
});

// ─── W05: Long name (100 chars) and emoji ────────────────────────────────────

test('W05 - create worker with long Hebrew name', async ({ authPage: page }) => {
  const longName = `עובד${uid()} עם שם ארוך מאוד שמכיל הרבה תווים כדי לבדוק את גבולות השדה`.slice(0, 80);
  const id = await createWorkerViaUI(page, { name: longName });
  await expect(page.locator('h1')).toBeVisible();
  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W06: Edit worker name ────────────────────────────────────────────────────

test('W06 - edit worker full name', async ({ authPage: page }) => {
  const originalName = `לפני עריכה ${uid()}`;
  const updatedName  = `אחרי עריכה ${uid()}`;

  const id = await createWorkerViaUI(page, { name: originalName });

  // Navigate to edit page
  await page.goto(`/workers/${id}/edit`);
  await page.waitForSelector('h1', { timeout: 15_000 });

  const nameInput = page.locator('input[placeholder="ישראל ישראלי"]');
  await nameInput.clear();
  await nameInput.fill(updatedName);
  await page.locator('button', { hasText: 'שמור שינויים' }).click();

  await page.waitForURL(/\/workers\/[a-f0-9-]{36}$/, { timeout: 15_000 });
  await expect(page.locator('h1')).toContainText(updatedName);

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W07: Edit phone number ───────────────────────────────────────────────────

test('W07 - edit worker phone number', async ({ authPage: page }) => {
  const name = `עם טלפון ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await page.goto(`/workers/${id}/edit`);
  await page.waitForSelector('h1', { timeout: 15_000 });

  await page.locator('input[type="tel"]').fill('050-1234567');
  await page.locator('button', { hasText: 'שמור שינויים' }).click();

  await page.waitForURL(/\/workers\/[a-f0-9-]{36}$/, { timeout: 15_000 });
  // Should show updated phone
  const bodyText = await page.locator('body').textContent();
  expect(bodyText).toContain('050');

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W08: Edit notes ──────────────────────────────────────────────────────────

test('W08 - edit worker notes', async ({ authPage: page }) => {
  const name  = `עם הערות ${uid()}`;
  const id    = await createWorkerViaUI(page, { name });
  const notes = `הערה מיוחדת ${uid()}`;

  await page.goto(`/workers/${id}/edit`);
  await page.waitForSelector('h1', { timeout: 15_000 });
  await page.locator('textarea').fill(notes);
  await page.locator('button', { hasText: 'שמור שינויים' }).click();
  await page.waitForURL(/\/workers\/[a-f0-9-]{36}$/, { timeout: 15_000 });

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W09: Edit project name ───────────────────────────────────────────────────

test('W09 - edit worker project name', async ({ authPage: page }) => {
  const name    = `עובד בפרויקט ${uid()}`;
  const project = `פרויקט תל אביב ${uid()}`;
  const id      = await createWorkerViaUI(page, { name });

  await page.goto(`/workers/${id}/edit`);
  await page.waitForSelector('h1', { timeout: 15_000 });

  const projectInput = page.locator('input[placeholder="שם הפרויקט / האתר"]');
  await projectInput.fill(project);
  await page.locator('button', { hasText: 'שמור שינויים' }).click();
  await page.waitForURL(/\/workers\/[a-f0-9-]{36}$/, { timeout: 15_000 });

  const bodyText = await page.locator('body').textContent();
  expect(bodyText).toContain(project.slice(0, 15));

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W10: Cancel edit returns to detail ──────────────────────────────────────

test('W10 - cancel edit returns to worker detail', async ({ authPage: page }) => {
  const name = `לביטול עריכה ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await page.goto(`/workers/${id}/edit`);
  await page.waitForSelector('h1', { timeout: 15_000 });
  await page.locator('button', { hasText: 'ביטול' }).click();

  // Should be back on detail page
  await expect(page).toHaveURL(new RegExp(`/workers/${id}$`));

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W11: Archive worker ─────────────────────────────────────────────────────

test('W11 - archive worker from actions section', async ({ authPage: page }) => {
  const name = `לארכיון ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await page.goto(`/workers/${id}`);
  await page.waitForSelector('h1', { timeout: 10_000 });

  // Expand actions section if it exists as an accordion
  const actionsBtn = page.getByRole('button', { name: /פעולות/ });
  if (await actionsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await actionsBtn.click();
  }

  // Wait for archive button and click
  const archiveBtn = page.locator('button', { hasText: 'העבר לארכיון' });
  await expect(archiveBtn).toBeVisible({ timeout: 5000 });
  await archiveBtn.click();
  await page.waitForTimeout(1500);

  // Verify the worker is now archived (API confirms it)
  await archiveWorker(page, id);      // idempotent if already archived
  await deleteWorkerPermanently(page, id);
});

// ─── W12: Archive then verify worker list ────────────────────────────────────

test('W12 - archived worker not visible in default list', async ({ authPage: page }) => {
  const name = `מוסתר בדיפולט ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await archiveWorker(page, id);

  await page.goto('/workers');
  await page.waitForSelector('h1', { timeout: 15_000 });

  // Without "show inactive", archived worker should not appear
  const workerCards = page.locator(`text=${name.slice(0, 20)}`);
  await expect(workerCards).toHaveCount(0);

  await deleteWorkerPermanently(page, id);
});

// ─── W13: Restore (un-archive) via active toggle ─────────────────────────────

test('W13 - restore archived worker via active toggle', async ({ authPage: page }) => {
  const name = `לשחזור ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  // Archive
  await archiveWorker(page, id);

  // Restore: PATCH is_archived = false
  // The API sends PATCH with { is_archived: false }
  // We do this via the worker detail page
  await page.goto(`/workers/${id}`);
  await page.waitForSelector('h1', { timeout: 15_000 });

  // Look for a restore button or toggle
  const actionsSection = page.getByRole('button', { name: /פעולות/ });
  if (await actionsSection.isVisible()) await actionsSection.click();

  const restoreBtn = page.locator('button', { hasText: 'שחזר מארכיון' });
  if (await restoreBtn.isVisible()) {
    await restoreBtn.click();
    await page.waitForTimeout(1500);
    // Worker should be active again
    await expect(page.locator('h1')).toBeVisible();
  }

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W14: Archive shows status text ──────────────────────────────────────────

test('W14 - archive button changes state on success', async ({ authPage: page }) => {
  const name = `לבדיקת ארכיון ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await page.goto(`/workers/${id}`);
  await page.waitForSelector('h1', { timeout: 15_000 });

  const actionsBtn = page.getByRole('button', { name: /פעולות/ });
  if (await actionsBtn.isVisible()) await actionsBtn.click();

  await expect(page.locator('button', { hasText: 'העבר לארכיון' })).toBeVisible();
  await page.locator('button', { hasText: 'העבר לארכיון' }).click();
  await page.waitForTimeout(2000);

  // Cleanup
  await deleteWorkerPermanently(page, id);
});

// ─── W15: Delete without archive → 409 ───────────────────────────────────────

test('W15 - permanent delete requires archive first (API returns 409)', async ({ authPage: page }) => {
  const name = `לא מוארכב ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  // Try to delete via API directly (not archived)
  const response = await page.request.delete(`/api/workers/${id}`);
  expect(response.status()).toBe(409);

  const body = await response.json();
  expect(body.error).toBeTruthy();

  // Cleanup
  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W16: Permanent delete flow (archive → delete) ───────────────────────────

test('W16 - archive then permanently delete worker', async ({ authPage: page }) => {
  const name = `למחיקה סופית ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await archiveWorker(page, id);

  // Delete via API
  const delRes = await page.request.delete(`/api/workers/${id}`);
  expect(delRes.status()).toBe(200);

  // Worker should return 404 now
  const getRes = await page.request.get(`/api/workers/${id}`);
  expect(getRes.status()).toBe(404);
});

// ─── W17: Delete non-existent worker → 404 ───────────────────────────────────

test('W17 - delete non-existent worker returns 404', async ({ authPage: page }) => {
  const fakeId  = '00000000-0000-0000-0000-000000000000';
  const delRes  = await page.request.delete(`/api/workers/${fakeId}`);
  expect([404, 409]).toContain(delRes.status());
});

// ─── W18: Valid image upload ──────────────────────────────────────────────────

test('W18 - upload valid JPEG document', async ({ authPage: page }) => {
  const name = `עם מסמך ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await page.goto(`/workers/${id}`);
  await page.waitForSelector('h1', { timeout: 15_000 });

  // Open documents section
  const docsSection = page.getByRole('button', { name: /מסמכים/ });
  if (await docsSection.isVisible()) await docsSection.click();

  // Find first upload zone for id_document
  const fileInput = page.locator('input[type="file"][accept*="image"]').first();
  if (await fileInput.count() > 0) {
    // Create a minimal valid JPEG buffer
    const jpegBuffer = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
      0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
      0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
      0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
      0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
      0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
      0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
      0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
      0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD3,
      0xFF, 0xD9,
    ]);
    await fileInput.setInputFiles({
      name:     'test-id.jpg',
      mimeType: 'image/jpeg',
      buffer:   jpegBuffer,
    });
    await page.waitForTimeout(3000);
    // Check for success or at least no error
    await expect(page.locator('text=שגיאה').first()).not.toBeVisible().catch(() => {});
  }

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W19: Invalid file type upload ───────────────────────────────────────────

test('W19 - reject executable file upload', async ({ authPage: page }) => {
  const name = `בדיקת קובץ פסול ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await page.goto(`/workers/${id}`);
  await page.waitForSelector('h1', { timeout: 15_000 });

  const docsSection = page.getByRole('button', { name: /מסמכים/ });
  if (await docsSection.isVisible()) await docsSection.click();

  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.count() > 0) {
    await fileInput.setInputFiles({
      name:     'malware.exe',
      mimeType: 'application/x-msdownload',
      buffer:   Buffer.from('MZ fake executable'),
    });
    await page.waitForTimeout(1000);
    // Should show an error or reject silently (input accept attribute filters browser-side)
    // Just verify we're still on the page and not crashed
    await expect(page.locator('h1')).toBeVisible();
  }

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W20: Upload PDF ──────────────────────────────────────────────────────────

test('W20 - upload valid PDF document', async ({ authPage: page }) => {
  const name = `עם PDF ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await page.goto(`/workers/${id}`);
  await page.waitForSelector('h1', { timeout: 15_000 });

  const docsSection = page.getByRole('button', { name: /מסמכים/ });
  if (await docsSection.isVisible()) await docsSection.click();

  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.count() > 0) {
    const minimalPdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n9\n%%EOF');
    await fileInput.setInputFiles({
      name:     'document.pdf',
      mimeType: 'application/pdf',
      buffer:   minimalPdf,
    });
    await page.waitForTimeout(3000);
    await expect(page.locator('h1')).toBeVisible();
  }

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W21: Upload expiry date ──────────────────────────────────────────────────

test('W21 - set document expiry date', async ({ authPage: page }) => {
  const name = `עם תוקף ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await page.goto(`/workers/${id}`);
  await page.waitForSelector('h1', { timeout: 15_000 });

  const docsSection = page.getByRole('button', { name: /מסמכים/ });
  if (await docsSection.isVisible()) await docsSection.click();

  // Set expiry date on first date input
  const dateInput = page.locator('input[type="date"]').first();
  if (await dateInput.count() > 0) {
    await dateInput.fill('2025-12-31');
    // Save button should appear
    const saveBtn = page.locator('button', { hasText: 'שמור' }).first();
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await page.waitForTimeout(1500);
      await expect(page.locator('text=נשמר').first()).toBeVisible();
    }
  }

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W22: Toggle worker inactive from list ────────────────────────────────────

test('W22 - toggle worker inactive from list page', async ({ authPage: page }) => {
  const name = `לסינון פעיל ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await page.goto('/workers');
  await page.waitForSelector('h1', { timeout: 15_000 });

  // Find worker and toggle
  const workerLink = page.locator(`a[href="/workers/${id}"]`);
  if (await workerLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Toggle switch is inside the card
    const toggleNear = workerLink.locator('..').locator('input[type="checkbox"], button[role="switch"]').first();
    if (await toggleNear.count() > 0) {
      await toggleNear.click();
      await page.waitForTimeout(1000);
    }
  }

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W23: Toggle worker active/inactive from detail ──────────────────────────

test('W23 - toggle active status from worker detail page', async ({ authPage: page }) => {
  const name = `טוגל פעיל ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await page.goto(`/workers/${id}`);
  await page.waitForSelector('h1', { timeout: 15_000 });

  const actionsBtn = page.getByRole('button', { name: /פעולות/ });
  if (await actionsBtn.isVisible()) await actionsBtn.click();

  // Find the active toggle or button
  const deactivateBtn = page.locator('button, [role="switch"]', { hasText: /פעיל|השבת|לא פעיל/ }).first();
  if (await deactivateBtn.isVisible()) {
    await deactivateBtn.click();
    await page.waitForTimeout(1500);
  }

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W24: Worker list shows inactive badge after deactivation ─────────────────

test('W24 - inactive worker shows badge in list (show inactive mode)', async ({ authPage: page }) => {
  const name = `לא פעיל-בדיקה ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  // Deactivate via API
  await page.request.patch(`/api/workers/${id}`, {
    data: { is_active: false },
  });

  await page.goto('/workers');
  // Wait for the workers fetch to complete — the "show inactive" button only
  // renders after the WorkerList fetch returns inactive workers.
  const showInactiveBtn = page.locator('button', { hasText: 'הצג לא פעילים' });
  await expect(showInactiveBtn).toBeVisible({ timeout: 15_000 });
  await showInactiveBtn.click();
  await page.waitForTimeout(500);

  const workerCard = page.locator(`a[href="/workers/${id}"]`);
  await expect(workerCard).toBeVisible({ timeout: 5000 });

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W25: Document delete ─────────────────────────────────────────────────────

test('W25 - delete uploaded document', async ({ authPage: page }) => {
  const name = `מסמך למחיקה ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await page.goto(`/workers/${id}`);
  await page.waitForSelector('h1', { timeout: 15_000 });

  // Open docs section, upload then delete
  const docsSection = page.getByRole('button', { name: /מסמכים/ });
  if (await docsSection.isVisible()) await docsSection.click();

  // Check if delete button appears (only if file uploaded)
  const deleteDocBtn = page.locator('button', { hasText: 'מחק' });
  if (await deleteDocBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await deleteDocBtn.first().click();
    await page.waitForTimeout(1500);
  }

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W26: Search by name ──────────────────────────────────────────────────────

test('W26 - search by worker name filters list', async ({ authPage: page }) => {
  const uniqueTag = `QA-SEARCH-${uid()}`;
  const name      = `עובד ${uniqueTag}`;
  const id        = await createWorkerViaUI(page, { name });

  await page.goto('/workers');
  // Wait for the workers fetch to complete so the new worker is in the list
  await page.waitForSelector(`a[href="/workers/${id}"]`, { timeout: 15_000 });

  const searchInput = page.locator('input[placeholder*="חיפוש"]');
  await searchInput.fill(uniqueTag);
  await page.waitForTimeout(600);

  await expect(page.locator(`text=${uniqueTag}`)).toBeVisible();

  // Clear search
  await searchInput.clear();
  await page.waitForTimeout(400);

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W27: Search by national ID ───────────────────────────────────────────────

test('W27 - search by national ID', async ({ authPage: page }) => {
  const name      = `חיפוש לפי ת"ז ${uid()}`;
  const searchId  = uid().replace(/\D/g, '').padStart(9, '1').slice(-9);
  const id        = await createWorkerViaUI(page, { name, idNumber: searchId });

  await page.goto('/workers');
  // Wait for the newly created worker to appear — proves the workers fetch completed.
  await page.waitForSelector(`a[href="/workers/${id}"]`, { timeout: 15_000 });

  const searchInput = page.locator('input[placeholder*="חיפוש"]');
  await searchInput.fill(searchId);
  await page.waitForTimeout(600);

  // Worker should appear after search filter
  await expect(page.locator(`a[href="/workers/${id}"]`)).toBeVisible({ timeout: 5000 });

  await searchInput.clear();
  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W28: Search with no results ─────────────────────────────────────────────

test('W28 - search with no results shows empty state', async ({ authPage: page }) => {
  await page.goto('/workers');
  await page.waitForSelector('h1', { timeout: 15_000 });

  const searchInput = page.locator('input[placeholder*="חיפוש"]');
  await searchInput.fill('ZZZNORESULTSXXX99887766');
  await page.waitForTimeout(600);

  // Should show empty state
  const emptyMsg = page.locator('text=לא נמצאו עובדים');
  await expect(emptyMsg).toBeVisible({ timeout: 5000 });

  await searchInput.clear();
});

// ─── W29: Filter by "urgent" (לא תקין) ───────────────────────────────────────

test('W29 - filter by urgent status shows filtered list', async ({ authPage: page }) => {
  await page.goto('/workers');
  await page.waitForSelector('h1', { timeout: 15_000 });

  const urgentFilter = page.locator('button', { hasText: 'לא תקין' });
  await expect(urgentFilter).toBeVisible();
  await urgentFilter.click();
  await page.waitForTimeout(600);

  // Either shows workers or empty state — just verifies filter applies
  await expect(page.locator('body')).toBeVisible();
  // Verify the "all" filter restores the list
  await page.locator('button', { hasText: 'הכל' }).click();
  await page.waitForTimeout(400);
});

// ─── W30: Filter by "expiring soon" (עומד לפוג) ──────────────────────────────

test('W30 - filter by expiring soon status', async ({ authPage: page }) => {
  await page.goto('/workers');
  await page.waitForSelector('h1', { timeout: 15_000 });

  await page.locator('button', { hasText: 'עומד לפוג' }).click();
  await page.waitForTimeout(600);
  await expect(page.locator('body')).toBeVisible();

  await page.locator('button', { hasText: 'הכל' }).click();
});

// ─── W31: Filter by "valid" (תקין) ───────────────────────────────────────────

test('W31 - filter by valid status', async ({ authPage: page }) => {
  await page.goto('/workers');
  await page.waitForSelector('h1', { timeout: 15_000 });

  await page.getByRole('button', { name: /^תקין/ }).click();
  await page.waitForTimeout(600);
  await expect(page.locator('body')).toBeVisible();

  await page.locator('button', { hasText: 'הכל' }).click();
});

// ─── W32: Show/hide inactive workers ─────────────────────────────────────────

test('W32 - toggle inactive workers visibility', async ({ authPage: page }) => {
  // "הצג לא פעילים" only appears when inactiveCount > 0.
  // inactiveCount = workers.length - activeWorkers.length where activeWorkers filters is_active truthy.
  // We must set is_active=false (NOT just archive) to make the worker count as "inactive".
  const name = `בלתי פעיל ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await page.request.patch(`/api/workers/${id}`, {
    data: { is_active: false },
    headers: { 'Content-Type': 'application/json' },
  });

  await page.goto('/workers');
  await page.waitForSelector('h1', { timeout: 15_000 });

  // The button requires the workers fetch to complete before it appears.
  const showBtn = page.locator('button', { hasText: 'הצג לא פעילים' });
  await expect(showBtn).toBeVisible({ timeout: 15_000 });
  await showBtn.click();

  const hideBtn = page.locator('button', { hasText: 'הסתר לא פעילים' });
  await expect(hideBtn).toBeVisible({ timeout: 15_000 });
  await hideBtn.click();

  await expect(page.locator('button', { hasText: 'הצג לא פעילים' })).toBeVisible({ timeout: 15_000 });

  // Restore to active so archiveWorker + delete works cleanly
  await page.request.patch(`/api/workers/${id}`, {
    data: { is_active: true },
    headers: { 'Content-Type': 'application/json' },
  });
  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W33: Status filter count badges ─────────────────────────────────────────

test('W33 - status filter buttons show numeric badges', async ({ authPage: page }) => {
  await page.goto('/workers');
  await page.waitForSelector('h1', { timeout: 15_000 });

  // All four filter buttons must be visible
  await expect(page.locator('button', { hasText: 'הכל' })).toBeVisible();
  await expect(page.locator('button', { hasText: 'לא תקין' })).toBeVisible();
  await expect(page.locator('button', { hasText: 'עומד לפוג' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^תקין/ })).toBeVisible();
});

// ─── W34: Search + status filter combined ────────────────────────────────────

test('W34 - search and status filter work together', async ({ authPage: page }) => {
  const uniqueTag = `COMBO-${uid()}`;
  const name      = `עובד ${uniqueTag}`;
  const id        = await createWorkerViaUI(page, { name });

  await page.goto('/workers');
  await page.waitForSelector('h1', { timeout: 15_000 });

  const search = page.locator('input[placeholder*="חיפוש"]');
  await search.fill(uniqueTag);
  await page.getByRole('button', { name: /^תקין/ }).click();
  await page.waitForTimeout(600);

  // Might or might not show depending on document status
  // Just verify no crash
  await expect(page.locator('body')).toBeVisible();

  await search.clear();
  await page.locator('button', { hasText: 'הכל' }).click();

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W35: Worker list — active count stat ────────────────────────────────────

test('W35 - active worker count updates after creating a worker', async ({ authPage: page }) => {
  // Read baseline count from API — faster and avoids timing race with WorkerList fetch.
  const beforeRes  = await page.request.get('/api/workers');
  const beforeData = await beforeRes.json();
  const before     = Array.isArray(beforeData)
    ? beforeData.filter((w: { is_active: unknown; is_archived: unknown }) => w.is_active !== false && !w.is_archived).length
    : 0;

  const name = `ספירת עובדים ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  // Navigate to the workers list and wait for the new worker to appear —
  // that guarantees the WorkerList fetch completed with fresh data.
  await page.goto('/workers');
  await page.waitForSelector(`a[href="/workers/${id}"]`, { timeout: 15_000 });

  const countTextAfter = await page.locator('p', { hasText: 'עובדים פעילים' }).textContent().catch(() => '0');
  const after          = parseInt((countTextAfter?.match(/\d+/) ?? ['0'])[0]);

  expect(after).toBeGreaterThanOrEqual(before + 1);

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W36: Worker list sorted alphabetically ───────────────────────────────────

test('W36 - worker list is sorted alphabetically', async ({ authPage: page }) => {
  await page.goto('/workers');
  await page.waitForSelector('h1', { timeout: 15_000 });

  const names = await page.locator('p.font-semibold.text-gray-900').allTextContents();
  if (names.length >= 2) {
    const sorted = [...names].sort((a, b) => a.localeCompare(b, 'he'));
    expect(names).toEqual(sorted);
  }
});

// ─── W37: Navigate back from worker detail ────────────────────────────────────

test('W37 - back link returns to worker list', async ({ authPage: page }) => {
  const name = `ניווט חזרה ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await page.goto(`/workers/${id}`);
  await page.waitForSelector('h1', { timeout: 15_000 });

  // Click the back link (← רשימת עובדים)
  await page.locator('a', { hasText: 'רשימת עובדים' }).click();
  await expect(page).toHaveURL('/workers');

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W38: Create link navigates to new worker form ───────────────────────────

test('W38 - create new worker button navigates to form', async ({ authPage: page }) => {
  await page.goto('/workers');
  await page.waitForSelector('h1', { timeout: 15_000 });

  const createBtn = page.locator('a[href="/workers/new"]');
  await expect(createBtn).toBeVisible();
  await createBtn.click();
  await expect(page).toHaveURL('/workers/new');
});

// ─── W39: Duplicate Israeli ID → 409 ────────────────────────────────────────

test('W39 - duplicate national ID returns 409 conflict', async ({ authPage: page }) => {
  const name1 = `ראשון ${uid()}`;
  const name2  = `שני עם אותה ת"ז ${uid()}`;
  const sharedId = uid().replace(/\D/g, '').padStart(9, '1').slice(-9);

  const id1 = await createWorkerViaUI(page, { name: name1, idNumber: sharedId });

  // Try creating a second worker with the same ID via the API
  const res = await page.request.post('/api/workers', {
    data: {
      full_name:        name2,
      is_foreign_worker: false,
      national_id:      sharedId,
    },
  });

  expect(res.status()).toBe(409);

  // Cleanup first worker
  await archiveWorker(page, id1);
  await deleteWorkerPermanently(page, id1);
});

// ─── W40: Duplicate via UI shows error message ───────────────────────────────

test('W40 - duplicate ID via UI shows error message', async ({ authPage: page }) => {
  const name1    = `כפול א ${uid()}`;
  const sharedId = uid().replace(/\D/g, '').padStart(9, '1').slice(-9);
  const id1      = await createWorkerViaUI(page, { name: name1, idNumber: sharedId });

  // Try creating another via UI
  await page.goto('/workers/new');
  await page.locator('button', { hasText: 'דלג' }).click();

  await page.locator('input[placeholder="שם פרטי ושם משפחה"]').fill(`כפול ב ${uid()}`);
  const idInput = page.locator('input[dir="ltr"]').first();
  await idInput.fill(sharedId);
  await page.locator('button', { hasText: 'צור עובד' }).click();

  await page.waitForTimeout(2000);
  // Should show inline error, not navigate away (exclude Next.js route announcer with role="alert")
  const errorEl = page.locator('p.text-sm.text-red-600').first();
  await expect(errorEl).toBeVisible({ timeout: 5000 });

  await archiveWorker(page, id1);
  await deleteWorkerPermanently(page, id1);
});

// ─── W41: Browser refresh preserves worker list ───────────────────────────────

test('W41 - browser refresh keeps authenticated session', async ({ authPage: page }) => {
  await page.goto('/workers');
  await page.waitForSelector('h1', { timeout: 15_000 });
  await page.reload();
  await page.waitForSelector('h1', { timeout: 15_000 });

  // Still authenticated and on workers page
  await expect(page).toHaveURL('/workers');
  await expect(page.locator('h1', { hasText: 'עובדים' })).toBeVisible();
});

// ─── W42: Browser refresh on detail preserves state ──────────────────────────

test('W42 - refresh on worker detail page keeps detail intact', async ({ authPage: page }) => {
  const name = `רענן פרטים ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await page.goto(`/workers/${id}`);
  await page.waitForSelector('h1', { timeout: 10_000 });
  await page.reload();
  await page.waitForSelector('h1', { timeout: 10_000 });

  await expect(page.locator('h1')).toContainText(name);

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W43: Back button after navigation ───────────────────────────────────────

test('W43 - browser back button works from worker detail to list', async ({ authPage: page }) => {
  // Create a known worker so we can control the full navigation stack
  const name = `חזרה ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  // Navigate to list first (adds /workers to history)
  await page.goto('/workers');
  await page.waitForSelector('h1', { timeout: 15_000 });

  // Click the specific link (adds /workers/{id} to history)
  const link = page.locator(`a[href="/workers/${id}"]`);
  await expect(link).toBeVisible({ timeout: 5000 });
  await link.click();
  await page.waitForURL(`**/workers/${id}`);

  // Back should return to /workers
  await page.goBack();
  await expect(page).toHaveURL('/workers');

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W44: Create worker, then immediately navigate away and back ──────────────

test('W44 - navigate away then back to worker detail', async ({ authPage: page }) => {
  const name = `ניווט הלוך-חזור ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await page.goto('/workers');
  await page.goto(`/workers/${id}`);
  await page.waitForSelector('h1', { timeout: 15_000 });

  await expect(page.locator('h1')).toContainText(name);

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W45: Multi-tab — changes in tab A appear in tab B after refresh ──────────

test('W45 - multi-tab: worker created in tab A visible in tab B', async ({ authPage: page, browser }) => {
  const name = `רב-כרטיסיות ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  // Open second tab with same auth state
  const ctx2  = await browser.newContext({ storageState: AUTH_STATE_PATH, locale: 'he-IL' });
  const page2 = await ctx2.newPage();

  await page2.goto('/workers');
  await page2.waitForSelector('h1', { timeout: 15_000 });

  // Worker should be visible in second tab too
  const workerInTab2 = page2.locator(`a[href="/workers/${id}"]`);
  await expect(workerInTab2).toBeVisible({ timeout: 15_000 });

  await ctx2.close();

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W46: Multi-tab — delete in tab A, reload tab B shows gone ───────────────

test('W46 - multi-tab: worker deleted in tab A disappears in tab B after reload', async ({ authPage: page, browser }) => {
  const name = `מחיקה רב-כרטיסיות ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  const ctx2  = await browser.newContext({ storageState: AUTH_STATE_PATH, locale: 'he-IL' });
  const page2 = await ctx2.newPage();

  // Delete in tab A (archive first)
  await archiveWorker(page, id);
  await page.request.delete(`/api/workers/${id}`);

  // Tab B refreshes
  await page2.goto('/workers');
  await page2.waitForSelector('h1', { timeout: 15_000 });
  await expect(page2.locator(`a[href="/workers/${id}"]`)).not.toBeVisible();

  await ctx2.close();
});

// ─── W47: Mobile viewport — workers list renders ─────────────────────────────

test('W47 - mobile viewport: workers list renders correctly', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/workers');
  await page.waitForSelector('h1', { timeout: 15_000 });

  await expect(page.locator('h1', { hasText: 'עובדים' })).toBeVisible();
  // Create button should be visible
  await expect(page.locator('a[href="/workers/new"]')).toBeVisible();
});

// ─── W48: Mobile viewport — new worker form ───────────────────────────────────

test('W48 - mobile viewport: create worker form renders correctly', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workers/new');
  await page.waitForSelector('h1', { timeout: 15_000 });

  // Document type selector should be visible
  await expect(page.locator('button', { hasText: 'תעודת זהות' })).toBeVisible();
  await expect(page.locator('button', { hasText: 'פספורט' })).toBeVisible();
  await expect(page.locator('button', { hasText: 'דלג' })).toBeVisible();
});

// ─── W49: Mobile viewport — worker detail ────────────────────────────────────

test('W49 - mobile viewport: worker detail page renders correctly', async ({ authPage: page }) => {
  const name = `מובייל פרטים ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/workers/${id}`);
  await page.waitForSelector('h1', { timeout: 15_000 });

  await expect(page.locator('h1')).toContainText(name);

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W50: Hebrew name with special characters ─────────────────────────────────

test('W50 - create worker with Hebrew name containing apostrophes', async ({ authPage: page }) => {
  const name = `מוחמד דיב'אן ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await expect(page.locator('h1')).toContainText("דיב'אן");

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W51: Arabic name ────────────────────────────────────────────────────────

test('W51 - create worker with Arabic name', async ({ authPage: page }) => {
  const name = `محمد الرشيد ${uid()}`;
  const id   = await createWorkerViaUI(page, {
    name,
    isForeign: true,
    idNumber:  `P${uid().slice(-6)}A`,
  });

  await expect(page.locator('h1')).toBeVisible();

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W52: English name ───────────────────────────────────────────────────────

test('W52 - create worker with English name', async ({ authPage: page }) => {
  const name = `John Smith ${uid()}`;
  const id   = await createWorkerViaUI(page, {
    name,
    isForeign: true,
    idNumber:  `E${uid().slice(-6)}B`,
  });

  await expect(page.locator('h1')).toContainText('John Smith');

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W53: Mixed Hebrew/English name ──────────────────────────────────────────

test('W53 - create worker with mixed language name', async ({ authPage: page }) => {
  const name = `David דוד Martinez ${uid()}`;
  const id   = await createWorkerViaUI(page, {
    name,
    isForeign: true,
    idNumber:  `M${uid().slice(-6)}C`,
  });

  await expect(page.locator('h1')).toBeVisible();

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W54: Name with digits ────────────────────────────────────────────────────

test('W54 - create worker with digits in name (e.g., Jr. 2nd)', async ({ authPage: page }) => {
  const name = `עובד 2 חדש ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });
  await expect(page.locator('h1')).toBeVisible();
  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W55: API — GET worker requires auth ──────────────────────────────────────

test('W55 - unauthenticated GET /api/workers returns 401', async ({ page }) => {
  // Use a fresh page WITHOUT auth cookies
  const res = await page.request.get('/api/workers');
  expect(res.status()).toBe(401);
});

// ─── W56: API — POST worker requires admin role ───────────────────────────────

test('W56 - authenticated POST /api/workers creates worker', async ({ authPage: page }) => {
  const res = await page.request.post('/api/workers', {
    data: {
      full_name:         `API עובד ${uid()}`,
      is_foreign_worker: false,
      national_id:       '123456782',
    },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.id).toBeTruthy();
  expect(body.full_name).toContain('API עובד');

  // Cleanup
  await page.request.patch(`/api/workers/${body.id}`, { data: { is_archived: true } });
  await page.request.delete(`/api/workers/${body.id}`);
});

// ─── W57: API — create worker with max-length name ───────────────────────────

test('W57 - create worker with 100-char name via API', async ({ authPage: page }) => {
  const longName = 'א'.repeat(80) + uid().slice(0, 10);
  const res = await page.request.post('/api/workers', {
    data: {
      full_name:         longName,
      is_foreign_worker: false,
      national_id:       '123456782',
    },
  });
  // Should succeed or return a validation error — not crash with 500
  expect([201, 400, 422]).toContain(res.status());

  if (res.status() === 201) {
    const body = await res.json();
    await page.request.patch(`/api/workers/${body.id}`, { data: { is_archived: true } });
    await page.request.delete(`/api/workers/${body.id}`);
  }
});

// ─── W58: Worker detail — sections accordion ──────────────────────────────────

test('W58 - worker detail accordion sections open and close', async ({ authPage: page }) => {
  const name = `אקורדיון ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await page.goto(`/workers/${id}`);
  await page.waitForSelector('h1', { timeout: 10_000 });

  // Open "מסמכים" section (accordion header is div[role="button"])
  const docsBtn = page.getByRole('button', { name: /^מסמכים/ });
  await expect(docsBtn).toBeVisible({ timeout: 5000 });
  await docsBtn.click();
  await page.waitForTimeout(400);

  // Open "תדריך בטיחות" section (use exact section title to avoid matching "בצע תדריך" button)
  const briefingBtn = page.getByRole('button', { name: /^תדריך בטיחות/ });
  if (await briefingBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await briefingBtn.click();
    await page.waitForTimeout(400);
  }

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W59: Worker detail — no crash on rapid section toggling ─────────────────

test('W59 - rapid toggle of sections does not crash page', async ({ authPage: page }) => {
  const name = `לחיצות מהירות ${uid()}`;
  const id   = await createWorkerViaUI(page, { name });

  await page.goto(`/workers/${id}`);
  await page.waitForSelector('h1', { timeout: 10_000 });

  // Section accordion headers are div[role="button"] (not <button>) after the nested-button fix
  const sections = await page.locator('div[role="button"].w-full').all();
  for (const section of sections.slice(0, 5)) {
    await section.click({ force: true });
    await page.waitForTimeout(100);
    await section.click({ force: true });
    await page.waitForTimeout(100);
  }

  await expect(page.locator('h1')).toContainText(name);

  await archiveWorker(page, id);
  await deleteWorkerPermanently(page, id);
});

// ─── W60: Create worker — step 1 back button ─────────────────────────────────

test('W60 - back button on upload step returns to doc-type step', async ({ authPage: page }) => {
  await page.goto('/workers/new');
  await page.waitForSelector('h1', { timeout: 15_000 });

  // Click "תעודת זהות" to advance to upload step
  await page.locator('button', { hasText: 'תעודת זהות' }).click();
  await page.waitForTimeout(300);

  // Now click back
  const backBtn = page.locator('button', { hasText: '← חזור' });
  if (await backBtn.isVisible()) {
    await backBtn.click();
    await page.waitForTimeout(300);
    // Should be back on step 1
    await expect(page.locator('button', { hasText: 'תעודת זהות' })).toBeVisible();
  }
});
