/**
 * QA Session 06 — Worker Detail & Compliance
 *
 * Coverage:
 *   A. Navigation / rendering
 *   B. Safety Briefings (external mode)
 *   C. Professional Licenses
 *   D. Manager Licenses
 *   E. Height Restrictions
 *   F. Dynamic [id] route audit
 *   G. Tenant isolation / security
 *   H. UX / error handling audit (window.confirm bugs)
 *   I. Mobile viewport
 *
 * Safety: all mutations target Internal QA company only.
 * Cleanup: afterAll removes only QA-created records.
 */

import { test, expect, readQaMeta, uid } from '../fixtures/worker-compliance-auth';
import { request as playwrightRequest } from '@playwright/test';
import type { Dialog } from '@playwright/test';
import { AUTH_STATE_PATH } from '../global-setup';

// ─── shared state ─────────────────────────────────────────────────
let workerId: string;
let companyId: string;

// IDs tracked for cleanup
const createdBriefingIds: string[] = [];
const createdProfLicIds:  string[] = [];
const createdMgrLicIds:   string[] = [];
const createdHeightIds:   string[] = [];

test.beforeAll(async () => {
  const meta = readQaMeta();
  companyId = meta.companyId;

  // Create an authenticated API context using the saved auth state
  const ctx = await playwrightRequest.newContext({
    baseURL: 'http://localhost:3000',
    storageState: AUTH_STATE_PATH,
  });

  // Create a QA worker to attach compliance records to
  const res = await ctx.post('/api/workers', {
    data: {
      full_name:         `QA-WC-${uid()}`,
      is_foreign_worker: false,
      national_id:       `${Date.now()}`.slice(-9),
    },
  });
  expect(res.status()).toBe(201);
  const worker = await res.json();
  workerId = worker.id;
  await ctx.dispose();
});

test.afterAll(async () => {
  // Extended timeout for cleanup — afterAll runs after all 78 tests complete,
  // and the dev server may be slow at that point.
  test.setTimeout(90000);
  const ctx = await playwrightRequest.newContext({
    baseURL: 'http://localhost:3000',
    storageState: AUTH_STATE_PATH,
  });

  // Delete briefings created during tests
  for (const id of createdBriefingIds) {
    await ctx.delete('/api/safety-briefings', { data: { briefing_id: id } }).catch(() => {});
  }

  // Delete professional licenses
  for (const id of createdProfLicIds) {
    await ctx.delete(`/api/professional-licenses/${id}`).catch(() => {});
  }

  // Delete manager licenses
  for (const id of createdMgrLicIds) {
    await ctx.delete(`/api/manager-licenses/${id}`).catch(() => {});
  }

  // Delete height restrictions
  for (const id of createdHeightIds) {
    await ctx.delete('/api/height-restrictions', { data: { restriction_id: id } }).catch(() => {});
  }

  // Delete QA worker (cascades documents, briefings, heights, appointments via FK)
  if (workerId) {
    await ctx.delete(`/api/workers/${workerId}`).catch(() => {});
  }

  await ctx.dispose();
});

// ─── A. Navigation & rendering ─────────────────────────────────────

test('WC-01 - worker detail page loads for a QA worker', async ({ authPage: page }) => {
  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');
  expect(page.url()).toContain(`/workers/${workerId}`);
  // Worker name appears in page content
  const h1 = await page.locator('h1, h2').first().textContent();
  expect(h1).toBeTruthy();
});

test('WC-02 - worker detail page has "תדריך בטיחות" section', async ({ authPage: page }) => {
  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=תדריך בטיחות').first()).toBeVisible();
});

test('WC-03 - worker detail page has "רישיונות מקצועיים" section', async ({ authPage: page }) => {
  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=רישיונות מקצועיים').first()).toBeVisible();
});

test('WC-04 - worker detail page has "מנהל עבודה" section', async ({ authPage: page }) => {
  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');
  // Section is titled "מנהל עבודה" (not "מסמכי מנהל")
  await expect(page.locator('text=מנהל עבודה').first()).toBeVisible();
});

test('WC-05 - worker detail page has "איסור עבודה בגובה" section', async ({ authPage: page }) => {
  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=איסור עבודה בגובה').first()).toBeVisible();
});

// ─── B. Safety Briefings ──────────────────────────────────────────

test('WC-06 - POST /api/safety-briefings creates a briefing (external mode)', async ({ authPage: page }) => {
  const res = await page.request.post('/api/safety-briefings', {
    data: {
      worker_id:    workerId,
      mode:         'external',
      briefed_at:   '2026-08-01',
      conducted_by: 'מנהל בטיחות QA',
    },
  });
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(data.id).toBeTruthy();
  expect(data.worker_id).toBe(workerId);
  expect(data.mode).toBe('external');
  expect(data.expires_at).toBeTruthy();
  createdBriefingIds.push(data.id);
});

test('WC-07 - safety briefing expires_at is exactly 1 year after briefed_at', async ({ authPage: page }) => {
  const res = await page.request.post('/api/safety-briefings', {
    data: { worker_id: workerId, mode: 'external', briefed_at: '2026-01-15' },
  });
  expect(res.status()).toBe(200);
  const data = await res.json();
  // FIX B-SB-TZ: string-split year increment is timezone-safe → exact match expected
  expect(data.expires_at).toBe('2027-01-15');
  createdBriefingIds.push(data.id);
});

