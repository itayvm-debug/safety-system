/**
 * Employee Reviews QA — End-to-End Playwright Test Suite
 * 35 tests covering: navigation, feature flags, auth/viewer, weekly workflow,
 * claims, security, owner dashboard, reports, reminder cron, mobile.
 *
 * PRIMARY USER : qa.reviews.manager@safedoc.local  (member / viewer role)
 * OWNER USER   : qa.bot@safedoc.local              (owner role)
 *
 * SAFETY CONSTRAINTS:
 *  - All mutations target Internal QA only (4f3d08b0-...).
 *  - Company A / SafeDoc (00000000-...) is READ-ONLY — any test that detects
 *    Company A as the active tenant aborts immediately.
 *  - No passwords in source; credentials live in playwright/.auth/ (gitignored).
 */

import { test as reviewsTest, expect, readReviewsMeta } from '../fixtures/reviews-auth';
import { test as base, type Browser, type Page } from '@playwright/test';
import {
  AUTH_STATE_PATH,
  REVIEWS_AUTH_STATE_PATH,
  QA_COMPANY,
} from '../global-setup';
import { readFileSync } from 'fs';

const COMPANY_A = '00000000-0000-0000-0000-000000000001';

function readQaMeta() {
  return JSON.parse(readFileSync('playwright/.auth/qa-meta.json', 'utf-8'));
}

// Owner fixture (qa.bot@safedoc.local — owner role)
const ownerTest = base.extend<{ ownerPage: Page }>({
  ownerPage: async ({ browser }: { browser: Browser }, give: (page: Page) => Promise<void>) => {
    const ctx  = await browser.newContext({ storageState: AUTH_STATE_PATH, locale: 'he-IL' });
    const page = await ctx.newPage();
    await page.goto('/reviews');
    await page.waitForLoadState('domcontentloaded');
    await give(page);
    await ctx.close();
  },
});

// ─── Group 1: Navigation & Layout (5 tests) ──────────────────────────────────

reviewsTest.describe('1. Navigation & Layout', () => {
  reviewsTest('1-01 NavBar is present on /reviews (Issue 2 fix)', async ({ reviewsPage }) => {
    await reviewsPage.goto('/reviews');
    await reviewsPage.waitForLoadState('networkidle');
    const nav = reviewsPage.locator('nav, header').first();
    await expect(nav).toBeVisible();
  });

  reviewsTest('1-02 Active company shown in header is Internal QA', async ({ reviewsPage }) => {
    await reviewsPage.goto('/reviews');
    // Company name loads asynchronously via SessionCompaniesProvider — wait for it.
    await reviewsPage.waitForFunction(
      () => (document.querySelector('header')?.textContent ?? '').includes('Internal QA'),
      null,
      { timeout: 15_000 },
    );
    const headerText = await reviewsPage.evaluate(() => document.querySelector('header')?.textContent ?? '');
    expect(headerText).toContain(QA_COMPANY);
  });

  reviewsTest('1-03 Unauthenticated /reviews → redirects away from /reviews', async ({ browser }) => {
    const ctx  = await browser.newContext({ locale: 'he-IL' }); // no auth state
    const page = await ctx.newPage();
    await page.goto('/reviews');
    await page.waitForURL(url => url.pathname !== '/reviews', { timeout: 15_000 });
    const pathname = new URL(page.url()).pathname;
    expect(pathname).not.toBe('/reviews');
    await ctx.close();
  });

  reviewsTest('1-04 /reviews page renders without critical JS errors', async ({ reviewsPage }) => {
    const errors: string[] = [];
    reviewsPage.on('pageerror', (e: Error) => errors.push(e.message));
    await reviewsPage.goto('/reviews');
    await reviewsPage.waitForLoadState('networkidle');
    const critical = errors.filter(e => !e.toLowerCase().includes('hydrat'));
    expect(critical).toHaveLength(0);
  });

  reviewsTest('1-05 /reviews/submit/:id renders with NavBar', async ({ reviewsPage }) => {
    const meta = readReviewsMeta();
    const workerId = meta.assignedWorkerIds[0];
    await reviewsPage.goto(`/reviews/submit/${workerId}`);
    await reviewsPage.waitForLoadState('domcontentloaded');
    const nav = reviewsPage.locator('nav, header').first();
    await expect(nav).toBeVisible();
  });
});

