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
 *  - Employee Reviews fixtures use stable deterministic names (QA-REVIEWS-*)
 *    and are found-and-updated rather than deleted-and-recreated.
 *  - No broad company-wide DELETE on workers table — only fixture-specific deletes.
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

// ─── Reviews manager QA constants ────────────────────────────────
export const QA_REVIEWS_MGR_EMAIL    = 'qa.reviews.manager@safedoc.local';
export const QA_REVIEWS_MGR_USERNAME = 'qa-reviews-manager';
/** Password is read from QA_REVIEWS_MGR_PASSWORD env var (set in .env.local, never committed). */
export function getReviewsMgrPassword(): string {
  const pw = process.env.QA_REVIEWS_MGR_PASSWORD;
  if (!pw) throw new Error('[global-setup] QA_REVIEWS_MGR_PASSWORD env var not set — add it to .env.local');
  return pw;
}

// ─── Employee Reviews fixture names (stable, deterministic) ──────
// These names are exclusively owned by the Employee Reviews QA suite.
// They survive repeated global-setup runs — found and updated, never
// deleted by a broad company-wide cleanup.
//
// GUARD: Never add .delete().eq('company_id', id) without a further
// fixture-specific filter (full_name or id). Broad company-wide DELETE
// on the workers table is forbidden in the Employee Reviews QA setup.
export const REVIEWS_FIXTURE_NAMES = {
  MANAGER:    'QA-REVIEWS-MANAGER-A',
  WORKER_1:   'QA-REVIEWS-WORKER-1',
  WORKER_2:   'QA-REVIEWS-WORKER-2',
  WORKER_3:   'QA-REVIEWS-WORKER-3',
  UNASSIGNED: 'QA-REVIEWS-UNASSIGNED',
} as const;

// Names used by the Employee Reviews setup BEFORE stable naming was introduced.
// Only used in the one-time migration cleanup in Step 3b.
const REVIEWS_LEGACY_WORKER_NAMES = [
  'QA Review Worker 1', 'QA Review Worker 2', 'QA Review Worker 3',
  'QA Site Manager (Reviews)', 'QA Review Unassigned Worker',
];

