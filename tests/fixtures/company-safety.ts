/**
 * company-safety.ts — Playwright fixture: production company protection guard
 *
 * Safety contract:
 *   - All mutation E2E tests MUST use the `requireSafeCompanyTarget` fixture.
 *   - If TEST_COMPANY_ID equals TEST_SKIP_COMPANY_ID, the fixture throws and
 *     the test is BLOCKED. This prevents accidentally mutating production data.
 *   - If TEST_COMPANY_ID is not set, the test is skipped (not configured for
 *     this environment).
 *
 * Usage:
 *   import { test, expect } from '../fixtures/company-safety';
 *
 *   test('create worker in Company B', async ({ request, requireSafeCompanyTarget }) => {
 *     const companyId = requireSafeCompanyTarget; // safe UUID, never the skip ID
 *     // ... mutation code ...
 *   });
 *
 * Environment variables:
 *   TEST_COMPANY_ID      — UUID of the dedicated E2E test tenant (Company B)
 *   TEST_SKIP_COMPANY_ID — UUID of the production company that MUST NOT be mutated
 */
import { test as base, expect } from '@playwright/test';

type CompanySafetyFixtures = {
  requireSafeCompanyTarget: string;
};

export const test = base.extend<CompanySafetyFixtures>({
  requireSafeCompanyTarget: async ({}, use, testInfo) => {
    const companyId    = process.env.TEST_COMPANY_ID;
    const skipId       = process.env.TEST_SKIP_COMPANY_ID;

    if (!companyId) {
      testInfo.skip(true, 'TEST_COMPANY_ID not set — mutation E2E tests require a dedicated test tenant');
      // eslint-disable-next-line react-hooks/rules-of-hooks
      await use('');
      return;
    }

    if (skipId && companyId === skipId) {
      // Hard abort: production company protection — do NOT skip silently.
      throw new Error(
        `[company-safety] BLOCKED: TEST_COMPANY_ID "${companyId}" equals ` +
        `TEST_SKIP_COMPANY_ID "${skipId}". ` +
        `Refusing to run mutations against the production company. ` +
        `Set TEST_COMPANY_ID to a dedicated test tenant UUID.`
      );
    }

    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(companyId);
  },
});

export { expect };
