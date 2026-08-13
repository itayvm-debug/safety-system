/**
 * Playwright fixture: authenticated page for vehicles QA tests.
 *
 * Safety guarantees:
 *  - Loads stored auth state (Internal QA) from global-setup.
 *  - Navigates to /vehicles before each test and verifies the active
 *    company is Internal QA (Company B). Aborts if Company A is detected.
 *  - TEST_COMPANY_ID  = Internal QA company ID (read from qa-meta.json)
 *  - TEST_SKIP_COMPANY_ID must differ from TEST_COMPANY_ID
 *
 * Hard abort conditions:
 *  - qa-meta.json missing (global-setup did not run)
 *  - Active company in rendered HTML is not Internal QA
 */

import { test as base, expect, type Browser, type Page } from '@playwright/test';
import { AUTH_STATE_PATH, QA_COMPANY } from '../global-setup';
import { readFileSync } from 'fs';

export type QaMeta = { companyId: string; userId: string };

export function readQaMeta(): QaMeta {
  return JSON.parse(readFileSync('playwright/.auth/qa-meta.json', 'utf-8'));
}

/** Milliseconds-based unique tag for test data isolation. */
export function uid(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

/**
 * Safety gate: verify TEST_COMPANY_ID (from qa-meta) is set and that
 * the active company in the rendered page matches Internal QA.
 * Aborts immediately if either condition fails.
 */
async function verifySafetyGates(page: Page, companyId: string) {
  if (!companyId) {
    throw new Error('[SAFETY ABORT] TEST_COMPANY_ID missing — qa-meta.json not found or malformed.');
  }

  const html = await page.content().catch(() => '');
  if (!html.includes(QA_COMPANY)) {
    throw new Error(
      `[SAFETY ABORT] Active company is NOT "${QA_COMPANY}". ` +
      `Refusing to run vehicle tests against unknown tenant.`,
    );
  }

  // Verify TEST_SKIP_COMPANY_ID (if provided) differs from TEST_COMPANY_ID
  const skipCompanyId = process.env.TEST_SKIP_COMPANY_ID ?? '';
  if (skipCompanyId && skipCompanyId === companyId) {
    throw new Error(
      '[SAFETY ABORT] TEST_SKIP_COMPANY_ID === TEST_COMPANY_ID. ' +
      'These must refer to different companies.',
    );
  }
}

export const test = base.extend<{
  /** Page already authenticated as qa.bot; active company verified as Internal QA. */
  authPage: typeof base.prototype.page;
}>({
  authPage: async ({ browser }: { browser: Browser }, give: (page: Page) => Promise<void>) => {
    // Read Internal QA company ID (= TEST_COMPANY_ID)
    const meta = readQaMeta();
    const companyId = meta.companyId;

    const context = await browser.newContext({
      storageState: AUTH_STATE_PATH,
      locale: 'he-IL',
    });
    const page = await context.newPage();

    // Navigate to vehicles and verify active company
    await page.goto('/vehicles');
    await page.waitForLoadState('networkidle');

    await verifySafetyGates(page, companyId);

    await give(page);
    await context.close();
  },
});

export { expect };
