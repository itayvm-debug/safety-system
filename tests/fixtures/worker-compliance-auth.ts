/**
 * Playwright fixture: authenticated page for worker-compliance QA tests.
 *
 * Provides `page` already logged in as qa.bot@safedoc.local with
 * Internal QA as the active company.
 */

import { test as base, expect, type Browser, type Page } from '@playwright/test';
import { AUTH_STATE_PATH } from '../global-setup';
import { readFileSync } from 'fs';

export type QaMeta = { companyId: string; userId: string };

export function readQaMeta(): QaMeta {
  return JSON.parse(readFileSync('playwright/.auth/qa-meta.json', 'utf-8'));
}

export function uid(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

export const test = base.extend<{
  authPage: typeof base.prototype.page;
}>({
  authPage: async ({ browser }: { browser: Browser }, give: (page: Page) => Promise<void>) => {
    const context = await browser.newContext({
      storageState: AUTH_STATE_PATH,
      locale: 'he-IL',
    });
    const page = await context.newPage();

    await page.goto('/workers');
    await page.waitForLoadState('networkidle');

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
