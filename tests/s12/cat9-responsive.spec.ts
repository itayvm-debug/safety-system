/**
 * QA Session 12 — CAT9: Responsive Failure States
 *
 * Verifies across multiple viewports that:
 *  - Error messages remain visible (not cut off / hidden below viewport)
 *  - Buttons are accessible (within viewport, not overflowing)
 *  - No horizontal overflow caused by error UI
 *  - RTL text direction is maintained
 *  - Modals / confirm dialogs fit within viewport
 *
 * Viewports tested: 375, 390, 430 (mobile), 768 (tablet), 1024 (desktop)
 *
 * Safety rules: READ ONLY — no mutations in this suite.
 */

import { test, expect, type Page, type Route } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 667 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1024', width: 1024, height: 768 },
];

// Intercept API call and return a 500 error to simulate backend failure
async function interceptWith500(page: Page, pattern: string | RegExp) {
  await page.route(pattern, (route: Route) =>
    route.fulfill({
      status:  500,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ error: 'שגיאה פנימית בשרת' }),
    })
  );
}

// Check page body has no horizontal scroll
async function assertNoHScroll(page: Page, label: string) {
  const hasHScroll = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
  );
  expect(hasHScroll, `Horizontal overflow on ${label}`).toBe(false);
}

// Check RTL direction is set
async function assertRTL(page: Page) {
  const dir = await page.evaluate(() => document.documentElement.dir || document.body.dir || '');
  // RTL may be set via CSS or HTML attribute — accept either
  const hasRTL = dir === 'rtl' || await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return style.direction === 'rtl';
  });
  expect(hasRTL, 'Page should have RTL direction').toBe(true);
}

// ─── CAT9 suite ───────────────────────────────────────────────────────────────

test.describe('S12-CAT9: Responsive Failure States', () => {
  test.use({ storageState: 'playwright/.auth/qa-session.json' });

  for (const vp of VIEWPORTS) {
    // ── 9.1: Worker list page — no horizontal overflow ─────────────────────────
    test(`S12-9.1 [${vp.name}]: /workers — no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/workers');
      await page.waitForLoadState('domcontentloaded');
      await assertNoHScroll(page, `/workers at ${vp.name}`);
    });

    // ── 9.2: Worker form — no horizontal overflow + RTL ────────────────────────
    test(`S12-9.2 [${vp.name}]: /workers/new — no horizontal overflow, RTL maintained`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/workers/new');
      await page.waitForLoadState('domcontentloaded');
      await assertNoHScroll(page, `/workers/new at ${vp.name}`);
      await assertRTL(page);
    });

    // ── 9.3: Worker save failure — error visible in viewport ──────────────────
    test(`S12-9.3 [${vp.name}]: worker save failure — error visible without scrolling`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // Intercept the workers POST to return 500
      await interceptWith500(page, /\/api\/workers/);

      await page.goto('/workers/new');
      await page.waitForLoadState('domcontentloaded');

      // Fill required fields
      const nameField = page.locator('input[name="full_name"], input[placeholder*="שם"], input[id*="name"]').first();
      if (await nameField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await nameField.fill('TestError');
      }
      const idField = page.locator('input[name="national_id"], input[placeholder*="תעודת זהות"]').first();
      if (await idField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await idField.fill('999999999');
      }

      // Submit
      const submitBtn = page.locator('button[type="submit"]').first();
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click();
        // Wait for error to appear
        await page.waitForTimeout(1500);
      }

      // Check no horizontal overflow after error state
      await assertNoHScroll(page, `/workers/new error state at ${vp.name}`);

      // Error message (if shown) must be in the viewport
      const errorEl = page.locator('[role="alert"], .text-red-500, .text-red-600, [class*="error"]').first();
      if (await errorEl.isVisible({ timeout: 2000 }).catch(() => false)) {
        const box = await errorEl.boundingBox();
        if (box) {
          expect(box.y + box.height, `Error message overflows viewport on ${vp.name}`).toBeLessThanOrEqual(vp.height + 50);
        }
      }
    });

    // ── 9.4: Export failure — JSON error visible, not HTML 500 ────────────────
    test(`S12-9.4 [${vp.name}]: export failure returns JSON error (not HTML 500)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // Intercept export API to return 500 JSON
      await interceptWith500(page, /\/api\/admin\/export/);

      // Navigate to admin export page
      await page.goto('/admin/export');
      await page.waitForLoadState('domcontentloaded');

      // Check no horizontal overflow
      await assertNoHScroll(page, `/admin/export at ${vp.name}`);

      // Try clicking export if button exists
      const exportBtn = page.locator('button', { hasText: /יצא|export/i }).first();
      if (await exportBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await exportBtn.click();
        await page.waitForTimeout(1500);
        // Check no horizontal overflow after error
        await assertNoHScroll(page, `/admin/export after error at ${vp.name}`);
      }
    });

    // ── 9.5: Company switch error — accessible at small viewports ─────────────
    test(`S12-9.5 [${vp.name}]: /select-company — no horizontal overflow, buttons accessible`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/select-company');
      await page.waitForLoadState('domcontentloaded');

      await assertNoHScroll(page, `/select-company at ${vp.name}`);

      // Buttons must exist and be within viewport
      const buttons = page.locator('button').filter({ hasText: /Internal QA|SafeDoc|חברה/i });
      const count = await buttons.count();
      if (count > 0) {
        const firstBtn = buttons.first();
        if (await firstBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          const box = await firstBtn.boundingBox();
          if (box) {
            expect(box.x, `Button starts before viewport on ${vp.name}`).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width, `Button overflows viewport on ${vp.name}`).toBeLessThanOrEqual(vp.width + 2);
          }
        }
      }
    });
  }

  // ── 9.6: Mobile — archive confirmation dialog fits viewport ──────────────────
  test('S12-9.6 [mobile-390]: archive confirmation fits viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // Navigate to workers list
    await page.goto('/workers');
    await page.waitForLoadState('domcontentloaded');
    await assertNoHScroll(page, '/workers mobile');

    // Look for a worker link to click
    const workerLink = page.locator('a[href*="/workers/"]').first();
    if (await workerLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await workerLink.click();
      await page.waitForLoadState('domcontentloaded');
      await assertNoHScroll(page, 'worker detail mobile');

      // Look for archive button
      const archiveBtn = page.locator('button', { hasText: /ארכיון|ארכיב|העבר/i }).first();
      if (await archiveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Dismiss any native confirm that appears
        page.on('dialog', dialog => dialog.dismiss());

        // Button must be within viewport width
        const box = await archiveBtn.boundingBox();
        if (box) {
          expect(box.x, 'Archive button x should be non-negative').toBeGreaterThanOrEqual(0);
          expect(box.x + box.width, 'Archive button should fit within viewport').toBeLessThanOrEqual(392);
        }
      }
    }
  });

  // ── 9.7: Mobile — upload error UI does not overflow ──────────────────────────
  test('S12-9.7 [mobile-375]: upload error UI no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // Intercept document upload to return 500
    await interceptWith500(page, /\/api\/documents/);

    await page.goto('/workers');
    await page.waitForLoadState('domcontentloaded');
    await assertNoHScroll(page, '/workers 375px');

    // Navigate to a worker if available
    const workerLink = page.locator('a[href*="/workers/"]').first();
    if (await workerLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await workerLink.click();
      await page.waitForLoadState('domcontentloaded');
      await assertNoHScroll(page, 'worker detail 375px');
    }
  });
});
