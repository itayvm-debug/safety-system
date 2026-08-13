/**
 * Playwright global setup — provisions the QA test tenant once per run.
 *
 * Creates / resets:
 *  - qa.bot@safedoc.local   (Supabase Auth + profiles row)
 *  - "Internal QA" company  (companies + company_members)
 *
 * Safe constraints:
 *  - Only touches records whose name/email contains "qa" or "Internal QA".
 *  - Never touches Company A / SafeDoc production data.
 */

import { chromium, type FullConfig } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// ─── QA constants ─────────────────────────────────────────────────
export const QA_EMAIL    = 'qa.bot@safedoc.local';
export const QA_PASSWORD = 'QaBot_Playwright_2024!';
export const QA_USERNAME = 'qa-bot';
export const QA_COMPANY  = 'Internal QA';
export const QA_SLUG     = 'internal-qa';

// ─── Auth state paths ─────────────────────────────────────────────
export const AUTH_STATE_PATH = 'playwright/.auth/qa-session.json';

/** Parse .env.local manually since global setup runs before Next.js */
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
  } catch {
    // .env.local might not exist in CI — rely on existing env vars
  }
}

export default async function globalSetup(config: FullConfig) {
  loadEnvLocal();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('globalSetup: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('\n[global-setup] Provisioning QA tenant...');

  // ── 1. Find or create Auth user ──────────────────────────────────
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  let authUser = users.find(u => u.email === QA_EMAIL);

  if (!authUser) {
    console.log(`[global-setup] Creating Supabase Auth user ${QA_EMAIL}`);
    const { data, error } = await supabase.auth.admin.createUser({
      email:          QA_EMAIL,
      password:       QA_PASSWORD,
      email_confirm:  true,
      user_metadata:  { full_name: 'QA Bot' },
    });
    if (error) throw new Error(`[global-setup] createUser failed: ${error.message}`);
    authUser = data.user!;
  } else {
    // Reset password to the known test value every run
    await supabase.auth.admin.updateUserById(authUser.id, { password: QA_PASSWORD });
    console.log(`[global-setup] Auth user exists (${authUser.id}), password reset.`);
  }

  // ── 2. Find or create profiles row ───────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', authUser.id)
    .single();

  if (!profile) {
    console.log(`[global-setup] Creating profile for ${QA_EMAIL}`);
    const { error } = await supabase.from('profiles').insert({
      id:        authUser.id,
      full_name: 'QA Bot',
      username:  QA_USERNAME,
      email:     QA_EMAIL,
      role:      'admin',
      is_active: true,
    });
    if (error) throw new Error(`[global-setup] profile insert failed: ${error.message}`);
  } else {
    // Ensure active and admin
    await supabase.from('profiles')
      .update({ is_active: true, role: 'admin' })
      .eq('id', authUser.id);
  }

  // ── 3. Find or create "Internal QA" company ───────────────────────
  const { data: existingCompany } = await supabase
    .from('companies')
    .select('id, name, slug, is_active')
    .eq('name', QA_COMPANY)
    .single();

  let companyId: string;

  if (!existingCompany) {
    console.log(`[global-setup] Creating company "${QA_COMPANY}"`);
    const { data: newCo, error } = await supabase
      .from('companies')
      .insert({ name: QA_COMPANY, slug: QA_SLUG, is_active: true })
      .select('id')
      .single();
    if (error) throw new Error(`[global-setup] company insert failed: ${error.message}`);
    companyId = newCo!.id;
  } else {
    companyId = existingCompany.id;
    if (!existingCompany.is_active) {
      await supabase.from('companies').update({ is_active: true }).eq('id', companyId);
    }
    console.log(`[global-setup] Company "${QA_COMPANY}" exists (${companyId}).`);
  }

  // ── 3a-extra. Clean up leftover QA test users (@qa.test email domain) ──
  // Tests that call POST /api/companies/members/create-user use email
  // addresses ending in @qa.test. Clean those up before the run so state
  // is predictable. Never touches qa.bot@safedoc.local.
  {
    const { data: { users: allUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const qaTestUsers = allUsers.filter(
      (u) => u.email?.endsWith('@qa.test') && u.email !== QA_EMAIL
    );
    if (qaTestUsers.length > 0) {
      console.log(`[global-setup] Cleaning up ${qaTestUsers.length} leftover @qa.test auth user(s)...`);
      for (const u of qaTestUsers) {
        await supabase.from('company_members').delete().eq('user_id', u.id);
        await supabase.from('profiles').delete().eq('id', u.id);
        await supabase.auth.admin.deleteUser(u.id);
      }
      console.log('[global-setup] @qa.test users cleaned up.');
    }
  }

  // ── 3b. Clean up any leftover workers from prior test runs ──────────
  {
    const { data: leftoverWorkers } = await supabase
      .from('workers')
      .select('id')
      .eq('company_id', companyId);

    if (leftoverWorkers && leftoverWorkers.length > 0) {
      console.log(`[global-setup] Cleaning up ${leftoverWorkers.length} leftover worker(s) from previous runs...`);
      const ids = leftoverWorkers.map((w: { id: string }) => w.id);
      // Remove polymorphic notes (no FK cascade)
      await supabase.from('entity_notes').delete().eq('entity_type', 'worker').in('entity_id', ids);
      // Remove license tables that may not cascade
      await supabase.from('professional_licenses').delete().in('worker_id', ids);
      await supabase.from('manager_licenses').delete().in('worker_id', ids);
      // Detach responsible_manager references on other workers
      await supabase.from('workers').update({ responsible_manager_id: null }).in('responsible_manager_id', ids);
      // Delete workers (cascades documents, briefings, heights, appointments)
      await supabase.from('workers').delete().eq('company_id', companyId);
      console.log('[global-setup] Leftover workers cleaned up.');
    }
  }

  // ── 3c. Clean up any leftover vehicles from prior test runs ─────────
  // Vehicle PATCH/DELETE API endpoints are non-functional (BUG B-01), so
  // in-test cleanup fails. This pre-run sweep guarantees a clean slate.
  {
    const { data: leftoverVehicles } = await supabase
      .from('vehicles')
      .select('id')
      .eq('company_id', companyId);

    if (leftoverVehicles && leftoverVehicles.length > 0) {
      console.log(`[global-setup] Cleaning up ${leftoverVehicles.length} leftover vehicle(s) from previous runs...`);
      // vehicle_licenses and vehicle_insurances cascade from vehicle_id FK,
      // but deleting via company_id filter is safest with service_role.
      const vids = leftoverVehicles.map((v: { id: string }) => v.id);
      await supabase.from('vehicle_licenses').delete().in('vehicle_id', vids);
      await supabase.from('vehicle_insurances').delete().in('vehicle_id', vids);
      await supabase.from('vehicles').delete().eq('company_id', companyId);
      console.log('[global-setup] Leftover vehicles cleaned up.');
    }
  }

  // ── 3d. Clean up any leftover heavy equipment from prior test runs ─────
  {
    const { data: leftoverHE } = await supabase
      .from('heavy_equipment')
      .select('id')
      .eq('company_id', companyId);

    if (leftoverHE && leftoverHE.length > 0) {
      console.log(`[global-setup] Cleaning up ${leftoverHE.length} leftover heavy equipment from previous runs...`);
      const heIds = leftoverHE.map((h: { id: string }) => h.id);
      // heavy_equipment_insurances cascades on heavy_equipment_id FK, but
      // explicit deletion with service_role is safest.
      await supabase.from('heavy_equipment_insurances').delete().in('heavy_equipment_id', heIds);
      await supabase.from('heavy_equipment').delete().eq('company_id', companyId);
      console.log('[global-setup] Leftover heavy equipment cleaned up.');
    }
  }

  // ── 3e. Clean up any leftover lifting equipment from prior test runs ─────
  {
    const { data: leftoverLE } = await supabase
      .from('lifting_equipment')
      .select('id')
      .eq('company_id', companyId);

    if (leftoverLE && leftoverLE.length > 0) {
      console.log(`[global-setup] Cleaning up ${leftoverLE.length} leftover lifting equipment from previous runs...`);
      // lifting_machine_appointments references lifting_equipment; delete appointments first
      await supabase.from('lifting_machine_appointments').delete().eq('company_id', companyId);
      await supabase.from('lifting_equipment').delete().eq('company_id', companyId);
      console.log('[global-setup] Leftover lifting equipment cleaned up.');
    }
  }

  // ── 4. Ensure company membership (owner) ─────────────────────────
  const { data: membership } = await supabase
    .from('company_members')
    .select('id, is_active, role')
    .eq('user_id', authUser.id)
    .eq('company_id', companyId)
    .single();

  if (!membership) {
    console.log(`[global-setup] Creating company_member link`);
    const { error } = await supabase.from('company_members').insert({
      user_id:    authUser.id,
      company_id: companyId,
      role:       'owner',
      is_active:  true,
    });
    if (error) throw new Error(`[global-setup] company_members insert failed: ${error.message}`);
  } else if (!membership.is_active || membership.role !== 'owner') {
    await supabase.from('company_members')
      .update({ is_active: true, role: 'owner' })
      .eq('user_id', authUser.id)
      .eq('company_id', companyId);
  }

  // ── 5. Log in via the browser and save auth state ─────────────────
  console.log('[global-setup] Logging in to capture auth cookies...');
  mkdirSync('playwright/.auth', { recursive: true });

  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3000';
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page    = await context.newPage();

  // Navigate to login
  await page.goto(`${baseURL}/login`);
  await page.waitForSelector('input[type="text"]');
  await page.locator('input[type="text"]').fill(QA_EMAIL);
  await page.locator('input[type="password"]').fill(QA_PASSWORD);
  // Wait for React state to propagate (button enabled when both fields are non-empty)
  await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 10_000 });
  await page.click('button[type="submit"]');

  // Wait for redirect after login — domcontentloaded is sufficient to confirm
  // we left /login; full "load" can be slow on a warm dev server.
  await page.waitForURL(url =>
    url.pathname !== '/login',
    { timeout: 30_000, waitUntil: 'domcontentloaded' }
  );

  // Handle consent page if shown
  if (page.url().includes('/legal-consent')) {
    console.log('[global-setup] Handling legal consent...');
    await page.locator('#accept-terms').check();
    await page.locator('#accept-privacy').check();
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => url.pathname !== '/legal-consent', { timeout: 10_000 });
  }

  // Handle company selection if shown
  if (page.url().includes('/select-company')) {
    console.log('[global-setup] Selecting "Internal QA" company...');
    await page.locator('button', { hasText: QA_COMPANY }).first().click();
    await page.waitForURL(url => url.pathname !== '/select-company', { timeout: 15_000 });
  }

  // Explicitly switch active company to Internal QA via API (handles cases where
  // login bypassed /select-company and defaulted to a different company)
  console.log(`[global-setup] Switching active company to Internal QA (${companyId})...`);
  const switchRes = await page.request.post(`${baseURL}/api/session/company`, {
    data: { company_id: companyId },
    headers: { 'Content-Type': 'application/json' },
  });
  if (!switchRes.ok()) {
    await browser.close();
    throw new Error(`[global-setup] ABORT: Failed to switch active company to Internal QA. Status: ${switchRes.status()}`);
  }

  // Navigate to workers to confirm active company
  await page.goto(`${baseURL}/workers`);
  await page.waitForLoadState('networkidle');

  // Verify "Internal QA" appears in the rendered HTML (company name is in DOM even if hidden by CSS)
  const pageHtml = await page.content().catch(() => '');
  if (!pageHtml.includes('Internal QA')) {
    await browser.close();
    throw new Error('[global-setup] ABORT: "Internal QA" not found in page HTML after company switch. Refusing to run tests.');
  }
  console.log('[global-setup] Active company confirmed as Internal QA.');

  // Save auth state
  await context.storageState({ path: AUTH_STATE_PATH });
  console.log(`[global-setup] Auth state saved to ${AUTH_STATE_PATH}`);

  // Write company id for tests to use
  writeFileSync('playwright/.auth/qa-meta.json', JSON.stringify({ companyId, userId: authUser.id }));

  await browser.close();
  console.log('[global-setup] QA tenant ready.\n');
}