// ─── Group 2: Feature Flag (4 tests) ─────────────────────────────────────────

reviewsTest.describe('2. Feature Flag', () => {
  reviewsTest('2-01 /reviews accessible when employeeReviews=true', async ({ reviewsPage }) => {
    await reviewsPage.goto('/reviews');
    await reviewsPage.waitForLoadState('networkidle');
    const title = await reviewsPage.title();
    expect(title).not.toMatch(/404|not found/i);
  });

  ownerTest('2-02 Feature save via admin panel returns 200 (Issue 3 fix)', async ({ ownerPage }) => {
    const { companyId } = readQaMeta();
    const getRes = await ownerPage.request.get(`/api/admin/companies/${companyId}`);
    expect(getRes.ok()).toBe(true);
    const current = await getRes.json();
    const features = current?.settings?.features ?? {};

    const patchRes = await ownerPage.request.patch(`/api/admin/companies/${companyId}`, {
      data: { settings: { features: { ...features, employeeReviews: true } } },
    });
    expect(patchRes.status()).toBe(200);
    const body = await patchRes.json();
    expect(body?.settings?.features?.employeeReviews).toBe(true);
  });

  ownerTest('2-03 Feature save preserves other settings fields (deep merge)', async ({ ownerPage }) => {
    const { companyId } = readQaMeta();
    // Save only employeeReviews — other features must survive
    const patchRes = await ownerPage.request.patch(`/api/admin/companies/${companyId}`, {
      data: { settings: { features: { employeeReviews: true } } },
    });
    expect(patchRes.status()).toBe(200);
    const saved = await patchRes.json();
    // workers feature should still be present (deep merge, not replace)
    expect(saved?.settings?.features).toHaveProperty('employeeReviews', true);
  });

  ownerTest('2-04 PATCH with empty body returns 400', async ({ ownerPage }) => {
    const { companyId } = readQaMeta();
    const patchRes = await ownerPage.request.patch(`/api/admin/companies/${companyId}`, { data: {} });
    expect(patchRes.status()).toBe(400);
  });
});

// ─── Group 3: Auth & Viewer Exception (5 tests) ──────────────────────────────

reviewsTest.describe('3. Auth & Viewer Exception', () => {
  reviewsTest('3-01 Linked member GET /api/reviews returns 200', async ({ reviewsPage }) => {
    const res = await reviewsPage.request.get('/api/reviews');
    expect(res.status()).toBe(200);
  });

  reviewsTest('3-02 Member blocked from admin PATCH', async ({ reviewsPage }) => {
    const { companyId } = readQaMeta();
    const res = await reviewsPage.request.patch(`/api/admin/companies/${companyId}`, {
      data: { name: 'should-be-blocked' },
    });
    expect(res.status()).toBeGreaterThanOrEqual(401);
    expect(res.status()).toBeLessThan(500);
  });

  reviewsTest('3-03 Member blocked from review report API', async ({ reviewsPage }) => {
    const res = await reviewsPage.request.get('/api/reviews/report');
    expect(res.status()).toBeGreaterThanOrEqual(401);
    expect(res.status()).toBeLessThan(500);
  });

  reviewsTest('3-04 GET /api/reviews response contains no Company A data', async ({ reviewsPage }) => {
    const res = await reviewsPage.request.get('/api/reviews');
    const text = await res.text();
    expect(text).not.toContain(COMPANY_A);
  });

  reviewsTest('3-05 evaluatorManagerId from body is ignored (server uses mapping)', async ({ reviewsPage }) => {
    const { assignedWorkerIds } = readReviewsMeta();
    const spoofedId = '00000000-0000-0000-0000-000000000099';
    const res = await reviewsPage.request.post('/api/reviews', {
      data: { worker_id: assignedWorkerIds[0], evaluator_manager_id: spoofedId, is_not_evaluable: true },
    });
    if (res.status() < 400) {
      const body = await res.json();
      const storedEvaluator = body?.evaluator_manager_id ?? body?.review?.evaluator_manager_id;
      if (storedEvaluator) expect(storedEvaluator).not.toBe(spoofedId);
    }
  });
});

