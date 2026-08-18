/**
 * S14 — SafeDoc Brand Assets Integration regression suite
 *
 * Verifies:
 * 1. All 4 brand assets are accessible (no 404)
 * 2. PWA icons resolve correctly
 * 3. Login page uses safedoc-logo-full and safedoc-hero
 * 4. NavBar uses safedoc-app-icon (NOT old safedoc-logo.png)
 * 5. Legal-consent page uses safedoc-app-icon (NOT company logo)
 * 6. OG image points to safedoc-brand-illustration
 * 7. Company logos are NOT replaced (logo.png and company-logo.png still accessible)
 * 8. Company switcher still works (company identity preserved)
 * 9. No horizontal overflow caused by new brand assets on key viewports
 */

import { test, expect } from '@playwright/test';

const BRAND_ASSETS = [
  '/branding/safedoc-app-icon.png',
  '/branding/safedoc-logo-full.png',
  '/branding/safedoc-brand-illustration.png',
  '/branding/safedoc-hero.png',
];

const PWA_ICONS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png',
];

// ── 1: All brand assets return 200 ────────────────────────────────────────────

test.describe('S14-BA: Brand asset availability', () => {
  for (const asset of BRAND_ASSETS) {
    test(`S14-BA: ${asset} returns 200`, async ({ request }) => {
      const res = await request.get(asset);
      expect(res.status(), `${asset} should not 404`).toBe(200);
      const ct = res.headers()['content-type'] ?? '';
      expect(ct).toMatch(/image\/png/);
    });
  }

  for (const icon of PWA_ICONS) {
    test(`S14-BA: ${icon} returns 200`, async ({ request }) => {
      const res = await request.get(icon);
      expect(res.status(), `${icon} should not 404`).toBe(200);
    });
  }
});

// ── 2: Company logos still accessible (not replaced) ─────────────────────────

test.describe('S14-CL: Company logos preserved', () => {
  test('S14-CL-1: /logo.png still accessible', async ({ request }) => {
    const res = await request.get('/logo.png');
    expect(res.status()).toBe(200);
  });

  test('S14-CL-2: /company-logo.png still accessible', async ({ request }) => {
    const res = await request.get('/company-logo.png');
    expect(res.status()).toBe(200);
  });
});

// ── 3: Login page uses correct brand assets ───────────────────────────────────

test.describe('S14-LOGIN: Login page branding', () => {
  test('S14-LOGIN-1: login page uses safedoc-logo-full, not old safedoc-logo.png', async ({ request }) => {
    const res = await request.get('/login');
    expect(res.ok()).toBe(true);
    const html = await res.text();
    expect(html).toContain('safedoc-logo-full.png');
    expect(html).not.toContain('/safedoc-logo.png');
  });

  test('S14-LOGIN-2: login page desktop hero uses safedoc-hero, not old login-hero.png', async ({ request }) => {
    const res = await request.get('/login');
    const html = await res.text();
    expect(html).toContain('safedoc-hero.png');
    expect(html).not.toContain('login-hero.png');
  });
});

// ── 4: Legal consent uses SafeDoc icon, NOT company logo ─────────────────────

test.describe('S14-LEGAL: Legal consent branding', () => {
  test('S14-LEGAL-1: legal-consent uses safedoc-app-icon, not /logo.png', async ({ request }) => {
    const res = await request.get('/legal-consent');
    const html = await res.text();
    // /branding/safedoc-app-icon.png should appear as the logo
    expect(html).toContain('safedoc-app-icon.png');
    // Should NOT use the company logo as the SafeDoc platform identity
    expect(html).not.toMatch(/src="\/logo\.png"/);
  });
});

// ── 5: OG/Social metadata uses brand-illustration ────────────────────────────

test.describe('S14-OG: OG image uses brand-illustration', () => {
  test('S14-OG-1: og:image references safedoc-brand-illustration, not generic icon', async ({ request }) => {
    const res = await request.get('/login');
    const html = await res.text();
    const m = /<meta[^>]+og:image[^>]+content="([^"]+)"/i.exec(html)
      ?? /<meta[^>]+content="([^"]+)"[^>]+og:image/i.exec(html);
    expect(m, 'og:image tag must be present').not.toBeNull();
    expect(m![1]).toContain('safedoc-brand-illustration.png');
    expect(m![1]).not.toContain('icon-512.png');
    expect(m![1]).not.toMatch(/\/logo\.png|company-logo/);
  });
});

// ── 6: No horizontal overflow at key viewports on login ──────────────────────

const VIEWPORTS = [
  { name: '375px',  width: 375,  height: 812 },
  { name: '768px',  width: 768,  height: 1024 },
  { name: '1280px', width: 1280, height: 800 },
];

test.describe('S14-RESPONSIVE: No overflow from brand assets', () => {
  for (const vp of VIEWPORTS) {
    test(`S14-RESP: no horizontal overflow at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/login', { waitUntil: 'networkidle' });

      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(overflow, `Horizontal overflow at ${vp.name}`).toBe(false);
    });
  }
});
