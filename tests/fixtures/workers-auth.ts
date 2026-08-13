/**
 * Playwright fixture: authenticated page for workers QA tests.
 *
 * Provides `page` already logged in as qa.bot@safedoc.local with
 * Internal QA as the active company.
 *
 * Safety guard: aborts any test that detects Company A / SafeDoc
 * as the active tenant.
 */

import { test as base, expect, type Browser, type Page } from '@playwright/test';
import { AUTH_STATE_PATH } from '../global-setup';
import { readFileSync } from 'fs';

export type QaMeta = { companyId: string; userId: string };

export function readQaMeta(): QaMeta {
  return JSON.parse(readFileSync('playwright/.auth/qa-meta.json', 'utf-8'));
}

/** Milliseconds-based unique tag for test data isolation. */
export function uid(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

export const test = base.extend<{
  /** Page already authenticated as qa.bot; active company verified. */
  authPage: typeof base.prototype.page;
}>({
  authPage: async ({ browser }: { browser: Browser }, give: (page: Page) => Promise<void>) => {
    const context = await browser.newContext({
      storageState: AUTH_STATE_PATH,
      locale: 'he-IL',
    });
    const page = await context.newPage();

    // Navigate to workers and wait for the active company name to appear.
    // SessionCompaniesProvider fetches /api/session/companies client-side;
    // waiting for that text proves the fetch completed and enables the safety
    // guard below — without blocking on the slower workers/alerts fetches.
    await page.goto('/workers');
    await page.waitForSelector('text=Internal QA', { timeout: 15_000 });

    // Safety: abort if active company text suggests Company A
    const headerText = await page.locator('header, nav').first().textContent().catch(() => '');
    if (
      headerText &&
      !headerText.includes('Internal QA') &&
      (headerText.includes('SafeDoc') || headerText.includes('Company A'))
    ) {
      await context.close();
      throw new Error(`SAFETY ABORT: Active company appears to be Company A, not Internal QA. Header: "${headerText.slice(0, 100)}"`);
    }

    await give(page);
    await context.close();
  },
});

export { expect };
