// Isolated browser regression: a completed safety briefing must survive leaving the
// worker card, re-entering it from the list and a full reload, and the list and the
// card must agree. Another invalid document must keep the worker invalid.
//
// Safe by construction:
//   * the app is built and run from a copy of the repository WITHOUT any .env* file
//     (the run aborts if one is found), so .env.local / production keys are never read;
//   * Supabase points to an in-memory mock on 127.0.0.1 (mock-supabase.mjs);
//   * the browser is a fresh Playwright Chromium profile with the real Service Worker.
//
// Usage (from the repository root):
//   node tests/isolated/briefing-persistence.e2e.mjs --workdir <empty or previous work dir>
//        [--skip-build] [--sw <path to an alternative public/sw.js>] [--keep]
import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, copyFileSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve, basename } from 'node:path';
import { createMockSupabase } from './mock-supabase.mjs';

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const WORKDIR = resolve(arg('--workdir') ?? join(REPO, '..', 'safedoc-isolated-e2e'));
const SW_OVERRIDE = arg('--sw');
// Application source to build (default: this repository). Lets the same scenario run
// against an exported commit, e.g. `git archive <sha> | tar -x -C <dir>`.
const SOURCE = resolve(arg('--source') ?? REPO);
const SKIP_BUILD = args.includes('--skip-build');
const MOCK_PORT = 54399;
const APP_PORT = 3999;
const BASE = `http://127.0.0.1:${APP_PORT}`;

const ENV = {
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) =>
    !/SUPABASE|SESSION_SECRET|CRON_SECRET|RESEND|ANTHROPIC|COOKIE_SECRET|REPORT_|NEXT_PUBLIC_APP_URL/.test(k))),
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mock-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key',
  SESSION_SECRET: 'isolated-e2e-session-secret',
  NEXT_PUBLIC_APP_URL: BASE,
  NEXT_TELEMETRY_DISABLED: '1',
};

// ── 1. Prepare the isolated copy ─────────────────────────────────
function prepareWorkdir() {
  if (WORKDIR === REPO || WORKDIR.startsWith(REPO + '\\') || WORKDIR.startsWith(REPO + '/')) {
    throw new Error('workdir must be outside the repository');
  }
  mkdirSync(WORKDIR, { recursive: true });
  for (const name of readdirSync(WORKDIR)) {
    if (name !== 'node_modules') rmSync(join(WORKDIR, name), { recursive: true, force: true });
  }
  const skip = new Set(['node_modules', '.next', '.git', 'promo', 'test-results', 'playwright-report']);
  cpSync(SOURCE, WORKDIR, {
    recursive: true,
    filter: (src) => {
      const name = basename(src);
      if (src === SOURCE) return true;
      if (/^\.env/.test(name)) return false;
      return !skip.has(name);
    },
  });
  if (!existsSync(join(WORKDIR, 'node_modules'))) {
    symlinkSync(join(REPO, 'node_modules'), join(WORKDIR, 'node_modules'), 'junction');
  }
}

function assertNoEnvFiles() {
  const found = readdirSync(WORKDIR).filter((n) => /^\.env/.test(n));
  if (found.length) throw new Error(`refusing to run: ${found.join(', ')} present in ${WORKDIR}`);
}

function next(argsList, opts = {}) {
  const bin = join(WORKDIR, 'node_modules', 'next', 'dist', 'bin', 'next');
  return [process.execPath, [bin, ...argsList], { cwd: WORKDIR, env: ENV, ...opts }];
}

// ── 2. Data (all synthetic) ──────────────────────────────────────
const day = (offset) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const C = '11111111-1111-4111-8111-111111111111';
const U = '22222222-2222-4222-8222-222222222222';
const W1 = '33333333-3333-4333-8333-333333333331';
const W2 = '33333333-3333-4333-8333-333333333332';
const NAME1 = 'בדיקה תדריך-בלבד';
const NAME2 = 'בדיקה אשרה-פגה';
const created = '2026-01-01T08:00:00.000Z';

const worker = (id, full_name, passport) => ({
  id, company_id: C, full_name, is_foreign_worker: true, passport_number: passport, national_id: null,
  phone: null, notes: null, project_name: null, photo_url: null, subcontractor_id: null,
  responsible_manager_id: null, is_crane_operator: false, is_responsible_site_manager: false,
  is_active: true, is_archived: false, created_at: created, updated_at: created,
});
const doc = (worker_id, doc_type, expiry_date) => ({
  id: randomUUID(),
  worker_id, company_id: C, doc_type, file_url: `documents/1700000000000-${doc_type.padEnd(16, '0').slice(0, 16)}.pdf`,
  expiry_date, is_required: true, uploaded_at: created, updated_at: created, created_at: created,
});