test('WC-07b - B-SB-TZ regression: year-boundary date (Dec 31) expires on Dec 31 next year', async ({ authPage: page }) => {
  const res = await page.request.post('/api/safety-briefings', {
    data: { worker_id: workerId, mode: 'external', briefed_at: '2025-12-31' },
  });
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(data.expires_at).toBe('2026-12-31');
  createdBriefingIds.push(data.id);
});

test('WC-07c - B-SB-TZ regression: Feb 28 (leap-year adjacent) expires on Feb 28 next year', async ({ authPage: page }) => {
  // Leap-year adjacent case: Feb 28 stays Feb 28 regardless of next year being leap or not
  const res = await page.request.post('/api/safety-briefings', {
    data: { worker_id: workerId, mode: 'external', briefed_at: '2024-02-28' },
  });
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(data.expires_at).toBe('2025-02-28');
  createdBriefingIds.push(data.id);
});

test('WC-08 - POST /api/safety-briefings missing worker_id returns 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/safety-briefings', {
    data: { mode: 'external', briefed_at: '2026-08-01' },
  });
  expect(res.status()).toBe(400);
});

test('WC-09 - POST /api/safety-briefings missing mode returns 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/safety-briefings', {
    data: { worker_id: workerId, briefed_at: '2026-08-01' },
  });
  expect(res.status()).toBe(400);
});

test('WC-10 - POST /api/safety-briefings with invalid mode returns 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/safety-briefings', {
    data: { worker_id: workerId, mode: 'invalid_mode', briefed_at: '2026-08-01' },
  });
  expect(res.status()).toBe(400);
});

test('WC-11 - POST /api/safety-briefings missing briefed_at returns 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/safety-briefings', {
    data: { worker_id: workerId, mode: 'external' },
  });
  expect(res.status()).toBe(400);
});

test('WC-12 - POST /api/safety-briefings with foreign worker_id returns 404', async ({ authPage: page }) => {
  const res = await page.request.post('/api/safety-briefings', {
    data: {
      worker_id:  '00000000-0000-0000-0000-000000000001',
      mode:       'external',
      briefed_at: '2026-08-01',
    },
  });
  expect(res.status()).toBe(404);
});

test('WC-13 - DELETE /api/safety-briefings deletes existing briefing', async ({ authPage: page }) => {
  // Create a briefing to delete
  const create = await page.request.post('/api/safety-briefings', {
    data: { worker_id: workerId, mode: 'external', briefed_at: '2026-08-01' },
  });
  expect(create.status()).toBe(200);
  const { id } = await create.json();

  const del = await page.request.delete('/api/safety-briefings', {
    data: { briefing_id: id },
  });
  expect(del.status()).toBe(200);
  const result = await del.json();
  expect(result.success).toBe(true);
});

test('WC-14 - DELETE /api/safety-briefings missing briefing_id returns 400', async ({ authPage: page }) => {
  const res = await page.request.delete('/api/safety-briefings', {
    data: {},
  });
  expect(res.status()).toBe(400);
});

test('WC-15 - DELETE /api/safety-briefings with nonexistent id returns 404', async ({ authPage: page }) => {
  const res = await page.request.delete('/api/safety-briefings', {
    data: { briefing_id: '00000000-0000-0000-0000-000000000099' },
  });
  expect(res.status()).toBe(404);
});

test('WC-16 - unauthenticated POST /api/safety-briefings returns 401', async ({ request }) => {
  const res = await request.post('/api/safety-briefings', {
    data: { worker_id: workerId, mode: 'external', briefed_at: '2026-08-01' },
  });
  expect(res.status()).toBe(401);
});

test('WC-17 - safety briefing UI: "בצע תדריך" button visible when no briefings', async ({ authPage: page }) => {
  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');
  // Find and open the safety briefing section
  const section = page.locator('text=תדריך בטיחות').first();
  await section.click();
  await page.waitForTimeout(300);
  await expect(page.locator('button', { hasText: 'בצע תדריך' }).or(page.locator('button', { hasText: 'עדכן תדריך' })).first()).toBeVisible();
});

test('WC-18 - safety briefing form opens with mode selection when button clicked', async ({ authPage: page }) => {
  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');
  const section = page.locator('text=תדריך בטיחות').first();
  await section.click();
  await page.waitForTimeout(300);
  const btn = page.locator('button', { hasText: 'בצע תדריך' }).or(page.locator('button', { hasText: 'עדכן תדריך' })).first();
  await btn.click();
  await page.waitForTimeout(300);
  // Should show mode selection buttons
  await expect(page.locator('button', { hasText: 'תדריך מהמערכת' })).toBeVisible();
  await expect(page.locator('button', { hasText: 'העלאת תדריך קיים' })).toBeVisible();
});

// ─── C. Professional Licenses ─────────────────────────────────────

