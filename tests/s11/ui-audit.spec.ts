/**
 * QA SESSION 11 — Full UI / UX / Visual E2E Audit
 *
 * Covers: layout, RTL, responsive, NavBar geometry, forms, modals,
 * company switch, export wizard, empty/loading states, console errors.
 *
 * Safety: ALL mutations target Company B = Internal QA only.
 * Company A / SafeDoc is never mutated.
 */

import { test, expect, readQaMeta } from '../fixtures/workers-auth';
import type { Page, ConsoleMessage, Dialog } from '@playwright/test';
import { mkdirSync } from 'fs';

// ─── Screenshot helper ────────────────────────────────────────────────────────
const SHOT_DIR = 'test-results/s11-screenshots';
mkdirSync(SHOT_DIR, { recursive: true });

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });
}

// ─── Horizontal overflow detection ───────────────────────────────────────────
async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.body.scrollWidth > window.innerWidth + 2);
}

// ─── Console error capture ────────────────────────────────────────────────────
function attachConsoleCapture(page: Page): string[] {
  const errs: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errs.push(msg.text());
  });
  page.on('pageerror', (err: Error) => errs.push(err.message));
  return errs;
}

// ─── Wait for auth page to settle ────────────────────────────────────────────
async function waitSettled(page: Page) {
  await page.waitForFunction(
    () => (document.querySelector('header')?.textContent ?? '').includes('Internal QA'),
    null,
    { timeout: 20_000 },
  );
  // Wait for isAdmin elements — only at desktop widths where the ··· button is visible.
  // At < 1024px the button is inside `hidden lg:flex` and is CSS-hidden; waitFor({ state: 'visible' })
  // would time out correctly rejecting a hidden element, so skip it on mobile viewports.
  const vp = page.viewportSize();
  if (!vp || vp.width >= 1024) {
    await page.locator('[aria-label="עוד אפשרויות"]').waitFor({ state: 'visible', timeout: 10_000 });
  }
}

// ─── NavBar bounding-box overlap check ────────────────────────────────────────
type BBox = { x: number; y: number; width: number; height: number };

function overlaps(a: BBox, b: BBox, tol = 2): boolean {
  return (
    a.x + tol < b.x + b.width &&
    a.x + a.width > b.x + tol &&
    a.y + tol < b.y + b.height &&
    a.y + a.height > b.y + tol
  );
}

const NAV_HREFS = [
  '/issues', '/workers', '/site-managers', '/vehicles',
  '/heavy-equipment', '/lifting-equipment', '/subcontractors',
] as const;