const SEED = {
  profiles: [{ id: U, is_active: true, role: 'user', full_name: 'QA' }],
  company_members: [{ id: '44444444-4444-4444-8444-444444444444', user_id: U, company_id: C, role: 'admin', is_active: true }],
  companies: [{ id: C, name: 'Isolated QA', settings: {}, is_active: true, logo_url: null }],
  workers: [worker(W1, NAME1, 'P1000001'), worker(W2, NAME2, 'P1000002')],
  documents: [
    doc(W1, 'id_document', null), doc(W1, 'work_visa', day(300)), doc(W1, 'height_permit', day(300)),
    doc(W2, 'id_document', null), doc(W2, 'work_visa', day(-30)), doc(W2, 'height_permit', day(300)),
  ],
  safety_briefings: [],
};

function sessionCookie() {
  const b64 = (b) => Buffer.from(b).toString('base64url');
  const data = b64(JSON.stringify({ userId: U, email: 'qa@isolated.test', username: 'qa', role: 'user', loginAt: Date.now() }));
  const sig = createHmac('sha256', ENV.SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

// ── 3. Scenario ──────────────────────────────────────────────────
const LABELS = ['פג תוקף', 'עומד לפוג', 'חסר', 'תקין'];
const results = [];
const check = (ok, msg) => { results.push({ ok, msg }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

async function scenario(chromium, mock) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: BASE, serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });
  await context.addCookies([
    { name: 'safedoc_session', value: sessionCookie(), url: BASE },
    { name: 'safedoc_consented', value: '1.1|1.2', url: BASE },
  ]);
  const page = await context.newPage();

  const listStatus = async (name) => {
    const row = page.locator('a', { hasText: name }).first();
    await row.waitFor({ timeout: 20000 });
    const text = await row.innerText();
    return LABELS.find((l) => text.includes(l)) ?? `?(${text})`;
  };
  const card = async (name) => {
    await page.locator('h1', { hasText: name }).waitFor({ timeout: 20000 });
    const header = page.locator('div.rounded-xl', { has: page.locator('h1', { hasText: name }) }).first();
    const text = await header.innerText();
    const banner = page.locator('div.rounded-xl', { has: page.locator('p', { hasText: /דורש טיפול מיידי|דורש מעקב/ }) });
    const issues = (await banner.count()) ? await banner.first().locator('li').allInnerTexts() : [];
    return { status: LABELS.find((l) => text.includes(l)) ?? `?(${text})`, issues: issues.map((s) => s.trim()) };
  };
  const openFromList = async (name) => {
    await page.locator('a', { hasText: name }).first().click();
    await page.locator('h1', { hasText: name }).waitFor({ timeout: 20000 });
  };
  // The list first paints its offline snapshot, then replaces it with GET /api/workers.
  // Wait for that response so the check reads what the server returned.
  const backToList = async () => {
    const fresh = page.waitForResponse((r) => r.url().endsWith('/api/workers') && r.request().method() === 'GET');
    await page.locator('a', { hasText: 'רשימת עובדים' }).first().click();
    await page.waitForURL(/\/workers$/);
    check((await fresh).status() === 200, 'list reloaded its data from /api/workers');
    await page.waitForTimeout(300); // let React render the fetched list
  };
  const completeBriefing = async (workerId) => {
    await page.getByRole('button', { name: /בצע תדריך|עדכן תדריך/ }).click();
    await page.getByRole('button', { name: 'העלאת תדריך קיים' }).click();
    const upload = page.waitForResponse((r) => r.url().endsWith('/api/upload') && r.request().method() === 'POST');
    await page.locator('input[type=file]').last().setInputFiles({
      name: 'briefing.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
    });
    check((await upload).status() === 200, `${workerId === W1 ? 'W1' : 'W2'}: file upload answered 200`);
    await page.getByText('briefing.pdf').waitFor(); // the upload zone shows the uploaded file name
    const save = page.waitForResponse((r) => r.url().endsWith('/api/safety-briefings') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'שמור תדריך' }).click();
    const res = await save;
    const body = await res.json();
    return { status: res.status(), body };
  };

  // Install the Service Worker the way a returning user has it.
  await page.goto('/workers');
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30000 });
  // PwaRegistration reloads the page itself on controllerchange; let that settle first.
  await page.waitForTimeout(1500);
  for (let attempt = 0; ; attempt++) {
    try { await page.goto('/workers'); break; } catch (e) { if (attempt) throw e; await page.waitForTimeout(1500); }
  }
  check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'Service Worker controls the page');

  for (const [id, name, expected, otherIssue] of [
    [W1, NAME1, 'תקין', null],
    [W2, NAME2, 'פג תוקף', 'אשרת עבודה'],
  ]) {
    const tag = id === W1 ? 'W1' : 'W2';
    const before = { list: await listStatus(name) };
    await openFromList(name);
    before.card = await card(name);
    check(before.card.issues.includes('תדריך בטיחות'), `${tag}: before — card lists the missing briefing`);
    check(before.list === before.card.status, `${tag}: before — list (${before.list}) and card (${before.card.status}) agree`);

    // 1. Save: server answer, stored record and stored file
    const saved = await completeBriefing(id);
    check(saved.status === 200, `${tag}: POST /api/safety-briefings answered ${saved.status}`);
    const row = mock.db.safety_briefings.find((b) => b.worker_id === id);
    check(!!row && row.expires_at === `${Number(row.briefed_at.slice(0, 4)) + 1}${row.briefed_at.slice(4)}`,
      `${tag}: briefing stored with expiry one year after ${row?.briefed_at}`);
    check(!!row?.file_url && mock.storage.has(`worker-files/${row.file_url}`), `${tag}: briefing file stored and referenced`);

    // 2. Screen state right after saving
    const now = await card(name);
    check(!now.issues.includes('תדריך בטיחות'), `${tag}: after save — briefing no longer listed as an issue`);
    check(now.status === expected, `${tag}: after save — card shows ${now.status}, expected ${expected}`);

    // 3. Leave, list, re-enter from the list (in-app navigation)
    await backToList();
    const listAfter = await listStatus(name);
    check(listAfter === expected, `${tag}: list after save shows ${listAfter}, expected ${expected}`);
    await openFromList(name);
    const reentered = await card(name);
    check(!reentered.issues.includes('תדריך בטיחות'), `${tag}: re-entered card does not list the briefing (issues: ${reentered.issues.join(', ') || 'none'})`);
    check(reentered.status === listAfter, `${tag}: re-entered card (${reentered.status}) agrees with the list (${listAfter})`);

    // 4. Full reload
    await page.reload();
    const reloaded = await card(name);
    check(!reloaded.issues.includes('תדריך בטיחות') && reloaded.status === expected,
      `${tag}: after full reload card shows ${reloaded.status} and no briefing issue`);

    // 5. Another invalid document keeps counting
    if (otherIssue) {
      check(reloaded.issues.includes(otherIssue), `${tag}: "${otherIssue}" is still listed as an issue`);
    }
    await backToList();
  }

  await browser.close();
}