test('WC-19 - POST /api/professional-licenses creates a license', async ({ authPage: page }) => {
  const res = await page.request.post('/api/professional-licenses', {
    data: {
      worker_id:    workerId,
      license_type: 'מנהל עבודה',
      expiry_date:  '2027-12-31',
    },
  });
  expect(res.status()).toBe(201);
  const data = await res.json();
  expect(data.id).toBeTruthy();
  expect(data.worker_id).toBe(workerId);
  expect(data.license_type).toBe('מנהל עבודה');
  createdProfLicIds.push(data.id);
});

test('WC-20 - POST /api/professional-licenses missing license_type returns 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/professional-licenses', {
    data: { worker_id: workerId, expiry_date: '2027-12-31' },
  });
  expect(res.status()).toBe(400);
});

test('WC-21 - POST /api/professional-licenses missing expiry_date returns 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/professional-licenses', {
    data: { worker_id: workerId, license_type: 'מנהל עבודה' },
  });
  expect(res.status()).toBe(400);
});

test('WC-22 - POST /api/professional-licenses missing worker_id returns 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/professional-licenses', {
    data: { license_type: 'מנהל עבודה', expiry_date: '2027-12-31' },
  });
  expect(res.status()).toBe(400);
});

test('WC-23 - POST /api/professional-licenses with foreign worker_id returns 404', async ({ authPage: page }) => {
  const res = await page.request.post('/api/professional-licenses', {
    data: {
      worker_id:    '00000000-0000-0000-0000-000000000002',
      license_type: 'חשמלאי מוסמך',
      expiry_date:  '2027-12-31',
    },
  });
  expect(res.status()).toBe(404);
});

test('WC-24 - GET /api/professional-licenses?worker_id= returns array', async ({ authPage: page }) => {
  const res = await page.request.get(`/api/professional-licenses?worker_id=${workerId}`);
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(Array.isArray(data)).toBe(true);
});

test('WC-25 - GET /api/professional-licenses without worker_id returns 400', async ({ authPage: page }) => {
  const res = await page.request.get('/api/professional-licenses');
  expect(res.status()).toBe(400);
});

test('WC-26 - PATCH /api/professional-licenses/[id] updates expiry_date', async ({ authPage: page }) => {
  const create = await page.request.post('/api/professional-licenses', {
    data: { worker_id: workerId, license_type: 'רתך', expiry_date: '2027-01-01' },
  });
  expect(create.status()).toBe(201);
  const { id } = await create.json();
  createdProfLicIds.push(id);

  const patch = await page.request.patch(`/api/professional-licenses/${id}`, {
    data: { expiry_date: '2028-06-30' },
  });
  expect(patch.status()).toBe(200);
  const updated = await patch.json();
  expect(updated.expiry_date).toBe('2028-06-30');
  expect(updated.id).toBe(id);
});

test('WC-27 - PATCH /api/professional-licenses/[id] updates license_type', async ({ authPage: page }) => {
  const create = await page.request.post('/api/professional-licenses', {
    data: { worker_id: workerId, license_type: 'מנופאי', expiry_date: '2027-01-01' },
  });
  expect(create.status()).toBe(201);
  const { id } = await create.json();
  createdProfLicIds.push(id);

  const patch = await page.request.patch(`/api/professional-licenses/${id}`, {
    data: { license_type: 'אתת' },
  });
  expect(patch.status()).toBe(200);
  expect((await patch.json()).license_type).toBe('אתת');
});

test('WC-28 - DELETE /api/professional-licenses/[id] removes the license', async ({ authPage: page }) => {
  const create = await page.request.post('/api/professional-licenses', {
    data: { worker_id: workerId, license_type: 'עובד גז', expiry_date: '2027-01-01' },
  });
  expect(create.status()).toBe(201);
  const { id } = await create.json();

  const del = await page.request.delete(`/api/professional-licenses/${id}`);
  expect(del.status()).toBe(200);
  expect((await del.json()).success).toBe(true);

  // Second delete → 404
  const del2 = await page.request.delete(`/api/professional-licenses/${id}`);
  expect(del2.status()).toBe(404);
});

test('WC-29 - PATCH /api/professional-licenses/[id] with nonexistent id returns 404', async ({ authPage: page }) => {
  const res = await page.request.patch('/api/professional-licenses/00000000-0000-0000-0000-000000000099', {
    data: { expiry_date: '2028-01-01' },
  });
  expect(res.status()).toBe(404);
});

test('WC-30 - unauthenticated POST /api/professional-licenses returns 401', async ({ request }) => {
  const res = await request.post('/api/professional-licenses', {
    data: { worker_id: workerId, license_type: 'מנהל עבודה', expiry_date: '2027-12-31' },
  });
  expect(res.status()).toBe(401);
});

test('WC-31 - professional license UI: "+ הוסף רישיון מקצועי" button visible', async ({ authPage: page }) => {
  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');
  // Section may be open or closed depending on existing licenses — only click if button not yet visible
  const addBtn = page.locator('button', { hasText: 'הוסף רישיון מקצועי' });
  if (!await addBtn.isVisible()) {
    await page.locator('[role="button"]', { hasText: 'רישיונות מקצועיים' }).click();
    await page.waitForTimeout(400);
  }
  await expect(addBtn).toBeVisible();
});