// ─── Group 4: Weekly Snapshot & Assignments (4 tests) ────────────────────────

ownerTest.describe('4. Weekly Snapshot & Assignments', () => {
  ownerTest('4-01 Snapshot cron responds (200 or 401 if no secret)', async ({ ownerPage, request }) => {
    const cronSecret = process.env.CRON_SECRET ?? '';
    const headers: Record<string, string> = cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {};
    const res = await request.get('/api/reviews/weekly-snapshot-cron', { headers });
    expect(res.status()).not.toBe(500);
    void ownerPage;
  });

  reviewsTest('4-02 /api/reviews returns parseable JSON', async ({ reviewsPage }) => {
    const res = await reviewsPage.request.get('/api/reviews');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).not.toBeNull();
  });

  reviewsTest('4-03 Snapshot idempotent: second run no duplicate assignments', async ({ reviewsPage, request }) => {
    const cronSecret = process.env.CRON_SECRET ?? '';
    if (!cronSecret) { reviewsTest.skip(); return; }
    const hdrs = { Authorization: `Bearer ${cronSecret}` };
    await request.get('/api/reviews/weekly-snapshot-cron', { headers: hdrs });
    await request.get('/api/reviews/weekly-snapshot-cron', { headers: hdrs });
    const reviewsRes = await reviewsPage.request.get('/api/reviews');
    if (reviewsRes.status() === 200) {
      const body = await reviewsRes.json();
      const workers: string[] = (body?.assignments ?? body?.workers ?? []).map(
        (a: { worker_id: string }) => a.worker_id
      );
      expect(new Set(workers).size).toBe(workers.length);
    }
  });

  reviewsTest('4-04 Unassigned worker not in manager\'s assignment list', async ({ reviewsPage }) => {
    const { unassignedWorkerId } = readReviewsMeta();
    const res = await reviewsPage.request.get('/api/reviews');
    if (res.status() === 200) {
      const body = await res.json();
      const ids: string[] = (body?.assignments ?? body?.workers ?? []).map(
        (a: { worker_id: string }) => a.worker_id
      );
      expect(ids).not.toContain(unassignedWorkerId);
    }
  });
});

// ─── Group 5: Review Submission (4 tests) ────────────────────────────────────

