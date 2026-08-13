/**
 * NavBar layout regression tests — no item overlap at desktop widths.
 *
 * Regression: "קבלני משנה" (last nav link) and "יצוא" (first action button)
 * visually collided at 1280–1366px for platform-admin users due to too many
 * shrink-0 action items exceeding the available width.
 *
 * Fix: secondary admin actions (פניות, ארכיון, משתמשי הפלטפורמה, חברות) are
 * collapsed into a "···" overflow dropdown at lg/xl (1024–1535px) and shown
 * inline at 2xl (1536px+).
 *
 * Tests run at the 5 required desktop widths for an authenticated admin user.
 *
 * Safety: uses the `authPage` fixture — all navigation is read-only, no mutations.
 */

import { test, expect } from '../fixtures/workers-auth';

const DESKTOP_WIDTHS = [1280, 1366, 1440, 1600, 1920] as const;

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

for (const width of DESKTOP_WIDTHS) {
  test(`NB-${width} - no NavBar item overlap at ${width}px viewport (admin user)`, async ({
    authPage: page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.reload();
    await page.waitForSelector('text=Internal QA', { timeout: 15_000 });

    // קבלני משנה — last nav link, visually leftmost in RTL desktop nav
    const subBox = await page.locator('a[href="/subcontractors"]').boundingBox();
    expect(subBox, `קבלני משנה link not found at ${width}px`).not.toBeNull();

    // יצוא — first action button, visually rightmost item in RTL desktop actions
    const exportBox = await page.getByRole('button', { name: 'יצוא' }).boundingBox();
    expect(exportBox, `יצוא button not found at ${width}px`).not.toBeNull();

    // Primary regression check: the two formerly-colliding items must not overlap
    expect(
      overlaps(subBox!, exportBox!),
      `[${width}px] קבלני משנה (x=${subBox!.x.toFixed(0)}, right=${(subBox!.x + subBox!.width).toFixed(0)}) ` +
        `overlaps יצוא (x=${exportBox!.x.toFixed(0)}, right=${(exportBox!.x + exportBox!.width).toFixed(0)})`,
    ).toBe(false);

    // At lg/xl (< 2xl = 1536px): overflow "···" button must be visible and not overlap nav
    if (width < 1536) {
      const moreBox = await page
        .getByRole('button', { name: 'עוד אפשרויות' })
        .boundingBox();
      expect(moreBox, `more-dropdown button not found at ${width}px`).not.toBeNull();

      expect(
        overlaps(subBox!, moreBox!),
        `[${width}px] קבלני משנה overlaps the more-dropdown (···) button`,
      ).toBe(false);
    }

    // All 7 nav links must be visible in the desktop header at every desktop width
    const NAV_HREFS = [
      '/issues',
      '/workers',
      '/site-managers',
      '/vehicles',
      '/heavy-equipment',
      '/lifting-equipment',
      '/subcontractors',
    ];
    for (const href of NAV_HREFS) {
      const linkBox = await page.locator(`a[href="${href}"]`).boundingBox();
      expect(linkBox, `nav link ${href} not visible at ${width}px`).not.toBeNull();
    }
  });
}