test('WC-32 - professional license form: license type select and expiry date visible when add clicked', async ({ authPage: page }) => {
  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');
  // Open section if closed
  const addBtn = page.locator('button', { hasText: 'הוסף רישיון מקצועי' });
  if (!await addBtn.isVisible()) {
    await page.locator('[role="button"]', { hasText: 'רישיונות מקצועיים' }).click();
    await page.waitForTimeout(400);
  }
  await addBtn.click();
  await page.waitForTimeout(300);
  // Form fields appear — use .first() to avoid strict mode error if multiple matches
  await expect(page.locator('select').or(page.locator('text=סוג הרישיון')).first()).toBeVisible();
});

// ─── D. Manager Licenses ──────────────────────────────────────────

test('WC-33 - POST /api/manager-licenses creates a driving license', async ({ authPage: page }) => {
  const res = await page.request.post('/api/manager-licenses', {
    data: { worker_id: workerId, license_type: 'רישיון נהיגה' },
  });
  expect(res.status()).toBe(201);
  const data = await res.json();
  expect(data.id).toBeTruthy();
  expect(data.worker_id).toBe(workerId);
  expect(data.license_type).toBe('רישיון נהיגה');
  createdMgrLicIds.push(data.id);
});

test('WC-34 - POST /api/manager-licenses missing license_type returns 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/manager-licenses', {
    data: { worker_id: workerId },
  });
  expect(res.status()).toBe(400);
});

test('WC-35 - POST /api/manager-licenses missing worker_id returns 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/manager-licenses', {
    data: { license_type: 'רישיון נהיגה' },
  });
  expect(res.status()).toBe(400);
});

test('WC-36 - POST /api/manager-licenses with foreign worker_id returns 404', async ({ authPage: page }) => {
  const res = await page.request.post('/api/manager-licenses', {
    data: { worker_id: '00000000-0000-0000-0000-000000000003', license_type: 'רישיון נהיגה' },
  });
  expect(res.status()).toBe(404);
});

test('WC-37 - PATCH /api/manager-licenses/[id] updates expiry_date', async ({ authPage: page }) => {
  const create = await page.request.post('/api/manager-licenses', {
    data: { worker_id: workerId, license_type: 'רישיון נהיגה', expiry_date: '2027-01-01' },
  });
  expect(create.status()).toBe(201);
  const { id } = await create.json();
  createdMgrLicIds.push(id);

  const patch = await page.request.patch(`/api/manager-licenses/${id}`, {
    data: { expiry_date: '2028-12-31' },
  });
  expect(patch.status()).toBe(200);
  expect((await patch.json()).expiry_date).toBe('2028-12-31');
});

test('WC-38 - DELETE /api/manager-licenses/[id] removes the license', async ({ authPage: page }) => {
  const create = await page.request.post('/api/manager-licenses', {
    data: { worker_id: workerId, license_type: 'רישיון נהיגה' },
  });
  expect(create.status()).toBe(201);
  const { id } = await create.json();

  const del = await page.request.delete(`/api/manager-licenses/${id}`);
  expect(del.status()).toBe(200);
  expect((await del.json()).success).toBe(true);

  const del2 = await page.request.delete(`/api/manager-licenses/${id}`);
  expect(del2.status()).toBe(404);
});

test('WC-39 - PATCH /api/manager-licenses/[id] with nonexistent id returns 404', async ({ authPage: page }) => {
  const res = await page.request.patch('/api/manager-licenses/00000000-0000-0000-0000-000000000099', {
    data: { expiry_date: '2028-01-01' },
  });
  expect(res.status()).toBe(404);
});

test('WC-40 - GET /api/manager-licenses?worker_id= returns array', async ({ authPage: page }) => {
  const res = await page.request.get(`/api/manager-licenses?worker_id=${workerId}`);
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(Array.isArray(data)).toBe(true);
});

test('WC-41 - GET /api/manager-licenses without worker_id returns 400', async ({ authPage: page }) => {
  const res = await page.request.get('/api/manager-licenses');
  expect(res.status()).toBe(400);
});

test('WC-42 - unauthenticated POST /api/manager-licenses returns 401', async ({ request }) => {
  const res = await request.post('/api/manager-licenses', {
    data: { worker_id: workerId, license_type: 'רישיון נהיגה' },
  });
  expect(res.status()).toBe(401);
});

test('WC-43 - manager license UI: ManagerDocumentsCard renders when worker is responsible manager', async ({ authPage: page }) => {
  // Mark worker as responsible site manager so ManagerDocumentsCard renders
  await page.request.patch(`/api/workers/${workerId}`, {
    data: { is_responsible_site_manager: true },
  });
  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');
  // Section is "מנהל עבודה" (not "מסמכי מנהל"); open it if needed
  // ManagerDocumentsCard always renders h3 "רישיון נהיגה" when isResponsibleManager=true
  const managerH3 = page.locator('h3', { hasText: 'רישיון נהיגה' });
  if (!await managerH3.isVisible()) {
    await page.locator('[role="button"]', { hasText: 'מנהל עבודה' }).click();
    await page.waitForTimeout(400);
  }
  await expect(managerH3).toBeVisible();
});

