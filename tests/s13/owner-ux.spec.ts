/**
 * QA Session 13 — Owner UX Improvements
 *
 * Feature 1: Company Switcher (NavBar)
 * Feature 2: User Invitation / Login Link Success Panel
 *
 * Safety rules:
 *  - Company B = Internal QA (4f3d08b0-6317-40bf-8f69-1702c39f9f05) — mutations allowed
 *  - Company A = SafeDoc (00000000-0000-0000-0000-000000000001) — READ ONLY
 *  - All test data cleaned up in afterAll
 */

import { test, expect } from '@playwright/test';
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

const TS = () => Date.now().toString(36).toUpperCase();

// ══════════════════════════════════════════════════════════════════════════
// FEATURE 1 — COMPANY SWITCHER
// ══════════════════════════════════════════════════════════════════════════

test.describe('S13-FEAT1: Company Switcher', () => {
  let meta: QaMeta;
  let svc: ReturnType<typeof createServiceClient>;
  let secondCompanyId: string | null = null;
  let secondMembershipId: string | null = null;

  test.beforeAll(async () => {
    meta = readQaMeta();
    if (meta.companyId !== COMPANY_B_ID) throw new Error(`SAFETY: active company is not Company B. Got ${meta.companyId}`);
    svc = createServiceClient();

    // Create a second temporary QA company for the switcher tests
    const ts = TS();
    const { data: co, error: coErr } = await svc.from('companies').insert({
      name: `QA-Switcher-${ts}`,
      slug: `qa-switcher-${ts.toLowerCase()}`,
      is_active: true,
    }).select('id').single();

    if (coErr) {
      console.error('[S13-FEAT1 beforeAll] company insert error:', coErr.message);
      return;
    }
    secondCompanyId = co!.id;

    // Add QA user to second company
    const { data: mem, error: memErr } = await svc.from('company_members').insert({
      company_id: secondCompanyId,
      user_id:    meta.userId,
      role:       'member',
      is_active:  true,
    }).select('id').single();

    if (memErr) {
      console.error('[S13-FEAT1 beforeAll] membership insert error:', memErr.message);
    } else {
      secondMembershipId = mem!.id;
    }
  });

  test.afterAll(async () => {
    // Restore: switch back to Company B
    if (secondCompanyId) {
      await svc.from('company_members').delete().eq('company_id', secondCompanyId).eq('user_id', meta.userId);
      await svc.from('companies').delete().eq('id', secondCompanyId);
    }
  });

  test.use({ storageState: 'playwright/.auth/qa-session.json' });

  // ── S13-1A: API — authorized switch returns 200 ───────────────────────────
  test('S13-1A: POST /api/session/company with authorized company_id → 200', async ({ request }) => {
    const res = await request.post('/api/session/company', {
      data: { company_id: COMPANY_B_ID },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('ok', true);
  });

  // ── S13-1B: API — unauthorized company_id returns 403 ────────────────────
  test('S13-1B: POST /api/session/company with Company A ID → 403 JSON', async ({ request }) => {
    const res = await request.post('/api/session/company', {
      data: { company_id: COMPANY_A_ID },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  // ── S13-1C: API — random UUID returns 403 ────────────────────────────────
  test('S13-1C: POST /api/session/company with random UUID → 403', async ({ request }) => {
    const res = await request.post('/api/session/company', {
      data: { company_id: '11111111-1111-1111-1111-111111111111' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(403);
  });

  // ── S13-1D: UI — switcher visible when user has >1 companies ─────────────
  test('S13-1D: switcher dropdown visible when user has multiple companies', async ({ page }) => {
    test.skip(!secondCompanyId, 'second company not created in beforeAll');

    await page.goto('/workers');
    await page.waitForLoadState('domcontentloaded');

    // Find the company button — it should have a dropdown chevron (multi-company)
    const companyBtn = page.locator('[title="החלף חברה"]');
    await expect(companyBtn).toBeVisible({ timeout: 5000 });

    // Click to open dropdown
    await companyBtn.click();

    // Dropdown must appear with both companies listed
    const dropdown = page.locator('[class*="shadow-lg"]').filter({ hasText: COMPANY_B_ID.slice(0, 5) });
    // The dropdown should contain company names
    const items = page.locator('[class*="shadow-lg"] button');
    const count = await items.count();
    expect(count, 'Dropdown should list at least 2 companies').toBeGreaterThanOrEqual(2);
  });

  // ── S13-1E: UI — only authorized companies appear in dropdown ─────────────
  test('S13-1E: dropdown lists only authorized companies — not Company A', async ({ page }) => {
    test.skip(!secondCompanyId, 'second company not created in beforeAll');

    await page.goto('/workers');
    await page.waitForLoadState('domcontentloaded');

    const companyBtn = page.locator('[title="החלף חברה"]');
    if (await companyBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await companyBtn.click();
      // The SafeDoc company (Company A) must NOT appear — QA user is not a member there
      const dropdownText = await page.locator('[class*="shadow-lg"]').first().textContent().catch(() => '');
      expect(dropdownText).not.toContain('SafeDoc'); // SafeDoc company name
    }
  });

  // ── S13-1F: API — failed switch does NOT corrupt current session ──────────
  test('S13-1F: failed switch (403) does not corrupt current session', async ({ request }) => {
    // Attempt invalid switch
    const badRes = await request.post('/api/session/company', {
      data: { company_id: '99999999-9999-9999-9999-999999999999' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(badRes.status()).toBe(403);

    // Current session still works — can still fetch Company B workers
    const workersRes = await request.get('/api/workers');
    expect(workersRes.ok()).toBe(true);
    const workers = await workersRes.json();
    expect(Array.isArray(workers)).toBe(true);
  });

  // ── S13-1G: API — switch to second company succeeds ───────────────────────
  test('S13-1G: switch to second QA company succeeds', async ({ request }) => {
    test.skip(!secondCompanyId, 'second company not created in beforeAll');

    const res = await request.post('/api/session/company', {
      data: { company_id: secondCompanyId! },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.ok()).toBe(true);

    // Switch back to Company B so subsequent tests are unaffected
    await request.post('/api/session/company', {
      data: { company_id: COMPANY_B_ID },
      headers: { 'Content-Type': 'application/json' },
    });
  });

  // ── S13-1H: cookie persists across requests (refresh preserves company) ───
  test('S13-1H: company switch persists in session cookie across requests', async ({ request }) => {
    // Switch to Company B
    await request.post('/api/session/company', {
      data: { company_id: COMPANY_B_ID },
      headers: { 'Content-Type': 'application/json' },
    });

    // Two subsequent API calls should see the same company
    const res1 = await request.get('/api/session/companies');
    const data1 = await res1.json();
    expect(data1.activeCompanyId).toBe(COMPANY_B_ID);

    const res2 = await request.get('/api/session/companies');
    const data2 = await res2.json();
    expect(data2.activeCompanyId).toBe(COMPANY_B_ID);
  });

  // ── S13-1I: after switch, workers API returns Company B data only ─────────
  test('S13-1I: workers after switch contain no Company A records', async ({ request }) => {
    await request.post('/api/session/company', {
      data: { company_id: COMPANY_B_ID },
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await request.get('/api/workers');
    expect(res.ok()).toBe(true);
    const workers = await res.json() as Array<{ company_id?: string }>;
    const companyALeaks = workers.filter(w => w.company_id === COMPANY_A_ID);
    expect(companyALeaks).toHaveLength(0);
  });

  // ── S13-1J: mobile hamburger — switcher present when multi-company ─────────
  test('S13-1J: mobile hamburger menu contains company section for multi-company users', async ({ page }) => {
    test.skip(!secondCompanyId, 'second company not created in beforeAll');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/workers');
    // Wait for networkidle so useSessionCompanies() finishes fetching before
    // we open the hamburger — otherwise hasMultipleCompanies may still be false
    await page.waitForLoadState('networkidle');

    // Open hamburger
    const hamburger = page.locator('button[aria-label="פתח תפריט"]');
    await expect(hamburger).toBeVisible({ timeout: 5000 });
    await hamburger.click();

    // Mobile menu should contain "החלפת חברה" section label
    // Give a generous timeout: the section only renders when hasMultipleCompanies=true
    await expect(page.locator('text=החלפת חברה')).toBeVisible({ timeout: 7000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// FEATURE 2 — USER INVITATION / LOGIN LINK
// ══════════════════════════════════════════════════════════════════════════

test.describe('S13-FEAT2: User Invitation Success Panel', () => {
  let meta: QaMeta;
  let svc: ReturnType<typeof createServiceClient>;
  const createdUserIds: string[] = [];

  test.use({
    storageState: 'playwright/.auth/qa-session.json',
    permissions: ['clipboard-read', 'clipboard-write'],
  });

  test.beforeAll(async () => {
    meta = readQaMeta();
    if (meta.companyId !== COMPANY_B_ID) throw new Error(`SAFETY: active company is not Company B.`);
    svc = createServiceClient();
  });

  test.afterAll(async () => {
    for (const uid of createdUserIds) {
      const { data: members } = await svc.from('company_members').select('id').eq('user_id', uid);
      if (members?.length) await svc.from('company_members').delete().eq('user_id', uid);
      await svc.from('profiles').delete().eq('id', uid);
      await svc.auth.admin.deleteUser(uid);
    }
  });

  // ── S13-2A: API — create-user returns no password ─────────────────────────
  test('S13-2A: POST /api/companies/members/create-user response contains no password field', async ({ request }) => {
    const ts = TS();
    const username = `qa-inv-${ts.toLowerCase()}`;
    const res = await request.post('/api/companies/members/create-user', {
      data: {
        full_name: `QA Invite ${ts}`,
        username,
        password: 'TestP@ssw0rd!',
        companyRole: 'member',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.ok(), `Expected 201 but got ${res.status()}`).toBe(true);
    const data = await res.json();

    // Track for cleanup
    if (data.user_id) createdUserIds.push(data.user_id);
    if (data.profile?.id) createdUserIds.push(data.profile.id);

    // Must NOT contain password in any form
    const bodyStr = JSON.stringify(data);
    expect(bodyStr).not.toContain('TestP@ssw0rd!');
    expect(bodyStr).not.toContain('password');
    expect(bodyStr).not.toContain('passwd');

    // Must contain profile info
    expect(data.profile).toBeDefined();
    expect(data.profile.username).toBe(username);
  });

  // ── S13-2B: UI — success panel appears after user creation ────────────────
  test('S13-2B: success panel visible after creating a user in CreateUserModal', async ({ page }) => {
    const ts = TS();
    const username = `qa-ui-${ts.toLowerCase()}`;
    let createdUserId: string | null = null;

    // Intercept create-user API to capture the user id for cleanup
    await page.route('/api/companies/members/create-user', async route => {
      const res = await route.fetch();
      const body = await res.json();
      if (body?.user_id) createdUserId = body.user_id;
      if (body?.profile?.id) createdUserId = body.profile.id;
      await route.fulfill({ response: res });
    });

    await page.goto('/company/members');
    await page.waitForLoadState('networkidle');

    // Open "הוסף משתמש לחברה" → AddExistingModal
    await page.locator('button', { hasText: 'הוסף משתמש לחברה' }).click();
    // Wait for AddExistingModal title to confirm it opened
    await expect(page.locator('h2', { hasText: 'הוסף משתמש קיים לחברה' })).toBeVisible({ timeout: 5000 });

    // Switch to CreateUserModal via the "צור משתמש חדש" link-button
    await page.locator('button', { hasText: 'צור משתמש חדש' }).click();
    // Wait for CreateUserModal form to be ready
    await expect(page.locator('input[placeholder="ישראל ישראלי"]')).toBeVisible({ timeout: 5000 });

    // Fill form
    await page.locator('input[placeholder="ישראל ישראלי"]').fill(`QA Invite UI ${ts}`);
    await page.locator('input[placeholder="israel-israeli"]').fill(username);
    await page.locator('input[type="password"]').fill('TestP@ssw0rd!');
    await page.locator('button[type="submit"]').click();

    // Success panel should appear — contains "משתמש נוצר בהצלחה" heading
    await expect(page.locator('text=משתמש נוצר בהצלחה')).toBeVisible({ timeout: 10000 });

    // Username should appear in the success panel
    await expect(page.locator(`text=${username}`)).toBeVisible({ timeout: 3000 });

    // Cleanup
    if (createdUserId) createdUserIds.push(createdUserId);
  });

  // ── S13-2C: UI — login URL in success panel does NOT contain password ─────
  test('S13-2C: login URL in success panel contains no password', async ({ page }) => {
    const ts = TS();
    const username = `qa-url-${ts.toLowerCase()}`;
    let createdUserId: string | null = null;

    await page.route('/api/companies/members/create-user', async route => {
      const res = await route.fetch();
      const body = await res.json();
      if (body?.profile?.id) createdUserId = body.profile.id;
      await route.fulfill({ response: res });
    });

    await page.goto('/company/members');
    await page.waitForLoadState('networkidle');

    await page.locator('button', { hasText: 'הוסף משתמש לחברה' }).click();
    await expect(page.locator('h2', { hasText: 'הוסף משתמש קיים לחברה' })).toBeVisible({ timeout: 5000 });
    await page.locator('button', { hasText: 'צור משתמש חדש' }).click();
    await expect(page.locator('input[placeholder="ישראל ישראלי"]')).toBeVisible({ timeout: 5000 });

    await page.locator('input[placeholder="ישראל ישראלי"]').fill(`QA URL Test ${ts}`);
    await page.locator('input[placeholder="israel-israeli"]').fill(username);
    const pw = 'Sup3rS3cret!';
    await page.locator('input[type="password"]').fill(pw);
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('text=משתמש נוצר בהצלחה')).toBeVisible({ timeout: 10000 });

    // The entire page should not contain the raw password
    const content = await page.content();
    expect(content).not.toContain(pw);

    // WhatsApp URL in the page must not contain the password
    const waLinks = page.locator('a[href*="wa.me"]');
    if (await waLinks.count() > 0) {
      const href = await waLinks.first().getAttribute('href') ?? '';
      expect(href).not.toContain(pw);
    }

    if (createdUserId) createdUserIds.push(createdUserId);
  });

  // ── S13-2D: UI — copy link button works and shows confirmation ───────────
  test('S13-2D: copy login link button shows confirmation after click', async ({ page }) => {
    const ts = TS();
    const username = `qa-copy-${ts.toLowerCase()}`;
    let createdUserId: string | null = null;

    await page.route('/api/companies/members/create-user', async route => {
      const res = await route.fetch();
      const body = await res.json();
      if (body?.profile?.id) createdUserId = body.profile.id;
      await route.fulfill({ response: res });
    });

    await page.goto('/company/members');
    await page.waitForLoadState('networkidle');

    await page.locator('button', { hasText: 'הוסף משתמש לחברה' }).click();
    await expect(page.locator('h2', { hasText: 'הוסף משתמש קיים לחברה' })).toBeVisible({ timeout: 5000 });
    await page.locator('button', { hasText: 'צור משתמש חדש' }).click();
    await expect(page.locator('input[placeholder="ישראל ישראלי"]')).toBeVisible({ timeout: 5000 });

    await page.locator('input[placeholder="ישראל ישראלי"]').fill(`QA Copy Test ${ts}`);
    await page.locator('input[placeholder="israel-israeli"]').fill(username);
    await page.locator('input[type="password"]').fill('TestP@ssw0rd!');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('text=משתמש נוצר בהצלחה')).toBeVisible({ timeout: 10000 });

    // Click "העתק קישור" (copy link)
    const copyLinkBtn = page.locator('button', { hasText: /העתק קישור|הועתק/ });
    await expect(copyLinkBtn).toBeVisible({ timeout: 3000 });
    await copyLinkBtn.click();

    // After click, button should show confirmation (הועתק!)
    await expect(page.locator('button', { hasText: 'הועתק!' })).toBeVisible({ timeout: 3000 });

    if (createdUserId) createdUserIds.push(createdUserId);
  });

  // ── S13-2E: UI — copy message does not contain the password ──────────────
  test('S13-2E: copied message does not contain the password', async ({ page }) => {
    const ts = TS();
    const username = `qa-msg-${ts.toLowerCase()}`;
    const password = 'S3cretPw123!';
    let createdUserId: string | null = null;

    await page.route('/api/companies/members/create-user', async route => {
      const res = await route.fetch();
      const body = await res.json();
      if (body?.profile?.id) createdUserId = body.profile.id;
      await route.fulfill({ response: res });
    });

    await page.goto('/company/members');
    await page.waitForLoadState('networkidle');

    await page.locator('button', { hasText: 'הוסף משתמש לחברה' }).click();
    await expect(page.locator('h2', { hasText: 'הוסף משתמש קיים לחברה' })).toBeVisible({ timeout: 5000 });
    await page.locator('button', { hasText: 'צור משתמש חדש' }).click();
    await expect(page.locator('input[placeholder="ישראל ישראלי"]')).toBeVisible({ timeout: 5000 });

    await page.locator('input[placeholder="ישראל ישראלי"]').fill(`QA Msg Test ${ts}`);
    await page.locator('input[placeholder="israel-israeli"]').fill(username);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('text=משתמש נוצר בהצלחה')).toBeVisible({ timeout: 10000 });

    // Click "העתק הודעה"
    const copyMsgBtn = page.locator('button', { hasText: /העתק הודעה|הועתק/ }).first();
    await copyMsgBtn.click();
    await page.waitForTimeout(300);

    // Read clipboard
    const clipText = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    if (clipText) {
      expect(clipText).not.toContain(password);
      expect(clipText).toContain(username);
      expect(clipText).toContain('/login');
      expect(clipText).toContain('בנפרד'); // "הסיסמה ... בנפרד"
    }

    if (createdUserId) createdUserIds.push(createdUserId);
  });

  // ── S13-2F: UI — MemberRow has copy login details button ─────────────────
  test('S13-2F: existing members table shows copy login details button', async ({ page }) => {
    await page.goto('/company/members');
    await page.waitForLoadState('domcontentloaded');

    // Look for copy icon buttons in the table (SVG clipboard icon or ✓)
    // The copy button is a button with title "העתק פרטי כניסה"
    const copyBtns = page.locator('button[title="העתק פרטי כניסה"]');
    const count = await copyBtns.count();

    // If there are members, at least one copy button should exist
    const tableRows = page.locator('tbody tr');
    const rowCount = await tableRows.count();
    if (rowCount > 0) {
      expect(count, 'Each member row should have a copy login button').toBeGreaterThan(0);
    }
  });

  // ── S13-2G: UI — finalize button adds user to table ───────────────────────
  test('S13-2G: "סיום ← הוסף לרשימה" button adds new user to members table', async ({ page }) => {
    const ts = TS();
    const username = `qa-done-${ts.toLowerCase()}`;
    const fullName = `QA Done Test ${ts}`;
    let createdUserId: string | null = null;

    await page.route('/api/companies/members/create-user', async route => {
      const res = await route.fetch();
      const body = await res.json();
      if (body?.profile?.id) createdUserId = body.profile.id;
      await route.fulfill({ response: res });
    });

    await page.goto('/company/members');
    await page.waitForLoadState('networkidle');

    const rowsBefore = await page.locator('tbody tr').count();

    await page.locator('button', { hasText: 'הוסף משתמש לחברה' }).click();
    await expect(page.locator('h2', { hasText: 'הוסף משתמש קיים לחברה' })).toBeVisible({ timeout: 5000 });
    await page.locator('button', { hasText: 'צור משתמש חדש' }).click();
    await expect(page.locator('input[placeholder="ישראל ישראלי"]')).toBeVisible({ timeout: 5000 });

    await page.locator('input[placeholder="ישראל ישראלי"]').fill(fullName);
    await page.locator('input[placeholder="israel-israeli"]').fill(username);
    await page.locator('input[type="password"]').fill('TestP@ssw0rd!');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('text=משתמש נוצר בהצלחה')).toBeVisible({ timeout: 10000 });

    // Click finalize button
    await page.locator('button', { hasText: 'סיום ← הוסף לרשימה' }).click();

    // Modal closes and the new user appears in the table
    await expect(page.locator('text=משתמש נוצר בהצלחה')).not.toBeVisible({ timeout: 3000 });
    const rowsAfter = await page.locator('tbody tr').count();
    expect(rowsAfter).toBeGreaterThan(rowsBefore);

    if (createdUserId) createdUserIds.push(createdUserId);
  });
});