// ── 4. Run ───────────────────────────────────────────────────────
async function main() {
  if (!SKIP_BUILD) prepareWorkdir();
  if (SW_OVERRIDE) copyFileSync(resolve(SW_OVERRIDE), join(WORKDIR, 'public', 'sw.js'));
  assertNoEnvFiles();

  if (!SKIP_BUILD) {
    // Turbopack refuses a node_modules junction that points outside the project root;
    // webpack accepts it. With a physical node_modules copy the default (Turbopack) is used.
    const linked = lstatSync(join(WORKDIR, 'node_modules')).isSymbolicLink();
    const [cmd, a, o] = next(linked ? ['build', '--webpack'] : ['build']);
    const r = spawnSync(cmd, a, { ...o, stdio: 'inherit' });
    if (r.status !== 0) throw new Error('build failed');
  }

  const mock = createMockSupabase(SEED);
  await mock.listen(MOCK_PORT);
  const [cmd, a, o] = next(['start', '-p', String(APP_PORT), '-H', '127.0.0.1']);
  const app = spawn(cmd, a, { ...o, stdio: ['ignore', 'pipe', 'pipe'] });
  app.stderr.on('data', (d) => process.stderr.write(`[app] ${d}`));
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* starting */ }
      await new Promise((r) => setTimeout(r, 1000));
    }
    const require = createRequire(join(WORKDIR, 'package.json'));
    const { chromium } = require('playwright');
    await scenario(chromium, mock);
  } finally {
    app.kill();
    await mock.close();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed ? `${failed} FAILED` : 'ALL PASSED'} (${results.length} checks)`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