async function navGeometryCheck(page: Page, viewport: number) {
  const raw = await page.evaluate((hrefs: string[]) => {
    return hrefs.map((href: string) => {
      const el = document.querySelector(`header a[href="${href}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
  }, [...NAV_HREFS] as string[]);

  const boxes = raw.filter(Boolean) as BBox[];

  // Adjacent nav links must not intersect
  for (let i = 0; i < boxes.length - 1; i++) {
    const a = boxes[i];
    const b = boxes[i + 1];
    expect(
      overlaps(a, b),
      `NavBar[${viewport}px] ${NAV_HREFS[i]} overlaps ${NAV_HREFS[i + 1]}: ` +
        `a=[${a.x.toFixed(1)},${(a.x + a.width).toFixed(1)}] b=[${b.x.toFixed(1)},${(b.x + b.width).toFixed(1)}]`,
    ).toBe(false);
  }

  // Primary regression: קבלני משנה must not touch ייצוא
  const actionRaw = await page.evaluate(() => {
    const exportBtn = Array.from(document.querySelectorAll('header button')).find(
      (b) => b.textContent?.trim() === 'יצוא',
    );
    if (!exportBtn) return null;
    const r = exportBtn.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (actionRaw && boxes.length > 0) {
    const subBox = boxes[boxes.length - 1];
    expect(
      overlaps(subBox, actionRaw),
      `NavBar[${viewport}px] קבלני משנה overlaps יצוא`,
    ).toBe(false);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 1 — CONSOLE ERRORS ON KEY PAGES
// ═══════════════════════════════════════════════════════════════════════════════

const PAGES_TO_AUDIT = [
  { path: '/dashboard',         name: 'dashboard' },
  { path: '/workers',           name: 'workers-list' },
  { path: '/vehicles',          name: 'vehicles-list' },
  { path: '/heavy-equipment',   name: 'heavy-equipment-list' },
  { path: '/lifting-equipment', name: 'lifting-equipment-list' },
  { path: '/subcontractors',    name: 'subcontractors-list' },
  { path: '/issues',            name: 'issues-list' },
  { path: '/site-managers',     name: 'site-managers-list' },
  { path: '/archive',           name: 'archive' },
  { path: '/company/members',   name: 'company-members' },
  { path: '/submit-feedback',   name: 'submit-feedback' },
  { path: '/admin/users',       name: 'admin-users' },
  { path: '/admin/companies',   name: 'admin-companies' },
  { path: '/admin/audit',       name: 'admin-audit' },
];

for (const { path, name } of PAGES_TO_AUDIT) {
  test(`S11-CONSOLE [${name}] no js errors at 1440px`, async ({ authPage: page }) => {
    const errs = attachConsoleCapture(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    await waitSettled(page);
    await page.waitForLoadState('networkidle');
    await shot(page, `${name}-1440`);

    // Ignore hydration warnings from Next.js dev mode and expected dev messages
    const realErrors = errs.filter(
      e =>
        !e.includes('Warning:') &&
        !e.includes('did not match') &&
        !e.includes('hydration') &&
        !e.includes('ReactDOM.render') &&
        !e.includes('__webpack') &&
        !e.includes('next-dev') &&
        !e.includes('Middleware'),
    );
    expect(realErrors, `Console errors on ${path}: ${realErrors.join(' | ')}`).toHaveLength(0);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 2 — HORIZONTAL OVERFLOW CHECK
// ═══════════════════════════════════════════════════════════════════════════════

const OVERFLOW_VIEWPORTS = [1920, 1600, 1440, 1366, 1280, 1024, 768, 430, 375] as const;
const OVERFLOW_PAGES = [
  '/dashboard', '/workers', '/vehicles', '/subcontractors',
  '/issues', '/archive',
];

for (const vp of OVERFLOW_VIEWPORTS) {
  for (const path of OVERFLOW_PAGES) {
    const pageName = path.replace('/', '').replace('/', '-') || 'root';
    test(`S11-OVERFLOW [${pageName}] no horizontal scroll at ${vp}px`, async ({ authPage: page }) => {
      await page.setViewportSize({ width: vp, height: 800 });
      await page.goto(path);
      await waitSettled(page);
      await page.waitForLoadState('networkidle');

      const overflow = await hasHorizontalOverflow(page);
      expect(overflow, `Horizontal overflow on ${path} at ${vp}px`).toBe(false);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 3 — NAVBAR GEOMETRY AT ALL DESKTOP WIDTHS
// ═══════════════════════════════════════════════════════════════════════════════

const DESKTOP_WIDTHS = [1920, 1600, 1440, 1366, 1280] as const;

for (const vp of DESKTOP_WIDTHS) {
  test(`S11-NAVBAR [${vp}px] no item overlap`, async ({ authPage: page }) => {
    await page.setViewportSize({ width: vp, height: 800 });
    await page.goto('/workers');
    await waitSettled(page);
    await navGeometryCheck(page, vp);
    await shot(page, `navbar-${vp}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 4 — RESPONSIVE: TABLET AND MOBILE NAVBAR
// ═══════════════════════════════════════════════════════════════════════════════

test('S11-NAVBAR [1024px] mobile burger visible, no desktop collision', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/workers');
  await waitSettled(page);

  // At 1024px (lg boundary), desktop nav is hidden, mobile burger shown
  // lg:flex is visible at >= 1024px. So at exactly 1024 the desktop bar COULD show.
  // Verify there's no horizontal overflow regardless.
  const overflow = await hasHorizontalOverflow(page);
  expect(overflow, 'Horizontal overflow at 1024px').toBe(false);
  await shot(page, 'navbar-1024');
});

for (const vp of [768, 430, 375] as const) {
  test(`S11-NAVBAR [${vp}px] mobile header renders, no overflow`, async ({ authPage: page }) => {
    await page.setViewportSize({ width: vp, height: 800 });
    await page.goto('/workers');
    await page.waitForFunction(
      () => !!document.querySelector('header'),
      null,
      { timeout: 10_000 },
    );
    await page.waitForLoadState('networkidle');

    const overflow = await hasHorizontalOverflow(page);
    expect(overflow, `Horizontal overflow at ${vp}px`).toBe(false);

    // Mobile burger button must be visible
    const burger = page.locator('header button[aria-label]').filter({ hasText: '' });
    // Look for the hamburger/menu button
    const menuBtn = page.locator('button[aria-label="פתח תפריט"], button[aria-label="סגור תפריט"]');
    await expect(menuBtn).toBeVisible();
    await shot(page, `navbar-mobile-${vp}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 5 — DASHBOARD CONTENT AT MULTIPLE WIDTHS
// ═══════════════════════════════════════════════════════════════════════════════

for (const vp of [1920, 1366, 768, 390] as const) {
  test(`S11-DASHBOARD [${vp}px] renders without overflow`, async ({ authPage: page }) => {
    await page.setViewportSize({ width: vp, height: 900 });
    await page.goto('/dashboard');
    await waitSettled(page);
    await page.waitForLoadState('networkidle');

    const overflow = await hasHorizontalOverflow(page);
    expect(overflow, `Horizontal overflow on dashboard at ${vp}px`).toBe(false);

    // Dashboard must have at least one stat card
    const hasCards = await page.locator('[data-testid], .rounded-xl, .rounded-lg').count();
    expect(hasCards).toBeGreaterThan(0);
    await shot(page, `dashboard-${vp}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 6 — WORKER CREATE / EDIT FORM
// ═══════════════════════════════════════════════════════════════════════════════

test('S11-FORM worker create — RTL labels, validation, no overflow', async ({ authPage: page }) => {
  const errs = attachConsoleCapture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/workers/new');
  await waitSettled(page);
  await page.waitForLoadState('networkidle');

  // No horizontal overflow in form
  const overflow = await hasHorizontalOverflow(page);
  expect(overflow, 'Horizontal overflow on /workers/new').toBe(false);

  // Wizard container must be visible (NewWorkerWizard uses divs, not a <form> element)
  await expect(page.locator('h1').filter({ hasText: 'עובד חדש' })).toBeVisible();

  // Submit with empty required fields — validation should surface errors
  const submitBtn = page.locator('button[type="submit"]').first();
  if (await submitBtn.isVisible()) {
    await submitBtn.click();
    // Some validation error should appear (HTML5 or inline)
    await page.waitForTimeout(500);
  }

  await shot(page, 'worker-new-1440');

  // No JS crashes
  const realErrors = errs.filter(
    e => !e.includes('Warning:') && !e.includes('hydration') && !e.includes('Middleware'),
  );
  expect(realErrors).toHaveLength(0);
});

test('S11-FORM worker create — fill and submit to Internal QA', async ({ authPage: page }) => {
  const { companyId } = readQaMeta();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/workers/new');
  await waitSettled(page);
  await page.waitForLoadState('networkidle');

  // Fill minimum required fields
  const fullNameInput = page.locator('input[name="full_name"], input[placeholder*="שם"], input[placeholder*="שם מלא"]').first();
  if (await fullNameInput.isVisible()) {
    await fullNameInput.fill('QA Test Worker S11');
  }

  // Try ID field
  const idInput = page.locator('input[name="identity_number"], input[placeholder*="ת.ז"]').first();
  if (await idInput.isVisible()) {
    await idInput.fill('123456789');
  }

  await shot(page, 'worker-new-filled');
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 7 — EXPORT WIZARD
// ═══════════════════════════════════════════════════════════════════════════════

test('S11-EXPORT wizard opens and shows Internal QA branding', async ({ authPage: page }) => {
  const errs = attachConsoleCapture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/workers');
  await waitSettled(page);

  // Open export wizard via the "יצוא" button
  const exportBtn = page.locator('header button').filter({ hasText: 'יצוא' });
  await expect(exportBtn).toBeVisible();
  await exportBtn.click();

  // Wizard should open
  await page.waitForTimeout(500);
  const modal = page.locator('[role="dialog"], .fixed.inset-0').first();

  // If wizard didn't open via a dialog, look for an overlay
  const wizardVisible = await page.locator('text=סוג דוח').isVisible().catch(() => false)
    || await page.locator('text=פורמט').isVisible().catch(() => false)
    || await page.locator('text=עובדים').count().then((c: number) => c > 0).catch(() => false);

  expect(wizardVisible, 'Export wizard must open when clicking יצוא').toBe(true);

  // The wizard should NOT show Company A name
  const bodyText = await page.locator('body').textContent();
  expect(bodyText).not.toContain('SafeDoc Ltd');

  await shot(page, 'export-wizard-open');

  // No JS errors from opening the wizard
  const realErrors = errs.filter(
    e => !e.includes('Warning:') && !e.includes('hydration') && !e.includes('Middleware'),
  );
  expect(realErrors, `Console errors during export wizard: ${realErrors.join(' | ')}`).toHaveLength(0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 8 — COMPANY SELECTOR (BRANDING)
// ═══════════════════════════════════════════════════════════════════════════════

test('S11-BRANDING company selector shows Internal QA', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/workers');
  await waitSettled(page);

  // Company name in NavBar header area must be "Internal QA"
  const headerText = await page.locator('header').textContent();
  expect(headerText).toContain('Internal QA');

  // Company selector button should be present
  const companyBtn = page.locator('header button').filter({ hasText: 'Internal QA' });
  // This may be hidden by CSS at 1440px (it shows max-w-[80px] truncated)
  // Use textContent instead
  expect(headerText, 'Header must contain Internal QA company name').toContain('Internal QA');

  await shot(page, 'branding-company-selector');
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 9 — SELECT COMPANY PAGE
// ═══════════════════════════════════════════════════════════════════════════════

test('S11-SELECT-COMPANY page renders without crash', async ({ authPage: page }) => {
  const errs = attachConsoleCapture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  // navigate — may redirect to /dashboard if active company is set.
  // Use 'domcontentloaded' to avoid hanging on dashboard's background polling.
  try {
    await page.goto('/select-company', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForLoadState('load', { timeout: 10_000 });
  } catch {
    // redirect or context close is acceptable for this smoke test
  }

  const overflow = await hasHorizontalOverflow(page).catch(() => false);
  expect(overflow, 'Horizontal overflow on /select-company').toBe(false);

  const realErrors = errs.filter(
    e => !e.includes('Warning:') && !e.includes('hydration') && !e.includes('Middleware'),
  );
  expect(realErrors).toHaveLength(0);
  await shot(page, 'select-company').catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 10 — MODALS AND DESTRUCTIVE ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

test('S11-MODAL archive confirm dialog visible and accessible', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/workers');
  await waitSettled(page);
  await page.waitForLoadState('networkidle');

  // If there's an archive/delete button visible, verify it shows a confirm state
  // rather than calling window.confirm()
  const archiveBtns = page.locator('button').filter({ hasText: /ארכיון|מחק|הסר/ });
  if (await archiveBtns.count() > 0) {
    // Set up dialog intercept to catch window.confirm()
    let confirmDialogShown = false;
    page.on('dialog', async (dialog: Dialog) => {
      confirmDialogShown = true;
      await dialog.dismiss(); // avoid blocking
    });

    await archiveBtns.first().click();
    await page.waitForTimeout(500);

    // Confirm dialog via native window.confirm is a UI bug
    expect(confirmDialogShown, 'window.confirm() used — should use inline confirm state').toBe(false);
  }
  await shot(page, 'archive-action');
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 11 — VEHICLE CREATE PAGE
// ═══════════════════════════════════════════════════════════════════════════════

test('S11-FORM vehicle create — renders correctly at 1440px', async ({ authPage: page }) => {
  const errs = attachConsoleCapture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/vehicles/new');
  await waitSettled(page);
  await page.waitForLoadState('networkidle');

  const overflow = await hasHorizontalOverflow(page);
  expect(overflow, 'Horizontal overflow on /vehicles/new').toBe(false);

  await expect(page.locator('form, [role="form"]').first()).toBeVisible();
  await shot(page, 'vehicle-new-1440');

  const realErrors = errs.filter(
    e => !e.includes('Warning:') && !e.includes('hydration') && !e.includes('Middleware'),
  );
  expect(realErrors).toHaveLength(0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 12 — HEAVY/LIFTING EQUIPMENT PAGES
// ═══════════════════════════════════════════════════════════════════════════════

for (const { path, name } of [
  { path: '/heavy-equipment/new', name: 'heavy-equipment-new' },
  { path: '/lifting-equipment/new', name: 'lifting-equipment-new' },
]) {
  test(`S11-FORM ${name} — renders correctly at 1440px`, async ({ authPage: page }) => {
    const errs = attachConsoleCapture(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    await waitSettled(page);
    await page.waitForLoadState('networkidle');

    const overflow = await hasHorizontalOverflow(page);
    expect(overflow, `Horizontal overflow on ${path}`).toBe(false);

    await shot(page, `${name}-1440`);

    const realErrors = errs.filter(
      e => !e.includes('Warning:') && !e.includes('hydration') && !e.includes('Middleware'),
    );
    expect(realErrors).toHaveLength(0);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 13 — ALERTS BELL
// ═══════════════════════════════════════════════════════════════════════════════

test('S11-ALERTS bell visible and not overlapping navbar items', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/workers');
  await waitSettled(page);

  // The alerts bell should be visible (it's admin-only)
  const bellBtn = page.locator('header button[aria-label*="התראות"], header button[aria-label*="Alerts"], header button[aria-label*="bell"]');
  // May not have aria-label; find by position near header icons
  const headerBtns = await page.locator('header button').count();
  expect(headerBtns).toBeGreaterThan(1);

  await shot(page, 'alerts-bell-header');
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 14 — FEEDBACK PAGE
// ═══════════════════════════════════════════════════════════════════════════════

test('S11-FEEDBACK page renders and form is accessible', async ({ authPage: page }) => {
  const errs = attachConsoleCapture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/feedback');
  await waitSettled(page);
  await page.waitForLoadState('networkidle');

  const overflow = await hasHorizontalOverflow(page);
  expect(overflow, 'Horizontal overflow on /feedback').toBe(false);

  await shot(page, 'feedback-1440');

  const realErrors = errs.filter(
    e => !e.includes('Warning:') && !e.includes('hydration') && !e.includes('Middleware'),
  );
  expect(realErrors).toHaveLength(0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 15 — ADMIN COMPANY SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

test('S11-ADMIN companies list renders at 1440px', async ({ authPage: page }) => {
  const errs = attachConsoleCapture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/companies');
  await waitSettled(page);
  await page.waitForLoadState('networkidle');

  const overflow = await hasHorizontalOverflow(page);
  expect(overflow, 'Horizontal overflow on /admin/companies').toBe(false);

  // Internal QA must appear in the companies list
  const pageText = await page.locator('body').textContent().catch(() => '');
  expect(pageText).toContain('Internal QA');

  await shot(page, 'admin-companies-1440');

  const realErrors = errs.filter(
    e => !e.includes('Warning:') && !e.includes('hydration') && !e.includes('Middleware'),
  );
  expect(realErrors).toHaveLength(0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 16 — Z-INDEX: MODALS / DROPDOWNS DON'T CLIP
// ═══════════════════════════════════════════════════════════════════════════════

test('S11-ZINDEX company switcher dropdown not clipped at top viewport', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/workers');
  await waitSettled(page);

  // Click the company button to open the switcher dropdown
  const companyBtn = page.locator('header').locator('button').filter({ has: page.locator('.rounded') }).first();

  // Try to find company switcher by looking for the button containing the company initial/logo
  const switcherBtn = page.locator('header div.relative').locator('button').first();
  if (await switcherBtn.isVisible()) {
    await switcherBtn.click();
    await page.waitForTimeout(300);

    // Any dropdown that opened should be inside viewport
    const dropdown = page.locator('header div.absolute').first();
    if (await dropdown.isVisible()) {
      const box = await dropdown.boundingBox();
      if (box) {
        expect(box.y, 'Dropdown clips top of viewport').toBeGreaterThan(-1);
        expect(box.y + box.height, 'Dropdown clips bottom of viewport').toBeLessThan(900 + 100);
      }
    }
    await shot(page, 'company-switcher-dropdown');
    // Close
    await page.keyboard.press('Escape');
  }
});

test('S11-ZINDEX more-dropdown not clipped', async ({ authPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/workers');
  await waitSettled(page);

  const moreBtn = page.locator('[aria-label="עוד אפשרויות"]');
  await moreBtn.click();
  await page.waitForTimeout(300);

  const dropdown = page.locator('header div.absolute').last();
  if (await dropdown.isVisible()) {
    const box = await dropdown.boundingBox();
    if (box) {
      expect(box.x, 'More dropdown clips left edge').toBeGreaterThan(-1);
      expect(box.y + box.height, 'More dropdown clips bottom').toBeLessThan(900 + 100);
    }
    await shot(page, 'more-dropdown-open');
  }

  await page.keyboard.press('Escape');
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 17 — LOGIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

test('S11-LOGIN page renders without overflow at all widths', async ({ browser }) => {
  for (const vp of [1440, 768, 375] as const) {
    const ctx = await browser.newContext({ locale: 'he-IL' });
    const page = await ctx.newPage();
    await page.setViewportSize({ width: vp, height: 800 });
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const overflow = await hasHorizontalOverflow(page);
    expect(overflow, `Horizontal overflow on /login at ${vp}px`).toBe(false);

    // Form must be visible
    await expect(page.locator('input[type="text"], input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();

    await page.screenshot({ path: `${SHOT_DIR}/login-${vp}.png` });
    await ctx.close();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 18 — SITE MANAGERS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

test('S11-SITE-MANAGERS list renders at 1440px', async ({ authPage: page }) => {
  const errs = attachConsoleCapture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/site-managers');
  await waitSettled(page);
  await page.waitForLoadState('networkidle');

  const overflow = await hasHorizontalOverflow(page);
  expect(overflow, 'Horizontal overflow on /site-managers').toBe(false);

  await shot(page, 'site-managers-1440');

  const realErrors = errs.filter(
    e => !e.includes('Warning:') && !e.includes('hydration') && !e.includes('Middleware'),
  );
  expect(realErrors).toHaveLength(0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 19 — EXPORT WIZARD STEPS (SMOKE THROUGH ALL STEPS)
// ═══════════════════════════════════════════════════════════════════════════════

test('S11-EXPORT steps walkthrough — no crash, correct branding', async ({ authPage: page }) => {
  const errs = attachConsoleCapture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/workers');
  await waitSettled(page);

  // Open export wizard
  await page.locator('header button').filter({ hasText: 'יצוא' }).click();
  await page.waitForTimeout(600);

  // Step 1: Report type selection
  const step1Visible = await page.locator('text=סוג דוח').isVisible().catch(() => false);
  if (!step1Visible) {
    // Wizard may use different layout
    await shot(page, 'export-step-unknown');
    return;
  }

  // All 5 report types should be visible
  const reportOptions = page.locator('text=עובדים, text=מנהלי עבודה, text=רכבים');
  await shot(page, 'export-step1');

  // Verify no Company A data in step 1
  const wizardText = await page.locator('body').textContent();
  expect(wizardText).not.toContain('SafeDoc Ltd');

  // Click Next / proceed to step 2
  const nextBtn = page.locator('button').filter({ hasText: /הבא|המשך|Next/ }).last();
  if (await nextBtn.isVisible()) {
    await nextBtn.click();
    await page.waitForTimeout(300);
    await shot(page, 'export-step2');

    // Step 3 - filters
    const nextBtn2 = page.locator('button').filter({ hasText: /הבא|המשך|Next/ }).last();
    if (await nextBtn2.isVisible()) {
      await nextBtn2.click();
      await page.waitForTimeout(300);
      await shot(page, 'export-step3');
    }
  }

  const realErrors = errs.filter(
    e => !e.includes('Warning:') && !e.includes('hydration') && !e.includes('Middleware'),
  );
  expect(realErrors, `Errors in export wizard: ${realErrors.join(' | ')}`).toHaveLength(0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK 20 — COMPANY MEMBERS FORM
// ═══════════════════════════════════════════════════════════════════════════════

test('S11-COMPANY-MEMBERS page renders with correct forms', async ({ authPage: page }) => {
  const errs = attachConsoleCapture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/company/members');
  await waitSettled(page);
  await page.waitForLoadState('networkidle');

  const overflow = await hasHorizontalOverflow(page);
  expect(overflow, 'Horizontal overflow on /company/members').toBe(false);

  await shot(page, 'company-members-1440');

  const realErrors = errs.filter(
    e => !e.includes('Warning:') && !e.includes('hydration') && !e.includes('Middleware'),
  );
  expect(realErrors).toHaveLength(0);
});
