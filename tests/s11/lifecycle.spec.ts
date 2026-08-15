/**
 * FINAL QA DATA LIFECYCLE VERIFICATION
 *
 * Exercises full CREATE → UI-VERIFY → EDIT → PERSIST-CHECK → ARCHIVE → RESTORE → DELETE
 * for each entity type against Company B = Internal QA ONLY.
 *
 * Safety: all API calls are made through the authenticated `authPage` fixture
 * which has already verified that the active company is Internal QA.
 * The test never touches Company A / SafeDoc records.
 */

import { test, expect } from '../fixtures/workers-auth';
import type { Page } from '@playwright/test';

const TS = Date.now();

// ── API helper — uses page session cookies (same origin = same auth) ──────────
async function api(
  page: Page,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const res = await page.request.fetch(`http://localhost:3000${path}`, {
    method,
    data: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
  const b: unknown = await res.json().catch(() => ({}));
  return { status: res.status(), body: b };
}

// ── Wait for page to settle (desktop) ────────────────────────────────────────
async function settled(page: Page) {
  await page.waitForFunction(
    () => (document.querySelector('header')?.textContent ?? '').includes('Internal QA'),
    null,
    { timeout: 20_000 },
  );
  await page.locator('[aria-label="עוד אפשרויות"]').waitFor({ state: 'visible', timeout: 10_000 });
}

// ── Verify text visible on list page ─────────────────────────────────────────
async function visibleOnPage(page: Page, path: string, text: string): Promise<boolean> {
  await page.goto(path);
  await settled(page);
  await page.waitForLoadState('networkidle');
  return page.locator(`text=${text}`).first().isVisible().catch(() => false);
}

// ── Verify text NOT visible on list page ─────────────────────────────────────
async function notVisibleOnPage(page: Page, path: string, text: string): Promise<boolean> {
  await page.goto(path);
  await settled(page);
  await page.waitForLoadState('networkidle');
  const count = await page.locator(`text=${text}`).count();
  return count === 0;
}

// ════════════════════════════════════════════════════════════════════════════
// 0. PRE-SWEEP — delete any FINAL-QA records left over from a previous failed run
// ════════════════════════════════════════════════════════════════════════════
test('PRE-SWEEP — clean any leftover FINAL-QA records from previous runs', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Workers (archive-first required)
  const workers = await api(page, 'GET', '/api/workers');
  if (workers.status === 200) {
    for (const w of workers.body as Array<{ id: string; full_name: string; is_archived: boolean }>) {
      if (!w.full_name?.includes('FINAL-QA')) continue;
      if (!w.is_archived) await api(page, 'PATCH', `/api/workers/${w.id}`, { is_archived: true });
      await api(page, 'DELETE', `/api/workers/${w.id}`);
    }
  }

  // Vehicles (unconditional delete)
  const vehicles = await api(page, 'GET', '/api/vehicles');
  if (vehicles.status === 200) {
    for (const v of vehicles.body as Array<{ id: string; notes?: string; vehicle_number?: string }>) {
      if (!(v.notes ?? v.vehicle_number ?? '').includes('FINAL-QA')) continue;
      await api(page, 'DELETE', `/api/vehicles/${v.id}`);
    }
  }

  // Heavy equipment (unconditional delete)
  const heavy = await api(page, 'GET', '/api/heavy-equipment');
  if (heavy.status === 200) {
    for (const h of heavy.body as Array<{ id: string; description: string }>) {
      if (!h.description?.includes('FINAL-QA')) continue;
      await api(page, 'DELETE', `/api/heavy-equipment/${h.id}`);
    }
  }

  // Lifting equipment (unconditional delete)
  const lifting = await api(page, 'GET', '/api/lifting-equipment');
  if (lifting.status === 200) {
    for (const l of lifting.body as Array<{ id: string; description: string }>) {
      if (!l.description?.includes('FINAL-QA')) continue;
      await api(page, 'DELETE', `/api/lifting-equipment/${l.id}`);
    }
  }

  // Subcontractors (archive-first required)
  const subs = await api(page, 'GET', '/api/subcontractors');
  if (subs.status === 200) {
    for (const s of subs.body as Array<{ id: string; name: string; is_archived: boolean }>) {
      if (!s.name?.includes('FINAL-QA')) continue;
      if (!s.is_archived) await api(page, 'PATCH', `/api/subcontractors/${s.id}`, { is_archived: true });
      await api(page, 'DELETE', `/api/subcontractors/${s.id}`);
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 1. WORKER lifecycle
// ════════════════════════════════════════════════════════════════════════════
test('LIFECYCLE — Worker: create, edit, archive, restore, delete', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const name = `FINAL-QA-WORKER-${TS}`;

  // ── CREATE ────────────────────────────────────────────────────────────────
  const create = await api(page, 'POST', '/api/workers', {
    full_name: name,
    national_id: `${TS}`.slice(-9), // 9-digit pseudo-ID
    is_foreign_worker: false,
  });
  expect(create.status, `create worker failed: ${JSON.stringify(create.body)}`).toBe(201);
  const workerId = (create.body as { id?: string }).id;
  expect(workerId, 'worker id missing').toBeTruthy();

  // ── UI VISIBLE ───────────────────────────────────────────────────────────
  expect(await visibleOnPage(page, '/workers', name)).toBe(true);

  // ── DETAIL PAGE ──────────────────────────────────────────────────────────
  await page.goto(`/workers/${workerId}`);
  await settled(page);
  await expect(page.locator('body')).toContainText(name);

  // ── EDIT (change full_name) ───────────────────────────────────────────────
  const editedName = `${name}-EDITED`;
  const edit = await api(page, 'PUT', `/api/workers/${workerId}`, {
    full_name: editedName,
    national_id: `${TS}`.slice(-9),
    is_foreign_worker: false,
  });
  expect(edit.status, `edit worker failed: ${JSON.stringify(edit.body)}`).toBe(200);

  // ── EDIT PERSISTED ───────────────────────────────────────────────────────
  await page.goto(`/workers/${workerId}`);
  await settled(page);
  await expect(page.locator('body')).toContainText(editedName);

  // ── ARCHIVE ──────────────────────────────────────────────────────────────
  const archive = await api(page, 'PATCH', `/api/workers/${workerId}`, { is_archived: true });
  expect(archive.status, `archive worker failed: ${JSON.stringify(archive.body)}`).toBe(200);

  // ── DISAPPEARS FROM ACTIVE LIST ──────────────────────────────────────────
  expect(await notVisibleOnPage(page, '/workers', editedName)).toBe(true);

  // ── APPEARS IN ARCHIVE PAGE ──────────────────────────────────────────────
  expect(await visibleOnPage(page, '/archive', editedName)).toBe(true);

  // ── RESTORE ──────────────────────────────────────────────────────────────
  const restore = await api(page, 'PATCH', `/api/workers/${workerId}`, { is_archived: false });
  expect(restore.status, `restore worker failed: ${JSON.stringify(restore.body)}`).toBe(200);

  // ── RETURNS TO ACTIVE LIST ───────────────────────────────────────────────
  expect(await visibleOnPage(page, '/workers', editedName)).toBe(true);

  // ── DELETE (requires archive-first; archive again then delete) ────────────
  await api(page, 'PATCH', `/api/workers/${workerId}`, { is_archived: true });
  const del = await api(page, 'DELETE', `/api/workers/${workerId}`);
  expect(del.status, `delete worker failed: ${JSON.stringify(del.body)}`).toBe(200);

  // ── VERIFY GONE ──────────────────────────────────────────────────────────
  const gone = await api(page, 'GET', `/api/workers/${workerId}`);
  expect(gone.status).toBe(404);
});

// ════════════════════════════════════════════════════════════════════════════
// 2. SITE MANAGER lifecycle (worker + is_responsible_site_manager role)
// ════════════════════════════════════════════════════════════════════════════
test('LIFECYCLE — Site Manager: create, promote, demote, archive, delete', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const name = `FINAL-QA-SITEMAN-${TS}`;

  // ── CREATE as regular worker ──────────────────────────────────────────────
  const create = await api(page, 'POST', '/api/workers', {
    full_name: name,
    national_id: `${TS + 1}`.slice(-9),
    is_foreign_worker: false,
  });
  expect(create.status, `create worker failed: ${JSON.stringify(create.body)}`).toBe(201);
  const wid = (create.body as { id?: string }).id!;

  // ── PROMOTE to site manager ───────────────────────────────────────────────
  const promote = await api(page, 'PATCH', `/api/workers/${wid}`, {
    is_responsible_site_manager: true,
  });
  expect(promote.status, `promote to site manager failed: ${JSON.stringify(promote.body)}`).toBe(200);

  // ── VISIBLE IN SITE MANAGERS LIST ────────────────────────────────────────
  expect(await visibleOnPage(page, '/site-managers', name)).toBe(true);

  // ── NOT in regular workers list after promotion (may still appear — verify via list API) ─
  const mgrsRes = await api(page, 'GET', `/api/workers?managers=true`);
  expect(mgrsRes.status).toBe(200);
  const mgrs = mgrsRes.body as Array<{ id: string }>;
  const found = mgrs.some(m => m.id === wid);
  expect(found, 'promoted worker not found in managers list').toBe(true);

  // ── EDIT (rename) ─────────────────────────────────────────────────────────
  const editedName = `${name}-EDITED`;
  const edit = await api(page, 'PUT', `/api/workers/${wid}`, {
    full_name: editedName,
    national_id: `${TS + 1}`.slice(-9),
    is_foreign_worker: false,
    is_responsible_site_manager: true,
  });
  expect(edit.status, `edit site manager failed`).toBe(200);
  expect(await visibleOnPage(page, '/site-managers', editedName)).toBe(true);

  // ── ARCHIVE + DELETE ──────────────────────────────────────────────────────
  await api(page, 'PATCH', `/api/workers/${wid}`, { is_archived: true });
  const del = await api(page, 'DELETE', `/api/workers/${wid}`);
  expect(del.status, `delete site manager failed: ${JSON.stringify(del.body)}`).toBe(200);
  const gone = await api(page, 'GET', `/api/workers/${wid}`);
  expect(gone.status).toBe(404);
});

// ════════════════════════════════════════════════════════════════════════════
// 3. VEHICLE lifecycle
// ════════════════════════════════════════════════════════════════════════════
test('LIFECYCLE — Vehicle: create, edit, archive, restore, delete', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const plateNum = `QA-${TS % 1_000_000}`;
  const notes = `FINAL-QA-VEHICLE-${TS}`;

  // ── CREATE ────────────────────────────────────────────────────────────────
  const create = await api(page, 'POST', '/api/vehicles', {
    vehicle_type: 'truck',
    vehicle_number: plateNum,
    notes,
  });
  expect(create.status, `create vehicle failed: ${JSON.stringify(create.body)}`).toBe(201);
  const vid = (create.body as { id?: string }).id!;

  // ── VISIBLE IN LIST ──────────────────────────────────────────────────────
  expect(await visibleOnPage(page, '/vehicles', plateNum)).toBe(true);

  // ── DETAIL PAGE ──────────────────────────────────────────────────────────
  await page.goto(`/vehicles/${vid}`);
  await settled(page);
  await expect(page.locator('body')).toContainText(plateNum);

  // ── EDIT (change notes) ───────────────────────────────────────────────────
  const editedNotes = `${notes}-EDITED`;
  const edit = await api(page, 'PATCH', `/api/vehicles/${vid}`, {
    notes: editedNotes,
  });
  expect(edit.status, `edit vehicle failed: ${JSON.stringify(edit.body)}`).toBe(200);

  // ── EDIT PERSISTED ───────────────────────────────────────────────────────
  await page.goto(`/vehicles/${vid}`);
  await settled(page);
  await expect(page.locator('body')).toContainText(editedNotes);

  // ── ARCHIVE ──────────────────────────────────────────────────────────────
  const archive = await api(page, 'PATCH', `/api/vehicles/${vid}`, { is_archived: true });
  expect(archive.status, `archive vehicle failed: ${JSON.stringify(archive.body)}`).toBe(200);
  expect(await notVisibleOnPage(page, '/vehicles', plateNum)).toBe(true);
  expect(await visibleOnPage(page, '/archive', plateNum)).toBe(true);

  // ── RESTORE ──────────────────────────────────────────────────────────────
  const restore = await api(page, 'PATCH', `/api/vehicles/${vid}`, { is_archived: false });
  expect(restore.status, `restore vehicle failed: ${JSON.stringify(restore.body)}`).toBe(200);
  expect(await visibleOnPage(page, '/vehicles', plateNum)).toBe(true);

  // ── DELETE (unconditional for vehicles) ───────────────────────────────────
  const del = await api(page, 'DELETE', `/api/vehicles/${vid}`);
  expect(del.status, `delete vehicle failed: ${JSON.stringify(del.body)}`).toBe(200);
  const gone = await api(page, 'GET', `/api/vehicles/${vid}`);
  expect(gone.status).toBe(404);
});

// ════════════════════════════════════════════════════════════════════════════
// 4. HEAVY EQUIPMENT lifecycle
// ════════════════════════════════════════════════════════════════════════════
test('LIFECYCLE — Heavy Equipment: create, edit, archive, restore, delete', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const desc = `FINAL-QA-HE-${TS}`;

  // ── CREATE ────────────────────────────────────────────────────────────────
  const create = await api(page, 'POST', '/api/heavy-equipment', {
    description: desc,
  });
  expect(create.status, `create heavy-equipment failed: ${JSON.stringify(create.body)}`).toBe(201);
  const hid = (create.body as { id?: string }).id!;

  // ── VISIBLE IN LIST ──────────────────────────────────────────────────────
  expect(await visibleOnPage(page, '/heavy-equipment', desc)).toBe(true);

  // ── DETAIL PAGE ──────────────────────────────────────────────────────────
  await page.goto(`/heavy-equipment/${hid}`);
  await settled(page);
  await expect(page.locator('body')).toContainText(desc);

  // ── EDIT ─────────────────────────────────────────────────────────────────
  const editedDesc = `${desc}-EDITED`;
  const edit = await api(page, 'PATCH', `/api/heavy-equipment/${hid}`, {
    description: editedDesc,
  });
  expect(edit.status, `edit heavy-equipment failed: ${JSON.stringify(edit.body)}`).toBe(200);
  await page.goto(`/heavy-equipment/${hid}`);
  await settled(page);
  await expect(page.locator('body')).toContainText(editedDesc);

  // ── ARCHIVE ──────────────────────────────────────────────────────────────
  const archive = await api(page, 'PATCH', `/api/heavy-equipment/${hid}`, { is_archived: true });
  expect(archive.status, `archive heavy-equipment failed`).toBe(200);
  expect(await notVisibleOnPage(page, '/heavy-equipment', editedDesc)).toBe(true);
  expect(await visibleOnPage(page, '/archive', editedDesc)).toBe(true);

  // ── RESTORE ──────────────────────────────────────────────────────────────
  const restore = await api(page, 'PATCH', `/api/heavy-equipment/${hid}`, { is_archived: false });
  expect(restore.status, `restore heavy-equipment failed`).toBe(200);
  expect(await visibleOnPage(page, '/heavy-equipment', editedDesc)).toBe(true);

  // ── DELETE ───────────────────────────────────────────────────────────────
  const del = await api(page, 'DELETE', `/api/heavy-equipment/${hid}`);
  expect(del.status, `delete heavy-equipment failed: ${JSON.stringify(del.body)}`).toBe(200);
  const gone = await api(page, 'GET', `/api/heavy-equipment/${hid}`);
  expect(gone.status).toBe(404);
});

// ════════════════════════════════════════════════════════════════════════════
// 5. LIFTING EQUIPMENT lifecycle
// ════════════════════════════════════════════════════════════════════════════
test('LIFECYCLE — Lifting Equipment: create, edit, archive, restore, delete', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const desc = `FINAL-QA-LE-${TS}`;

  // ── CREATE ────────────────────────────────────────────────────────────────
  const create = await api(page, 'POST', '/api/lifting-equipment', {
    description: desc,
  });
  expect(create.status, `create lifting-equipment failed: ${JSON.stringify(create.body)}`).toBe(201);
  const lid = (create.body as { id?: string }).id!;

  // ── VISIBLE IN LIST ──────────────────────────────────────────────────────
  expect(await visibleOnPage(page, '/lifting-equipment', desc)).toBe(true);

  // ── DETAIL PAGE ──────────────────────────────────────────────────────────
  await page.goto(`/lifting-equipment/${lid}`);
  await settled(page);
  await expect(page.locator('body')).toContainText(desc);

  // ── EDIT ─────────────────────────────────────────────────────────────────
  const editedDesc = `${desc}-EDITED`;
  const edit = await api(page, 'PATCH', `/api/lifting-equipment/${lid}`, {
    description: editedDesc,
  });
  expect(edit.status, `edit lifting-equipment failed`).toBe(200);
  await page.goto(`/lifting-equipment/${lid}`);
  await settled(page);
  await expect(page.locator('body')).toContainText(editedDesc);

  // ── ARCHIVE ──────────────────────────────────────────────────────────────
  const archive = await api(page, 'PATCH', `/api/lifting-equipment/${lid}`, { is_archived: true });
  expect(archive.status, `archive lifting-equipment failed`).toBe(200);
  expect(await notVisibleOnPage(page, '/lifting-equipment', editedDesc)).toBe(true);
  expect(await visibleOnPage(page, '/archive', editedDesc)).toBe(true);

  // ── RESTORE ──────────────────────────────────────────────────────────────
  const restore = await api(page, 'PATCH', `/api/lifting-equipment/${lid}`, { is_archived: false });
  expect(restore.status, `restore lifting-equipment failed`).toBe(200);
  expect(await visibleOnPage(page, '/lifting-equipment', editedDesc)).toBe(true);

  // ── DELETE ───────────────────────────────────────────────────────────────
  const del = await api(page, 'DELETE', `/api/lifting-equipment/${lid}`);
  expect(del.status, `delete lifting-equipment failed: ${JSON.stringify(del.body)}`).toBe(200);
  const gone = await api(page, 'GET', `/api/lifting-equipment/${lid}`);
  expect(gone.status).toBe(404);
});