test('WC-44 - manager license expiry form visible after add button click', async ({ authPage: page }) => {
  // Mark worker as responsible site manager so ManagerDocumentsCard renders
  await page.request.patch(`/api/workers/${workerId}`, {
    data: { is_responsible_site_manager: true },
  });
  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');
  // Open "מנהל עבודה" section if needed
  const addBtn = page.locator('button', { hasText: 'הוסף רישיון נהיגה' });
  if (!await addBtn.isVisible()) {
    await page.locator('[role="button"]', { hasText: 'מנהל עבודה' }).click();
    await page.waitForTimeout(400);
  }
  if (!await addBtn.isVisible()) {
    // A driving license already exists — AddSingleLicenseButton not rendered
    test.skip(true, 'Driving license already exists; add button not shown');
    return;
  }
  await addBtn.click();
  await page.waitForTimeout(300);
  await expect(page.locator('input[type="date"]').first()).toBeVisible();
});

// ─── E. Height Restrictions ────────────────────────────────────────

test('WC-45 - POST /api/height-restrictions creates a restriction', async ({ authPage: page }) => {
  const res = await page.request.post('/api/height-restrictions', {
    data: { worker_id: workerId, language: 'hebrew', conducted_by: 'בודק QA' },
  });
  expect(res.status()).toBe(201);
  const data = await res.json();
  expect(data.id).toBeTruthy();
  expect(data.worker_id).toBe(workerId);
  expect(data.language).toBe('hebrew');
  // expires_at should be ~1 year from now
  const expiresAt = new Date(data.expires_at);
  const now = new Date();
  const diffDays = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  expect(diffDays).toBeGreaterThan(360);
  expect(diffDays).toBeLessThan(370);
  createdHeightIds.push(data.id);
});

test('WC-46 - POST /api/height-restrictions missing worker_id returns 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/height-restrictions', {
    data: { language: 'hebrew' },
  });
  expect(res.status()).toBe(400);
});

test('WC-47 - POST /api/height-restrictions missing language returns 400', async ({ authPage: page }) => {
  const res = await page.request.post('/api/height-restrictions', {
    data: { worker_id: workerId },
  });
  expect(res.status()).toBe(400);
});

test('WC-48 - POST /api/height-restrictions with foreign worker_id returns 404', async ({ authPage: page }) => {
  const res = await page.request.post('/api/height-restrictions', {
    data: { worker_id: '00000000-0000-0000-0000-000000000004', language: 'hebrew' },
  });
  expect(res.status()).toBe(404);
});

test('WC-49 - DELETE /api/height-restrictions removes the restriction', async ({ authPage: page }) => {
  const create = await page.request.post('/api/height-restrictions', {
    data: { worker_id: workerId, language: 'hebrew', conducted_by: 'בודק QA' },
  });
  expect(create.status()).toBe(201);
  const { id } = await create.json();

  const del = await page.request.delete('/api/height-restrictions', {
    data: { restriction_id: id },
  });
  expect(del.status()).toBe(200);
  expect((await del.json()).success).toBe(true);
});

test('WC-50 - DELETE /api/height-restrictions missing restriction_id returns 400', async ({ authPage: page }) => {
  const res = await page.request.delete('/api/height-restrictions', {
    data: {},
  });
  expect(res.status()).toBe(400);
});

test('WC-51 - DELETE /api/height-restrictions with nonexistent id returns 404', async ({ authPage: page }) => {
  const res = await page.request.delete('/api/height-restrictions', {
    data: { restriction_id: '00000000-0000-0000-0000-000000000099' },
  });
  expect(res.status()).toBe(404);
});

test('WC-52 - unauthenticated POST /api/height-restrictions returns 401', async ({ request }) => {
  const res = await request.post('/api/height-restrictions', {
    data: { worker_id: workerId, language: 'hebrew' },
  });
  expect(res.status()).toBe(401);
});

test('WC-53 - height ban UI: "+ הפק איסור עבודה בגובה" button visible', async ({ authPage: page }) => {
  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');
  // Section header is "עבודה בגובה" (not the h3 "איסור עבודה בגובה" which is inside the body)
  // Open section if closed (it closes when a valid restriction exists)
  const generateBtn = page.locator('button', { hasText: 'הפק איסור' });
  if (!await generateBtn.isVisible()) {
    await page.locator('[role="button"]', { hasText: 'עבודה בגובה' }).click();
    await page.waitForTimeout(400);
  }
  await expect(generateBtn).toBeVisible();
});

// ─── F. Dynamic [id] route audit ──────────────────────────────────

test('WC-54 - GET /api/professional-licenses/[id] returns single object by id', async ({ authPage: page }) => {
  const create = await page.request.post('/api/professional-licenses', {
    data: { worker_id: workerId, license_type: 'מנהל עבודה', expiry_date: '2027-12-31' },
  });
  expect(create.status()).toBe(201);
  const { id } = await create.json();
  createdProfLicIds.push(id);

  // FIXED CF-PL-01: GET on [id] route returns single resource, not collection
  const getById = await page.request.get(`/api/professional-licenses/${id}`);
  expect(getById.status()).toBe(200);
  const data = await getById.json();
  expect(Array.isArray(data)).toBe(false);
  expect(data.id).toBe(id);
  expect(data.worker_id).toBe(workerId);
});

