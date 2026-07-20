import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PUBLIC_PAGES = [
  { path: '/terms',        name: 'תנאי שימוש' },
  { path: '/privacy',      name: 'מדיניות פרטיות' },
  { path: '/accessibility', name: 'הצהרת נגישות' },
  { path: '/subprocessors', name: 'ספקי משנה' },
  { path: '/data-retention', name: 'שמירת מידע' },
  { path: '/about',        name: 'אודות' },
];

for (const { path, name } of PUBLIC_PAGES) {
  test(`נגישות: ${name} (${path})`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveTitle(/.+/);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(results.violations, `הפרות נגישות ב-${path}: ${
      results.violations.map(v => `${v.id}: ${v.description}`).join('; ')
    }`).toHaveLength(0);
  });

  test(`RTL ושפה: ${name}`, async ({ page }) => {
    await page.goto(path);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'he');
    await expect(html).toHaveAttribute('dir', 'rtl');
  });

  test(`ניווט מקלדת: ${name}`, async ({ page }) => {
    await page.goto(path);
    // All interactive elements should be reachable by Tab
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).not.toBe('BODY');
  });
}

test('אין כפתורים ללא label נגיש בעמוד תנאי שימוש', async ({ page }) => {
  await page.goto('/terms');
  const buttons = page.locator('button');
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const btn = buttons.nth(i);
    const ariaLabel = await btn.getAttribute('aria-label');
    const text = await btn.textContent();
    expect(ariaLabel || text?.trim(), `כפתור ${i} ללא label`).toBeTruthy();
  }
});
