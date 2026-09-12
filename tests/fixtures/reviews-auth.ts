/**
 * Playwright fixture: authenticated page for employee-reviews QA tests.
 *
 * Provides `reviewsPage` logged in as qa.reviews.manager@safedoc.local
 * (member/viewer role in Internal QA, linked to a site-manager worker).
 *
 * Safety guard: aborts if the active company is NOT Internal QA.
 * Uses the /api/session/companies API for a reliable company-ID check
 * rather than fragile header-text matching (the app brand "SafeDoc"
 * appears in the NavBar logo even on non-production companies).
 */

import { test as base, expect, type Browser, type Page } from '@playwright/test';
import { REVIEWS_AUTH_STATE_PATH, REVIEWS_META_PATH } from '../global-setup';
import { readFileSync } from 'fs';

const INTERNAL_QA_COMPANY_ID = '4f3d08b0-6317-40bf-8f69-1702c39f9f05';
const COMPANY_A_ID           = '00000000-0000-0000-0000-000000000001';

export interface ReviewsMeta {
  companyId: string;
  mgrUserId: string;
  mgrWorkerId: string;
  assignedWorkerIds: string[];
  unassignedWorkerId: string;
}

export function readReviewsMeta(): ReviewsMeta {
  return JSON.parse(readFileSync(REVIEWS_META_PATH, 'utf-8'));
}

export const test = base.extend<{
  reviewsPage: Page;
}>({
  reviewsPage: async ({ browser }: { browser: Browser }, give: (page: Page) => Promise<void>) => {
    const context = await browser.newContext({
      storageState: REVIEWS_AUTH_STATE_PATH,
      locale: 'he-IL',
    });
    const page = await context.newPage();

    await page.goto('/reviews');
    await page.waitForLoadState('domcontentloaded');

    // Safety: verify active company via API — more reliable than header text,
    // since the app's own brand "SafeDoc" appears in the NavBar logo and
    // the company name may load asynchronously after domcontentloaded.
    const sessionRes = await page.request.get('/api/session/companies');
    if (sessionRes.ok()) {
      const body = await sessionRes.json() as { activeCompanyId?: string };
      const activeId = body?.activeCompanyId;
      if (activeId && activeId !== INTERNAL_QA_COMPANY_ID) {
        await context.close();
        throw new Error(
          `SAFETY ABORT: active company ID is "${activeId}", not Internal QA (${INTERNAL_QA_COMPANY_ID}). ` +
          `Company A (${COMPANY_A_ID}) mutations are forbidden.`
        );
      }
    }

    await give(page);
    await context.close();
  },
});

export { expect };
