/**
 * NavBar layout regression tests — no item overlap at desktop widths.
 *
 * Regression: "קבלני משנה" (last nav link) and "יצוא" (first action button)
 * visually collided at 1280–1366px for platform-admin users when the production
 * company name was long enough to squeeze the nav container.
 *
 * Fix: logo text moves to 2xl+ only; company name is capped at max-w-[80px] at
 * xl (1280–1535px) and max-w-[150px] at 2xl+. This frees ~125px worst-case at
 * 1280px regardless of company name length.
 *
 * Tests run at the 5 required desktop widths for an authenticated admin user.
 * All adjacent visible navigation items are checked for bounding-box overlap.
 *
 * Safety: uses the `authPage` fixture — all navigation is read-only, no mutations.
 */

import { test, expect } from '../fixtures/workers-auth';

type BBox = { x: number; y: number; width: number; height: number };

const DESKTOP_WIDTHS = [1280, 1366, 1440, 1600, 1920] as const;

const NAV_HREFS = [
  '/issues',
  '/workers',
  '/site-managers',
  '/vehicles',
  '/heavy-equipment',
  '/lifting-equipment',
  '/subcontractors',
] as const;

// tolerance: items that merely touch (0px gap) are not considered overlapping.
// 2px avoids sub-pixel false positives from fractional box coordinates.
function overlaps(a: BBox, b: BBox, tolerance = 2): boolean {
  return (
    a.x + tolerance < b.x + b.width &&
    a.x + a.width > b.x + tolerance &&
    a.y + tolerance < b.y + b.height &&
    a.y + a.height > b.y + tolerance
  );
}

for (const width of DESKTOP_WIDTHS) {
  test(`NB-${width} - no NavBar item overlap at ${width}px viewport (admin user)`, async ({
    authPage: page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.reload();

    // Wait for SessionCompaniesProvider to hydrate. Use DOM textContent so the
    // check passes even when the company name span is CSS-hidden at xl breakpoints.
    await page.waitForFunction(
      () => (document.querySelector('header')?.textContent ?? '').includes('Internal QA'),
      null,
      { timeout: 15_000 },
    );

    // Wait for the isAdmin useEffect to fire and admin elements to be in the
    // layout before measuring. The ··· button is only rendered when isAdmin=true,
    // so its presence guarantees the full admin action bar is laid out.
    await page.locator('[aria-label="עוד אפשרויות"]').waitFor({ state: 'visible', timeout: 10_000 });

    // ── Collect bounding boxes for all 7 nav links (single JS call = atomic) ──
    // Using page.evaluate so all positions come from the same layout snapshot.
    // Sequential boundingBox() calls can straddle a React re-render and report
    // positions from two different layout states (producing false overlaps).
    const rawBoxes = await page.evaluate((hrefs: string[]) => {
      return hrefs.map((href: string) => {
        const el = document.querySelector(`header a[href="${href}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
    }, [...NAV_HREFS] as string[]);

    const navBoxes: BBox[] = [];
    for (let i = 0; i < NAV_HREFS.length; i++) {
      expect(rawBoxes[i], `nav link ${NAV_HREFS[i]} not visible at ${width}px`).not.toBeNull();
      navBoxes.push(rawBoxes[i]!);
    }

    // ── All adjacent nav link pairs must not overlap ──────────────────────────
    for (let i = 0; i < navBoxes.length - 1; i++) {
      const a = navBoxes[i];
      const b = navBoxes[i + 1];
      expect(
        overlaps(a, b),
        `[${width}px] nav items ${NAV_HREFS[i]} (x=${a.x.toFixed(1)},w=${a.width.toFixed(1)},right=${(a.x+a.width).toFixed(1)}) ` +
        `and ${NAV_HREFS[i+1]} (x=${b.x.toFixed(1)},w=${b.width.toFixed(1)},right=${(b.x+b.width).toFixed(1)}) overlap`,
      ).toBe(false);
    }

    // ── Primary regression and action-bar checks (atomic snapshot) ──────────
    const actionRaw = await page.evaluate(() => {
      const exportBtn = Array.from(document.querySelectorAll('header button')).find(
        b => b.textContent?.trim() === 'יצוא',
      );
      const moreBtn = document.querySelector('header button[aria-label="עוד אפשרויות"]');
      const feedbackLink = document.querySelector('header a[href="/submit-feedback"]');
      const toBox = (el: Element | null | undefined) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return { export: toBox(exportBtn), more: toBox(moreBtn), feedback: toBox(feedbackLink) };
    });

    expect(actionRaw.export, `יצוא button not found at ${width}px`).not.toBeNull();
    expect(actionRaw.more, `more-dropdown button not found at ${width}px`).not.toBeNull();
    const subBox = navBoxes[navBoxes.length - 1]; // קבלני משנה = last nav link
    const exportBox = actionRaw.export!;
    const moreBox = actionRaw.more!;

    expect(
      overlaps(subBox, exportBox),
      `[${width}px] קבלני משנה (x=${subBox.x.toFixed(0)}, right=${(subBox.x + subBox.width).toFixed(0)}) ` +
        `overlaps יצוא (x=${exportBox.x.toFixed(0)}, right=${(exportBox.x + exportBox.width).toFixed(0)})`,
    ).toBe(false);

    expect(
      overlaps(subBox, moreBox),
      `[${width}px] קבלני משנה overlaps the more-dropdown (···) button`,
    ).toBe(false);

    expect(
      overlaps(moreBox, exportBox),
      `[${width}px] more-dropdown (···) button overlaps יצוא`,
    ).toBe(false);

    if (actionRaw.feedback) {
      expect(
        overlaps(exportBox, actionRaw.feedback),
        `[${width}px] יצוא overlaps משוב`,
      ).toBe(false);
    }
  });
}