// ─── Auth state paths ─────────────────────────────────────────────
export const AUTH_STATE_PATH          = 'playwright/.auth/qa-session.json';
export const REVIEWS_AUTH_STATE_PATH  = 'playwright/.auth/qa-reviews-session.json';
export const REVIEWS_META_PATH        = 'playwright/.auth/qa-reviews-meta.json';

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

  // ── 3b. Migrate legacy Employee Reviews worker names ────────────────
  // SAFETY: This ONLY removes workers that had the OLD unstable names from
  // the previous Employee Reviews QA setup (before stable QA-REVIEWS-* naming).
  // It does NOT delete all workers — other suites' fixtures and any manually
  // created Internal QA workers are untouched.
  //
  // After the first run, these legacy names will not exist, so this block
  // becomes a no-op. The stable QA-REVIEWS-* fixtures are managed below in
  // Step 6 via find-or-update and never need pre-run deletion.
  {
    const { data: legacyWorkers } = await supabase
      .from('workers')
      .select('id')
      .eq('company_id', companyId)
      .in('full_name', REVIEWS_LEGACY_WORKER_NAMES);

    if (legacyWorkers && legacyWorkers.length > 0) {
      console.log(`[global-setup] Migrating ${legacyWorkers.length} legacy Employee Reviews worker(s) to stable names...`);
      const ids = legacyWorkers.map((w: { id: string }) => w.id);
      await supabase.from('entity_notes').delete().eq('entity_type', 'worker').in('entity_id', ids);
      await supabase.from('professional_licenses').delete().in('worker_id', ids);
      await supabase.from('manager_licenses').delete().in('worker_id', ids);
      await supabase.from('workers').update({ responsible_manager_id: null }).in('responsible_manager_id', ids);
      await supabase.from('workers').delete().in('id', ids);
      console.log('[global-setup] Legacy Employee Reviews workers removed; stable names will be created below.');
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
  await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 10_000 });
  await page.click('button[type="submit"]');

  await page.waitForURL(url =>
    url.pathname !== '/login',
    { timeout: 30_000, waitUntil: 'domcontentloaded' }
  );

  if (page.url().includes('/legal-consent')) {
    console.log('[global-setup] Handling legal consent...');
    await page.locator('#accept-terms').check();
    await page.locator('#accept-privacy').check();
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => url.pathname !== '/legal-consent', { timeout: 10_000 });
  }

  if (page.url().includes('/select-company')) {
    console.log('[global-setup] Selecting "Internal QA" company...');
    await page.locator('button', { hasText: QA_COMPANY }).first().click();
    await page.waitForURL(url => url.pathname !== '/select-company', { timeout: 15_000 });
  }

  console.log(`[global-setup] Switching active company to Internal QA (${companyId})...`);
  const switchRes = await page.request.post(`${baseURL}/api/session/company`, {
    data: { company_id: companyId },
    headers: { 'Content-Type': 'application/json' },
  });
  if (!switchRes.ok()) {
    await browser.close();
    throw new Error(`[global-setup] ABORT: Failed to switch active company to Internal QA. Status: ${switchRes.status()}`);
  }

  await page.goto(`${baseURL}/workers`);
  await page.waitForLoadState('networkidle');

  const pageHtml = await page.content().catch(() => '');
  if (!pageHtml.includes('Internal QA')) {
    await browser.close();
    throw new Error('[global-setup] ABORT: "Internal QA" not found in page HTML after company switch. Refusing to run tests.');
  }
  console.log('[global-setup] Active company confirmed as Internal QA.');

  await context.storageState({ path: AUTH_STATE_PATH });
  console.log(`[global-setup] Auth state saved to ${AUTH_STATE_PATH}`);

  writeFileSync('playwright/.auth/qa-meta.json', JSON.stringify({ companyId, userId: authUser.id }));

  // ── 6. Provision QA reviews manager (Employee Reviews fixtures) ────
  //
  // FIXTURE OWNERSHIP RULES (Employee Reviews QA suite):
  //  - All workers owned by this suite have names prefixed with "QA-REVIEWS-"
  //    (see REVIEWS_FIXTURE_NAMES above).
  //  - Fixtures are found by full_name and updated in place — never deleted
  //    and re-inserted on each run.  IDs are stable across runs.
  //  - NO broad DELETE on the workers table.  Only targeted deletes by
  //    fixture id or legacy name are permitted.
  //  - Unrelated Internal QA workers are never touched.
  //
  const mgrPassword = getReviewsMgrPassword();
  console.log('\n[global-setup] Provisioning QA reviews manager...');

  // 6a. Auth user (upsert by email)
  const allAuthUsers = (await supabase.auth.admin.listUsers({ perPage: 1000 })).data.users;
  let mgrAuthUser = allAuthUsers.find(u => u.email === QA_REVIEWS_MGR_EMAIL);
  if (!mgrAuthUser) {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: QA_REVIEWS_MGR_EMAIL, password: mgrPassword,
      email_confirm: true, user_metadata: { full_name: 'QA Reviews Manager' },
    });
    if (createErr) throw new Error(`[global-setup] reviews manager createUser failed: ${createErr.message}`);
    mgrAuthUser = created.user!;
    console.log('[global-setup] Reviews manager auth user created.');
  } else {
    await supabase.auth.admin.updateUserById(mgrAuthUser.id, { password: mgrPassword });
    console.log(`[global-setup] Reviews manager auth user exists (${mgrAuthUser.id}), password reset.`);
  }
  const mgrUserId = mgrAuthUser.id;

  // 6b. Profile (upsert by id)
  const { data: mgrProfile } = await supabase.from('profiles').select('id').eq('id', mgrUserId).single();
  if (!mgrProfile) {
    await supabase.from('profiles').insert({
      id: mgrUserId, full_name: 'QA Reviews Manager',
      username: QA_REVIEWS_MGR_USERNAME, email: QA_REVIEWS_MGR_EMAIL,
      role: 'user', is_active: true,
    });
  } else {
    await supabase.from('profiles').update({ is_active: true, role: 'user' }).eq('id', mgrUserId);
  }

  // 6c. Company member: member = viewer role (upsert by user_id + company_id)
  const { data: mgrMembership } = await supabase.from('company_members')
    .select('id, role, is_active').eq('user_id', mgrUserId).eq('company_id', companyId).single();
  if (!mgrMembership) {
    await supabase.from('company_members').insert({
      user_id: mgrUserId, company_id: companyId, role: 'member', is_active: true,
    });
  } else if (!mgrMembership.is_active || mgrMembership.role !== 'member') {
    await supabase.from('company_members').update({ is_active: true, role: 'member' })
      .eq('user_id', mgrUserId).eq('company_id', companyId);
  }

  // 6d. Site-manager worker (find-or-create by stable fixture name)
  // SAFETY: Scoped to full_name = REVIEWS_FIXTURE_NAMES.MANAGER — never a broad delete.
  const { data: existingMgrWorker } = await supabase.from('workers')
    .select('id')
    .eq('company_id', companyId)
    .eq('full_name', REVIEWS_FIXTURE_NAMES.MANAGER)
    .maybeSingle();

  let mgrWorkerId: string;
  if (!existingMgrWorker) {
    const { data: w, error: wErr } = await supabase.from('workers').insert({
      company_id: companyId,
      full_name:  REVIEWS_FIXTURE_NAMES.MANAGER,
      worker_type: 'israeli',
      is_responsible_site_manager: true,
      is_active: true, is_archived: false,
    }).select('id').single();
    if (wErr) throw new Error(`[global-setup] site-manager worker insert failed: ${wErr.message}`);
    mgrWorkerId = w!.id;
    console.log(`[global-setup] Created fixture worker: ${REVIEWS_FIXTURE_NAMES.MANAGER}`);
  } else {
    mgrWorkerId = existingMgrWorker.id;
    await supabase.from('workers').update({
      worker_type: 'israeli', is_responsible_site_manager: true,
      is_active: true, is_archived: false,
    }).eq('id', mgrWorkerId);
    console.log(`[global-setup] Reusing fixture worker: ${REVIEWS_FIXTURE_NAMES.MANAGER} (${mgrWorkerId})`);
  }

  // 6e. Manager-user mapping (targeted: delete only this user's mapping, then re-insert)
  await supabase.from('manager_user_mappings').delete()
    .eq('company_id', companyId).eq('user_id', mgrUserId);
  const { error: mappingErr } = await supabase.from('manager_user_mappings').insert({
    company_id: companyId, manager_worker_id: mgrWorkerId, user_id: mgrUserId,
  });
  if (mappingErr) throw new Error(`[global-setup] manager mapping insert failed: ${mappingErr.message}`);

  // 6f. 3 assigned workers (find-or-create by stable fixture name)
  const assignedFixtureNames = [
    REVIEWS_FIXTURE_NAMES.WORKER_1,
    REVIEWS_FIXTURE_NAMES.WORKER_2,
    REVIEWS_FIXTURE_NAMES.WORKER_3,
  ];
  const assignedWorkerIds: string[] = [];
  for (const fixtureName of assignedFixtureNames) {
    const { data: existingW } = await supabase.from('workers')
      .select('id')
      .eq('company_id', companyId)
      .eq('full_name', fixtureName)
      .maybeSingle();

    let wId: string;
    if (!existingW) {
      const { data: w, error: wErr } = await supabase.from('workers').insert({
        company_id: companyId,
        full_name:  fixtureName,
        worker_type: 'israeli',
        responsible_manager_id: mgrWorkerId,
        is_active: true, is_archived: false,
      }).select('id').single();
      if (wErr) throw new Error(`[global-setup] assigned worker insert failed: ${wErr.message}`);
      wId = w!.id;
      console.log(`[global-setup] Created fixture worker: ${fixtureName}`);
    } else {
      wId = existingW.id;
      await supabase.from('workers').update({
        worker_type: 'israeli',
        responsible_manager_id: mgrWorkerId,
        is_active: true, is_archived: false,
      }).eq('id', wId);
      console.log(`[global-setup] Reusing fixture worker: ${fixtureName} (${wId})`);
    }
    assignedWorkerIds.push(wId);
  }

  // 6g. Unassigned worker (find-or-create by stable fixture name)
  const { data: existingUnassigned } = await supabase.from('workers')
    .select('id')
    .eq('company_id', companyId)
    .eq('full_name', REVIEWS_FIXTURE_NAMES.UNASSIGNED)
    .maybeSingle();

  let unassignedWorkerId: string;
  if (!existingUnassigned) {
    const { data: w, error: uaErr } = await supabase.from('workers').insert({
      company_id: companyId,
      full_name:  REVIEWS_FIXTURE_NAMES.UNASSIGNED,
      worker_type: 'israeli',
      responsible_manager_id: null,
      is_active: true, is_archived: false,
    }).select('id').single();
    if (uaErr) throw new Error(`[global-setup] unassigned worker insert failed: ${uaErr.message}`);
    unassignedWorkerId = w!.id;
    console.log(`[global-setup] Created fixture worker: ${REVIEWS_FIXTURE_NAMES.UNASSIGNED}`);
  } else {
    unassignedWorkerId = existingUnassigned.id;
    await supabase.from('workers').update({
      worker_type: 'israeli', responsible_manager_id: null,
      is_active: true, is_archived: false,
    }).eq('id', unassignedWorkerId);
    console.log(`[global-setup] Reusing fixture worker: ${REVIEWS_FIXTURE_NAMES.UNASSIGNED} (${unassignedWorkerId})`);
  }

  // 6h. Enable employeeReviews feature on Internal QA
  const { data: coSettings } = await supabase.from('companies').select('settings').eq('id', companyId).single();
  const existingSettings = ((coSettings?.settings ?? {}) as Record<string, unknown>);
  const existingFeatures = ((existingSettings.features ?? {}) as Record<string, unknown>);
  await supabase.from('companies').update({
    settings: { ...existingSettings, features: { ...existingFeatures, employeeReviews: true } },
  }).eq('id', companyId);

  // 6i. Save meta for test fixtures
  writeFileSync(REVIEWS_META_PATH, JSON.stringify({
    companyId,
    mgrUserId,
    mgrWorkerId,
    assignedWorkerIds,
    unassignedWorkerId,
  }));
  console.log(`[global-setup] Reviews meta saved to ${REVIEWS_META_PATH}`);

  // 6j. Login as reviews manager and save auth state
  const mgrContext = await browser.newContext();
  const mgrPage    = await mgrContext.newPage();
  await mgrPage.goto(`${baseURL}/login`);
  await mgrPage.waitForSelector('input[type="text"]');
  await mgrPage.locator('input[type="text"]').fill(QA_REVIEWS_MGR_EMAIL);
  await mgrPage.locator('input[type="password"]').fill(mgrPassword);
  await mgrPage.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 10_000 });
  await mgrPage.click('button[type="submit"]');
  await mgrPage.waitForURL(url => url.pathname !== '/login', { timeout: 30_000, waitUntil: 'domcontentloaded' });

  if (mgrPage.url().includes('/legal-consent')) {
    await mgrPage.locator('#accept-terms').check();
    await mgrPage.locator('#accept-privacy').check();
    await mgrPage.locator('button[type="submit"]').click();
    await mgrPage.waitForURL(url => url.pathname !== '/legal-consent', { timeout: 10_000 });
  }
  if (mgrPage.url().includes('/select-company')) {
    await mgrPage.locator('button', { hasText: QA_COMPANY }).first().click();
    await mgrPage.waitForURL(url => url.pathname !== '/select-company', { timeout: 15_000 });
  }

  const mgrSwitchRes = await mgrPage.request.post(`${baseURL}/api/session/company`, {
    data: { company_id: companyId }, headers: { 'Content-Type': 'application/json' },
  });
  if (!mgrSwitchRes.ok()) {
    await browser.close();
    throw new Error(`[global-setup] ABORT: reviews manager company switch failed. Status: ${mgrSwitchRes.status()}`);
  }

  await mgrContext.storageState({ path: REVIEWS_AUTH_STATE_PATH });
  console.log(`[global-setup] Reviews manager auth state saved to ${REVIEWS_AUTH_STATE_PATH}`);
  await mgrContext.close();

  await browser.close();
  console.log('[global-setup] QA tenant ready.\n');
}