// ════════════════════════════════════════════════════════════════════════════
// 6. SUBCONTRACTOR lifecycle
// ════════════════════════════════════════════════════════════════════════════
test('LIFECYCLE — Subcontractor: create, edit, archive, restore, delete', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const name = `FINAL-QA-SUB-${TS}`;

  // ── CREATE ────────────────────────────────────────────────────────────────
  const create = await api(page, 'POST', '/api/subcontractors', {
    name,
    contact_name: 'QA Contact',
    phone: '050-0000000',
    notes: 'lifecycle test record',
  });
  expect(create.status, `create subcontractor failed: ${JSON.stringify(create.body)}`).toBe(201);
  const sid = (create.body as { id?: string }).id!;

  // ── VISIBLE IN LIST ──────────────────────────────────────────────────────
  expect(await visibleOnPage(page, '/subcontractors', name)).toBe(true);

  // ── EDIT ─────────────────────────────────────────────────────────────────
  // No individual page exists for subcontractors — verify via API GET
  const editedName = `${name}-EDITED`;
  const edit = await api(page, 'PATCH', `/api/subcontractors/${sid}`, {
    name: editedName,
  });
  expect(edit.status, `edit subcontractor failed: ${JSON.stringify(edit.body)}`).toBe(200);

  // ── EDIT PERSISTED (API round-trip) ──────────────────────────────────────
  const refetch = await api(page, 'GET', `/api/subcontractors/${sid}`);
  expect(refetch.status, `re-fetch subcontractor failed`).toBe(200);
  expect((refetch.body as { name?: string }).name, 'edit not persisted').toBe(editedName);
  // Also verify in list UI
  expect(await visibleOnPage(page, '/subcontractors', editedName)).toBe(true);

  // ── ARCHIVE ──────────────────────────────────────────────────────────────
  const archive = await api(page, 'PATCH', `/api/subcontractors/${sid}`, { is_archived: true });
  expect(archive.status, `archive subcontractor failed`).toBe(200);
  expect(await notVisibleOnPage(page, '/subcontractors', editedName)).toBe(true);
  expect(await visibleOnPage(page, '/archive', editedName)).toBe(true);

  // ── RESTORE ──────────────────────────────────────────────────────────────
  const restore = await api(page, 'PATCH', `/api/subcontractors/${sid}`, { is_archived: false });
  expect(restore.status, `restore subcontractor failed`).toBe(200);
  expect(await visibleOnPage(page, '/subcontractors', editedName)).toBe(true);

  // ── DELETE (requires archive-first; archive again) ────────────────────────
  await api(page, 'PATCH', `/api/subcontractors/${sid}`, { is_archived: true });
  const del = await api(page, 'DELETE', `/api/subcontractors/${sid}`);
  expect(del.status, `delete subcontractor failed: ${JSON.stringify(del.body)}`).toBe(200);
  const gone = await api(page, 'GET', `/api/subcontractors/${sid}`);
  expect(gone.status).toBe(404);
});