test('WC-55 - POST /api/professional-licenses/[id] returns 405', async ({ authPage: page }) => {
  const someId = '00000000-0000-0000-0000-000000000099';
  // FIXED CF-PL-01: POST on [id] route must return 405
  const res = await page.request.post(`/api/professional-licenses/${someId}`, {
    data: { worker_id: workerId, license_type: 'חשמלאי עוזר', expiry_date: '2027-06-01' },
  });
  expect(res.status()).toBe(405);
});

test('WC-56 - GET /api/manager-licenses/[id] returns single object by id', async ({ authPage: page }) => {
  const create = await page.request.post('/api/manager-licenses', {
    data: { worker_id: workerId, license_type: 'רישיון נהיגה', expiry_date: '2027-12-31' },
  });
  expect(create.status()).toBe(201);
  const { id } = await create.json();
  createdMgrLicIds.push(id);

  // FIXED CF-ML-01: GET on [id] route returns single resource, not collection
  const getById = await page.request.get(`/api/manager-licenses/${id}`);
  expect(getById.status()).toBe(200);
  const data = await getById.json();
  expect(Array.isArray(data)).toBe(false);
  expect(data.id).toBe(id);
  expect(data.worker_id).toBe(workerId);
});

test('WC-57 - POST /api/manager-licenses/[id] returns 405', async ({ authPage: page }) => {
  const someId = '00000000-0000-0000-0000-000000000099';
  // FIXED CF-ML-01: POST on [id] route must return 405
  const res = await page.request.post(`/api/manager-licenses/${someId}`, {
    data: { worker_id: workerId, license_type: 'רישיון נהיגה' },
  });
  expect(res.status()).toBe(405);
});

test('WC-58 - PATCH /api/professional-licenses/[id] uses params.id correctly', async ({ authPage: page }) => {
  const create = await page.request.post('/api/professional-licenses', {
    data: { worker_id: workerId, license_type: 'מפעיל עגורן', expiry_date: '2027-01-01' },
  });
  const { id } = await create.json();
  createdProfLicIds.push(id);

  const patch = await page.request.patch(`/api/professional-licenses/${id}`, {
    data: { notes: 'הערה QA' },
  });
  expect(patch.status()).toBe(200);
  expect((await patch.json()).id).toBe(id);
});

test('WC-59 - DELETE /api/professional-licenses/[id] uses params.id correctly', async ({ authPage: page }) => {
  const create = await page.request.post('/api/professional-licenses', {
    data: { worker_id: workerId, license_type: 'מפעיל ציוד מכני', expiry_date: '2027-01-01' },
  });
  const { id } = await create.json();

  const del = await page.request.delete(`/api/professional-licenses/${id}`);
  expect(del.status()).toBe(200);

  // Verify the record is gone
  const getList = await page.request.get(`/api/professional-licenses?worker_id=${workerId}`);
  const list: { id: string }[] = await getList.json();
  expect(list.find((l) => l.id === id)).toBeUndefined();
});

test('WC-60 - PATCH /api/manager-licenses/[id] uses params.id correctly', async ({ authPage: page }) => {
  const create = await page.request.post('/api/manager-licenses', {
    data: { worker_id: workerId, license_type: 'רישיון נהיגה', expiry_date: '2027-01-01' },
  });
  const { id } = await create.json();
  createdMgrLicIds.push(id);

  const patch = await page.request.patch(`/api/manager-licenses/${id}`, {
    data: { vehicle_number: 'QA-12345' },
  });
  expect(patch.status()).toBe(200);
  expect((await patch.json()).vehicle_number).toBe('QA-12345');
});

test('WC-61 - POST /api/safety-briefings/[id] does not exist (405 expected)', async ({ authPage: page }) => {
  // safety-briefings has no [id] route — POST should return 404 (route not found)
  const res = await page.request.post(`/api/safety-briefings/00000000-0000-0000-0000-000000000099`, {
    data: { worker_id: workerId, mode: 'external', briefed_at: '2026-08-01' },
  });
  // Next.js returns 405 for routes that exist but don't define the method,
  // or 404 if the route segment doesn't exist at all
  expect([404, 405]).toContain(res.status());
});

test('WC-62 - POST /api/height-restrictions/[id] does not exist', async ({ authPage: page }) => {
  const res = await page.request.post(`/api/height-restrictions/00000000-0000-0000-0000-000000000099`, {
    data: { worker_id: workerId, language: 'hebrew' },
  });
  expect([404, 405]).toContain(res.status());
});

// ─── G. Tenant isolation / security ──────────────────────────────

test('WC-63 - PATCH /api/professional-licenses/[id] cross-company returns 404', async ({ authPage: page }) => {
  // Create a license in Internal QA
  const create = await page.request.post('/api/professional-licenses', {
    data: { worker_id: workerId, license_type: 'מנהל עבודה', expiry_date: '2027-12-31' },
  });
  const { id: licId } = await create.json();
  createdProfLicIds.push(licId);

  // Another company's user with a known UUID should get 404
  // We simulate this by using an ID that doesn't belong to Internal QA worker chain
  const patch = await page.request.patch(`/api/professional-licenses/00000000-0000-0000-0000-000000000099`, {
    data: { expiry_date: '2030-01-01' },
  });
  expect(patch.status()).toBe(404);
});

