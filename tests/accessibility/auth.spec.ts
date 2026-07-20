import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('נגישות: עמוד התחברות', () => {
  test('אין הפרות WCAG 2.1 AA', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('form')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(results.violations, results.violations.map(v => v.id).join(', ')).toHaveLength(0);
  });

  test('שדות טופס עם label מוגדר', async ({ page }) => {
    await page.goto('/login');
    const inputs = page.locator('input:not([type="hidden"])');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const id    = await input.getAttribute('id');
      const aria  = await input.getAttribute('aria-label');
      const placeholder = await input.getAttribute('placeholder');
      expect(id || aria || placeholder, `שדה ${i} ללא זיהוי נגיש`).toBeTruthy();
    }
  });

  test('ניווט מקלדת — Tab עובד בטופס', async ({ page }) => {
    await page.goto('/login');
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => document.activeElement?.tagName?.toLowerCase());
    expect(['input', 'button', 'a']).toContain(first);
  });

  test('RTL ועברית בדף התחברות', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  });
});