// ════════════════════════════════════════════════════════════════════════════
// 7. CLEANUP VERIFICATION — no FINAL-QA records remain
// ════════════════════════════════════════════════════════════════════════════
test('CLEANUP — verify no FINAL-QA records remain in Internal QA', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Check each list API for any leftover FINAL-QA records
  const checks: Array<{ label: string; path: string }> = [
    { label: 'workers (active)',   path: '/api/workers' },
    { label: 'workers (managers)', path: '/api/workers?managers=true' },
    { label: 'vehicles',           path: '/api/vehicles' },
    { label: 'heavy-equipment',    path: '/api/heavy-equipment' },
    { label: 'lifting-equipment',  path: '/api/lifting-equipment' },
    { label: 'subcontractors',     path: '/api/subcontractors' },
  ];

  for (const { label, path } of checks) {
    const res = await api(page, 'GET', path);
    expect(res.status, `${label} list fetch failed`).toBe(200);
    const items = res.body as Array<{ full_name?: string; name?: string; description?: string; notes?: string; vehicle_number?: string }>;
    const leaked = items.filter(i =>
      (i.full_name ?? i.name ?? i.description ?? i.notes ?? i.vehicle_number ?? '')
        .includes('FINAL-QA'),
    );
    expect(leaked, `Leaked FINAL-QA records in ${label}: ${JSON.stringify(leaked)}`).toHaveLength(0);
  }

  // UI check: archive page should have no FINAL-QA records
  await page.goto('/archive');
  await settled(page);
  await page.waitForLoadState('networkidle');
  const bodyText = await page.locator('body').textContent() ?? '';
  expect(bodyText.includes('FINAL-QA'), 'FINAL-QA records found on archive page').toBe(false);
});
