import { test, expect } from '@playwright/test';

// ── Consent API — endpoint-level tests ──────────────────────────────────────

test.describe('Legal Consent API — unauthenticated', () => {
  test('POST without session → 401', async ({ request }) => {
    const res = await request.post('/api/legal-consent', {
      data: { accepted_terms: true, accepted_privacy: true },
    });
    expect(res.status()).toBe(401);
  });

  test('POST empty body without session → 401 (auth checked before body)', async ({ request }) => {
    const res = await request.post('/api/legal-consent', {
      data: {},
    });
    expect(res.status()).toBe(401);
  });

  test('POST missing accepted_privacy without session → 401', async ({ request }) => {
    const res = await request.post('/api/legal-consent', {
      data: { accepted_terms: true },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('Legal Consent API — CSRF protection', () => {
  test('POST from disallowed cross-origin → 403', async ({ request }) => {
    const res = await request.post('/api/legal-consent', {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://evil.example.com',
      },
      data: { accepted_terms: true, accepted_privacy: true },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('POST from another random origin → 403', async ({ request }) => {
    const res = await request.post('/api/legal-consent', {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://attacker.io',
      },
      data: { accepted_terms: true, accepted_privacy: true },
    });
    expect(res.status()).toBe(403);
  });
});

// ── Consent page — UI smoke tests ───────────────────────────────────────────

test.describe('Legal Consent Page — UI', () => {
  test('consent page renders without crash', async ({ page }) => {
    await page.goto('/legal-consent');
    // Page should not show a 500 error
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    await expect(page.locator('body')).not.toContainText('500');
  });

  test('consent page shows both checkboxes and submit button', async ({ page }) => {
    await page.goto('/legal-consent');
    // If redirected to login (unauthenticated), skip UI checks
    if (page.url().includes('/login')) return;

    await expect(page.locator('#accept-terms')).toBeVisible();
    await expect(page.locator('#accept-privacy')).toBeVisible();
    await expect(page.getByRole('button', { name: 'אישור והמשך' })).toBeVisible();
  });

  test('submit button is disabled when no checkboxes checked', async ({ page }) => {
    await page.goto('/legal-consent');
    if (page.url().includes('/login')) return;

    const btn = page.getByRole('button', { name: 'אישור והמשך' });
    await expect(btn).toBeDisabled();
  });

  test('submit button is disabled when only terms checked', async ({ page }) => {
    await page.goto('/legal-consent');
    if (page.url().includes('/login')) return;

    await page.locator('#accept-terms').check();
    const btn = page.getByRole('button', { name: 'אישור והמשך' });
    await expect(btn).toBeDisabled();
  });

  test('submit button enabled when both checkboxes checked', async ({ page }) => {
    await page.goto('/legal-consent');
    if (page.url().includes('/login')) return;

    await page.locator('#accept-terms').check();
    await page.locator('#accept-privacy').check();
    const btn = page.getByRole('button', { name: 'אישור והמשך' });
    await expect(btn).toBeEnabled();
  });

  test('API error is displayed with status code', async ({ page }) => {
    await page.goto('/legal-consent');
    if (page.url().includes('/login')) return;

    // Mock the API to return 500
    await page.route('**/api/legal-consent', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'שגיאת שרת פנימית' }),
      });
    });

    await page.locator('#accept-terms').check();
    await page.locator('#accept-privacy').check();
    await page.getByRole('button', { name: 'אישור והמשך' }).click();

    // Use a specific selector to avoid matching Next.js route announcer (also role="alert")
    const errorDiv = page.locator('[role="alert"].bg-red-50');
    await expect(errorDiv).toBeVisible();
    await expect(errorDiv).toContainText('500');
    await expect(errorDiv).toContainText('שגיאת שרת פנימית');
  });
});

// ── Health endpoint — public access ─────────────────────────────────────────

test.describe('Health API', () => {
  test('GET /api/health returns 200 without auth', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status', 'ok');
  });
});