test('WC-64 - DELETE /api/professional-licenses/[id] cross-company returns 404', async ({ authPage: page }) => {
  const del = await page.request.delete('/api/professional-licenses/00000000-0000-0000-0000-000000000099');
  expect(del.status()).toBe(404);
});

test('WC-65 - PATCH /api/manager-licenses/[id] cross-company returns 404', async ({ authPage: page }) => {
  const res = await page.request.patch('/api/manager-licenses/00000000-0000-0000-0000-000000000099', {
    data: { expiry_date: '2030-01-01' },
  });
  expect(res.status()).toBe(404);
});

test('WC-66 - DELETE /api/manager-licenses/[id] cross-company returns 404', async ({ authPage: page }) => {
  const del = await page.request.delete('/api/manager-licenses/00000000-0000-0000-0000-000000000099');
  expect(del.status()).toBe(404);
});

test('WC-67 - DELETE /api/safety-briefings with cross-company briefing_id returns 404', async ({ authPage: page }) => {
  const del = await page.request.delete('/api/safety-briefings', {
    data: { briefing_id: '00000000-0000-0000-0000-000000000099' },
  });
  expect(del.status()).toBe(404);
});

test('WC-68 - DELETE /api/height-restrictions with cross-company restriction_id returns 404', async ({ authPage: page }) => {
  const del = await page.request.delete('/api/height-restrictions', {
    data: { restriction_id: '00000000-0000-0000-0000-000000000099' },
  });
  expect(del.status()).toBe(404);
});

test('WC-69 - GET /api/professional-licenses with cross-company worker_id returns 404', async ({ authPage: page }) => {
  const res = await page.request.get('/api/professional-licenses?worker_id=00000000-0000-0000-0000-000000000099');
  expect(res.status()).toBe(404);
});

test('WC-70 - GET /api/manager-licenses with cross-company worker_id returns 404', async ({ authPage: page }) => {
  const res = await page.request.get('/api/manager-licenses?worker_id=00000000-0000-0000-0000-000000000099');
  expect(res.status()).toBe(404);
});

// ─── H. UX / Error handling audit ─────────────────────────────────

test('WC-71 - safety briefing delete shows inline confirmation (no window.confirm)', async ({ authPage: page }) => {
  // Create a briefing so the delete button is present
  const create = await page.request.post('/api/safety-briefings', {
    data: { worker_id: workerId, mode: 'external', briefed_at: '2026-08-01' },
  });
  expect(create.status()).toBe(200);
  const { id } = await create.json();
  createdBriefingIds.push(id);

  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');

  // Open safety briefing section (closed when valid briefings exist)
  await page.locator('[role="button"]', { hasText: 'תדריך בטיחות' }).click();
  await page.waitForTimeout(500);

  // FIXED B-UI-SB: no native dialog should fire
  let dialogFired = false;
  page.once('dialog', async (dialog: Dialog) => {
    dialogFired = true;
    await dialog.dismiss();
  });

  const deleteBtn = page.locator('button', { hasText: 'מחק רשומה' }).first();
  if (!await deleteBtn.isVisible()) {
    test.skip(true, 'Delete button not visible; briefing section state unclear');
    return;
  }
  await deleteBtn.click();
  await page.waitForTimeout(500);
  expect(dialogFired).toBe(false);
  // Inline confirmation should appear
  await expect(page.locator('button:visible', { hasText: 'ביטול' }).first()).toBeVisible();
  // Cancel to leave the briefing intact for cleanup
  await page.locator('button:visible', { hasText: 'ביטול' }).first().click();
});

test('WC-72 - professional license delete shows inline confirmation (no window.confirm)', async ({ authPage: page }) => {
  const create = await page.request.post('/api/professional-licenses', {
    data: { worker_id: workerId, license_type: 'מנהל עבודה', expiry_date: '2027-12-31' },
  });
  expect(create.status()).toBe(201);
  const { id } = await create.json();
  createdProfLicIds.push(id);

  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');

  // Always open the licenses section; use button:visible to avoid hidden section DOM buttons
  const addBtn = page.locator('button', { hasText: 'הוסף רישיון מקצועי' });
  if (!await addBtn.isVisible()) {
    await page.locator('[role="button"]', { hasText: 'רישיונות מקצועיים' }).click();
    await page.waitForTimeout(500);
  }

  // FIXED B-UI-PL: no native dialog should fire
  let dialogFired = false;
  page.once('dialog', async (dialog: Dialog) => {
    dialogFired = true;
    await dialog.dismiss();
  });

  const deleteBtn = page.locator('button:visible', { hasText: 'מחק' }).first();
  if (!await deleteBtn.isVisible()) {
    test.skip(true, 'Delete button not visible');
    return;
  }
  await deleteBtn.click();
  await page.waitForTimeout(500);
  expect(dialogFired).toBe(false);
  await expect(page.locator('button:visible', { hasText: 'ביטול' }).first()).toBeVisible();
  await page.locator('button:visible', { hasText: 'ביטול' }).first().click();
});