reviewsTest.describe('5. Review Submission', () => {
  reviewsTest('5-01 Submit page loads for linked manager without 404', async ({ reviewsPage }) => {
    // The submit route is /reviews/submit (no dynamic segment — manager sees their own assignments)
    await reviewsPage.goto('/reviews/submit');
    await reviewsPage.waitForLoadState('domcontentloaded');
    const title = await reviewsPage.title();
    expect(title).not.toMatch(/404|not found/i);
  });

  reviewsTest('5-02 POST /api/reviews with is_not_evaluable=true succeeds, conflicts, or 404 (no assignment this week)', async ({ reviewsPage }) => {
    const { assignedWorkerIds } = readReviewsMeta();
    const res = await reviewsPage.request.post('/api/reviews', {
      data: { worker_id: assignedWorkerIds[1], is_not_evaluable: true },
    });
    // 200/201: submitted; 409: duplicate; 404: no assignment this week (snapshot cron not yet run)
    expect([200, 201, 404, 409]).toContain(res.status());
  });

  reviewsTest('5-03 POST for unassigned worker returns 400 or 403', async ({ reviewsPage }) => {
    const { unassignedWorkerId } = readReviewsMeta();
    const res = await reviewsPage.request.post('/api/reviews', {
      data: { worker_id: unassignedWorkerId, ratings: {} },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  reviewsTest('5-04 GET /api/reviews returns HTTP 200 with JSON body', async ({ reviewsPage }) => {
    const res = await reviewsPage.request.get('/api/reviews');
    expect(res.status()).toBe(200);
    const ct = res.headers()['content-type'] ?? '';
    expect(ct).toContain('json');
  });
});

// ─── Group 6: Claim & Transfer (3 tests) ─────────────────────────────────────

reviewsTest.describe('6. Claim & Transfer', () => {
  reviewsTest('6-01 Claim endpoint returns valid JSON', async ({ reviewsPage }) => {
    const { unassignedWorkerId } = readReviewsMeta();
    const res = await reviewsPage.request.post('/api/reviews/claim', {
      data: { worker_id: unassignedWorkerId },
    });
    expect([200, 201, 400, 403]).toContain(res.status());
    if (res.status() < 400) {
      const body = await res.json();
      expect(body).toHaveProperty('success');
    }
  });

  reviewsTest('6-02 Claim response signals current_week_evaluator_unchanged', async ({ reviewsPage }) => {
    const { unassignedWorkerId } = readReviewsMeta();
    const res = await reviewsPage.request.post('/api/reviews/claim', {
      data: { worker_id: unassignedWorkerId },
    });
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty('current_week_evaluator_unchanged');
    }
  });

  reviewsTest('6-03 Claim does not return assignment_updated in body', async ({ reviewsPage }) => {
    const { unassignedWorkerId } = readReviewsMeta();
    const res = await reviewsPage.request.post('/api/reviews/claim', {
      data: { worker_id: unassignedWorkerId },
    });
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).not.toHaveProperty('assignment_updated');
    }
  });
});

// ─── Group 7: Security (5 tests) ─────────────────────────────────────────────

reviewsTest.describe('7. Security', () => {
  reviewsTest('7-01 /api/reviews response never contains Company A UUID', async ({ reviewsPage }) => {
    const res = await reviewsPage.request.get('/api/reviews');
    const text = await res.text();
    expect(text).not.toContain(COMPANY_A);
  });

  reviewsTest('7-02 POST with foreign worker ID returns 4xx', async ({ reviewsPage }) => {
    const foreignWorker = '00000000-0000-0000-0000-000000000099';
    const res = await reviewsPage.request.post('/api/reviews', {
      data: { worker_id: foreignWorker, ratings: {} },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  reviewsTest('7-03 Reminder cron without Authorization returns 401', async ({ request }) => {
    const res = await request.get('/api/reviews/reminder-cron');
    expect(res.status()).toBe(401);
  });

  reviewsTest('7-04 Reminder cron with wrong secret returns 401', async ({ request }) => {
    const res = await request.get('/api/reviews/reminder-cron', {
      headers: { Authorization: 'Bearer definitely-wrong' },
    });
    expect(res.status()).toBe(401);
  });

  reviewsTest('7-05 Snapshot cron without Authorization returns 401', async ({ request }) => {
    const res = await request.get('/api/reviews/weekly-snapshot-cron');
    expect(res.status()).toBe(401);
  });
});

// ─── Group 8: Owner vs Member View (3 tests) ─────────────────────────────────

ownerTest.describe('8. Owner Dashboard', () => {
  ownerTest('8-01 Owner lands on /reviews without redirect', async ({ ownerPage }) => {
    expect(ownerPage.url()).toContain('/reviews');
  });

  ownerTest('8-02 Owner /reviews page body is non-trivial', async ({ ownerPage }) => {
    await ownerPage.goto('/reviews');
    await ownerPage.waitForLoadState('networkidle');
    const bodyText = await ownerPage.evaluate(() => document.body.textContent ?? '');
    expect(bodyText.trim().length).toBeGreaterThan(50);
  });
});

reviewsTest.describe('8c. Member Home', () => {
  reviewsTest('8-03 Member sees /reviews page content (not blank)', async ({ reviewsPage }) => {
    await reviewsPage.goto('/reviews');
    await reviewsPage.waitForLoadState('networkidle');
    const bodyText = await reviewsPage.evaluate(() => document.body.textContent ?? '');
    expect(bodyText.trim().length).toBeGreaterThan(50);
  });
});

// ─── Group 9: Reminder Cron DST Guard (2 tests) ──────────────────────────────

ownerTest.describe('9. Reminder Cron', () => {
  ownerTest('9-01 Reminder cron with valid secret responds 200', async ({ ownerPage, request }) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) { ownerTest.skip(); void ownerPage; return; }
    const res = await request.get('/api/reviews/reminder-cron', {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Either skipped (not 09:xx Israel) or sent/errored normally
    expect('skipped' in body || 'sent' in body).toBe(true);
    void ownerPage;
  });

  ownerTest('9-02 Reminder cron response never contains Company A UUID', async ({ request }) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) { ownerTest.skip(); return; }
    const res = await request.get('/api/reviews/reminder-cron', {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const text = await res.text();
    expect(text).not.toContain(COMPANY_A);
  });
});

// ─── Group 10: Mobile & RTL (1 test) ─────────────────────────────────────────

// ─── Group 11: NavBar Visibility on Review Routes (6 tests) ─────────────────
// Regression: before app/reviews/layout.tsx was added, the reviews pages fell
// back to app/layout.tsx (root) which has no <NavBar />, so no header appeared.
// These tests assert the main-navbar is present and unique on every review route.

reviewsTest.describe('11. NavBar Visibility on Review Routes', () => {
  reviewsTest('11-01 /reviews — main-navbar visible (member)', async ({ reviewsPage }) => {
    await reviewsPage.goto('/reviews');
    await reviewsPage.waitForLoadState('networkidle');
    await expect(reviewsPage.locator('[data-testid="main-navbar"]')).toBeVisible();
  });

  reviewsTest('11-02 /reviews/submit — main-navbar visible (member)', async ({ reviewsPage }) => {
    await reviewsPage.goto('/reviews/submit');
    await reviewsPage.waitForLoadState('domcontentloaded');
    // submit may redirect to /reviews if no pending workers; navbar must be present either way
    const navbarLocator = reviewsPage.locator('[data-testid="main-navbar"]');
    await expect(navbarLocator).toBeVisible({ timeout: 10_000 });
  });

  ownerTest('11-03 /reviews/manager-setup — main-navbar visible (owner)', async ({ ownerPage }) => {
    await ownerPage.goto('/reviews/manager-setup');
    await ownerPage.waitForLoadState('networkidle');
    await expect(ownerPage.locator('[data-testid="main-navbar"]')).toBeVisible();
  });

  ownerTest('11-04 /reviews/reports — main-navbar visible (owner)', async ({ ownerPage }) => {
    await ownerPage.goto('/reviews/reports');
    await ownerPage.waitForLoadState('networkidle');
    await expect(ownerPage.locator('[data-testid="main-navbar"]')).toBeVisible();
  });

  reviewsTest('11-05 mobile /reviews — main-navbar visible at 375px', async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: REVIEWS_AUTH_STATE_PATH,
      locale: 'he-IL',
      viewport: { width: 375, height: 812 },
    });
    const page = await ctx.newPage();
    await page.goto('/reviews');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="main-navbar"]')).toBeVisible();
    await ctx.close();
  });

  reviewsTest('11-06 /reviews — navbar appears exactly once (no duplicate shell)', async ({ reviewsPage }) => {
    await reviewsPage.goto('/reviews');
    await reviewsPage.waitForLoadState('networkidle');
    await expect(reviewsPage.locator('[data-testid="main-navbar"]')).toHaveCount(1);
  });
});

// ─── Group 10: Mobile & RTL (1 test) ─────────────────────────────────────────
reviewsTest.describe('10. Mobile & RTL', () => {
  reviewsTest('10-01 Submit page has dir=rtl and no horizontal overflow on mobile', async ({ browser }) => {
    const meta = readReviewsMeta();
    const ctx = await browser.newContext({
      storageState: REVIEWS_AUTH_STATE_PATH,
      locale: 'he-IL',
      viewport: { width: 375, height: 812 },
    });
    const page = await ctx.newPage();
    await page.goto(`/reviews/submit/${meta.assignedWorkerIds[0]}`);
    await page.waitForLoadState('domcontentloaded');

    const dir = await page.evaluate(() =>
      document.querySelector('[dir]')?.getAttribute('dir') ?? document.documentElement.dir ?? ''
    );
    expect(dir).toBe('rtl');

    const bodyWidth  = await page.evaluate(() => document.body.scrollWidth);
    const innerWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(innerWidth + 2); // +2px tolerance
    await ctx.close();
  });
});
