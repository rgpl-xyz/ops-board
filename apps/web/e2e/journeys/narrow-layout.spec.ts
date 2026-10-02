import { expect, test } from '@playwright/test';

/**
 * On a phone-width screen every list filter stays reachable: the filter row
 * wraps instead of running off the edge, and keyboard focus never lands on a
 * control outside the screen.
 */
test.use({ viewport: { width: 390, height: 844 } });

for (const path of ['/incidents', '/services']) {
  test(`the ${path} filters fit a phone-width screen`, async ({ page }) => {
    await page.goto(path);
    const filters = page.locator('form.filters');
    await expect(filters).toBeVisible();
    await expect(page.locator('table tbody tr:not(.row--placeholder)').first()).toBeVisible();

    const overflow = await filters.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    const controls = filters.locator('select, input');
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);
    const viewport = page.viewportSize()!;
    for (let i = 0; i < count; i++) {
      const box = (await controls.nth(i).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }

    await controls.first().focus();
    for (let i = 1; i < count; i++) {
      await page.keyboard.press('Tab');
      const focused = page.locator(':focus');
      await expect(focused).toBeVisible();
      const box = (await focused.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
  });
}
