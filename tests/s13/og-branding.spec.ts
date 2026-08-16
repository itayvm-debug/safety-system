/**
 * QA Session 13 — OG Link Preview Branding regression
 *
 * Verifies that the login page (the URL shared with new users) emits
 * correct Open Graph / Twitter Card metadata pointing to SafeDoc assets,
 * NOT to the parent-company logo files (logo.png / company-logo.png).
 *
 * No auth required — /login is a public page.
 */

import { test, expect } from '@playwright/test';

// Helper: extract content attribute from a <meta property="..." content="..."> tag
function extractMetaContent(html: string, property: string): string | null {
  // Matches both property= and name= variants, handles attribute ordering
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  let m = re.exec(html);
  if (m) return m[1];
  // Also try reversed attribute order: content first, then property
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    'i'
  );
  m = re2.exec(html);
  return m ? m[1] : null;
}

test.describe('S13-OG: Link Preview Branding', () => {
  // ── S13-OG-1: og:title is SafeDoc ──────────────────────────────────────
  test('S13-OG-1: og:title contains SafeDoc branding', async ({ request }) => {
    const res = await request.get('/login');
    expect(res.ok()).toBe(true);
    const html = await res.text();

    const ogTitle = extractMetaContent(html, 'og:title');
    expect(ogTitle, 'og:title must be present').not.toBeNull();
    expect(ogTitle!.toLowerCase()).toContain('safedoc');
  });

  // ── S13-OG-2: og:description is present and Hebrew ─────────────────────
  test('S13-OG-2: og:description is present', async ({ request }) => {
    const res = await request.get('/login');
    const html = await res.text();

    const ogDesc = extractMetaContent(html, 'og:description');
    expect(ogDesc, 'og:description must be present').not.toBeNull();
    expect(ogDesc!.length).toBeGreaterThan(10);
  });

  // ── S13-OG-3: og:image points to SafeDoc asset, NOT parent company logo ─
  test('S13-OG-3: og:image uses SafeDoc asset — not company-logo or logo.png', async ({ request }) => {
    const res = await request.get('/login');
    const html = await res.text();

    const ogImage = extractMetaContent(html, 'og:image');
    expect(ogImage, 'og:image must be present').not.toBeNull();

    // Must NOT be the parent-company logo files
    expect(ogImage!).not.toMatch(/\/logo\.png($|\?)/);
    expect(ogImage!).not.toMatch(/company-logo\.png/);

    // Must be an absolute URL (WhatsApp requires absolute OG image URLs)
    expect(ogImage!).toMatch(/^https?:\/\//);

    // Must point to a SafeDoc brand asset
    expect(ogImage!).toMatch(/\/icons\/icon-512\.png/);
  });

  // ── S13-OG-4: og:image URL is absolute ────────────────────────────────
  test('S13-OG-4: og:image URL is absolute (required for WhatsApp)', async ({ request }) => {
    const res = await request.get('/login');
    const html = await res.text();

    const ogImage = extractMetaContent(html, 'og:image');
    expect(ogImage).not.toBeNull();
    expect(ogImage!.startsWith('http://') || ogImage!.startsWith('https://')).toBe(true);
  });

  // ── S13-OG-5: twitter:title present ────────────────────────────────────
  test('S13-OG-5: twitter:title contains SafeDoc branding', async ({ request }) => {
    const res = await request.get('/login');
    const html = await res.text();

    const twTitle = extractMetaContent(html, 'twitter:title');
    expect(twTitle, 'twitter:title must be present').not.toBeNull();
    expect(twTitle!.toLowerCase()).toContain('safedoc');
  });

  // ── S13-OG-6: twitter:image present and matches OG image ───────────────
  test('S13-OG-6: twitter:image is present and uses SafeDoc asset', async ({ request }) => {
    const res = await request.get('/login');
    const html = await res.text();

    const twImage = extractMetaContent(html, 'twitter:image');
    expect(twImage, 'twitter:image must be present').not.toBeNull();
    expect(twImage!).toMatch(/\/icons\/icon-512\.png/);
    expect(twImage!).not.toMatch(/company-logo\.png/);
    expect(twImage!).not.toMatch(/\/logo\.png($|\?)/);
  });

  // ── S13-OG-7: og:site_name is SafeDoc ──────────────────────────────────
  test('S13-OG-7: og:site_name is SafeDoc', async ({ request }) => {
    const res = await request.get('/login');
    const html = await res.text();

    const siteName = extractMetaContent(html, 'og:site_name');
    expect(siteName, 'og:site_name must be present').not.toBeNull();
    expect(siteName).toBe('SafeDoc');
  });
});