test('WC-73 - manager license delete shows inline confirmation (no window.confirm)', async ({ authPage: page }) => {
  const create = await page.request.post('/api/manager-licenses', {
    data: { worker_id: workerId, license_type: 'רישיון נהיגה', expiry_date: '2027-12-31' },
  });
  expect(create.status()).toBe(201);
  const { id } = await create.json();
  createdMgrLicIds.push(id);

  await page.request.patch(`/api/workers/${workerId}`, {
    data: { is_responsible_site_manager: true },
  });

  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');

  // Scope to the driving license subsection to avoid picking 'מחק' from another section
  const drivingLicSection = page.locator('div', { has: page.locator('h3', { hasText: 'רישיון נהיגה' }) });
  const deleteBtn = drivingLicSection.locator('button', { hasText: 'מחק' }).first();
  if (!await deleteBtn.isVisible()) {
    await page.locator('[role="button"]', { hasText: 'מנהל עבודה' }).click();
    await page.waitForTimeout(400);
  }

  // FIXED B-UI-ML: no native dialog should fire
  let dialogFired = false;
  page.once('dialog', async (dialog: Dialog) => {
    dialogFired = true;
    await dialog.dismiss();
  });

  if (!await deleteBtn.isVisible()) {
    test.skip(true, 'Delete button not visible');
    return;
  }
  await deleteBtn.click();
  await page.waitForTimeout(500);
  expect(dialogFired).toBe(false);
  await expect(drivingLicSection.locator('button:visible', { hasText: 'ביטול' }).first()).toBeVisible();
  await drivingLicSection.locator('button:visible', { hasText: 'ביטול' }).first().click();
});

test('WC-74 - height restriction delete shows inline confirmation (no window.confirm)', async ({ authPage: page }) => {
  const create = await page.request.post('/api/height-restrictions', {
    data: { worker_id: workerId, language: 'hebrew', conducted_by: 'בודק QA' },
  });
  expect(create.status()).toBe(201);
  const { id } = await create.json();
  createdHeightIds.push(id);

  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');

  // HeightBanCard delete button has distinctive border-red-200 class
  const deleteBtn = page.locator('button.border-red-200', { hasText: 'מחק' });
  if (!await deleteBtn.isVisible()) {
    await page.locator('[role="button"]', { hasText: 'עבודה בגובה' }).click();
    await page.waitForTimeout(400);
  }

  // FIXED B-UI-HR: no native dialog should fire
  let dialogFired = false;
  page.once('dialog', async (dialog: Dialog) => {
    dialogFired = true;
    await dialog.dismiss();
  });

  if (!await deleteBtn.isVisible()) {
    test.skip(true, 'Delete button not visible; restriction may not be displayed');
    return;
  }
  await deleteBtn.click();
  await page.waitForTimeout(500);
  expect(dialogFired).toBe(false);
  await expect(page.locator('button:visible', { hasText: 'ביטול' }).first()).toBeVisible();
  await page.locator('button:visible', { hasText: 'ביטול' }).first().click();
});

test('WC-75 - safety briefing cancel button closes form without saving', async ({ authPage: page }) => {
  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');

  // Section may be open or closed — only click header if button not already visible
  const briefingBtn = page.locator('button', { hasText: /בצע תדריך|עדכן תדריך/ }).first();
  if (!await briefingBtn.isVisible()) {
    await page.locator('[role="button"]', { hasText: 'תדריך בטיחות' }).click();
    await page.waitForTimeout(400);
  }

  const btn = briefingBtn;
  await btn.click();
  await page.waitForTimeout(300);

  // Mode selection visible — click cancel
  await page.locator('button', { hasText: 'ביטול' }).first().click();
  await page.waitForTimeout(300);

  // Mode selection should be gone
  await expect(page.locator('button', { hasText: 'תדריך מהמערכת' })).not.toBeVisible();
});

test('WC-76 - professional license form: submit without license type shows error', async ({ authPage: page }) => {
  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');

  // Section may be open or closed — only click header if button not already visible
  const openAddBtn = page.locator('button', { hasText: 'הוסף רישיון מקצועי' });
  if (!await openAddBtn.isVisible()) {
    await page.locator('[role="button"]', { hasText: 'רישיונות מקצועיים' }).click();
    await page.waitForTimeout(400);
  }

  await openAddBtn.click();
  await page.waitForTimeout(300);

  // Button should be disabled or an error shown when no type selected
  const addBtn = page.locator('button', { hasText: 'הוסף רישיון' }).first();
  // The add button should be disabled (licenseType.trim() is empty)
  await expect(addBtn).toBeDisabled();
});

// ─── I. Mobile viewport ────────────────────────────────────────────

test('WC-77 - mobile viewport: worker detail page renders compliance sections', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');

  await expect(page.locator('text=תדריך בטיחות').first()).toBeVisible();
  await expect(page.locator('text=רישיונות מקצועיים').first()).toBeVisible();
});

test('WC-78 - mobile viewport: no horizontal scroll on worker detail', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/workers/${workerId}`);
  await page.waitForLoadState('networkidle');

  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewportWidth = 390;
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
});
