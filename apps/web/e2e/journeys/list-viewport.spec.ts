import { expect, test, type Page } from '@playwright/test';

/**
 * On a screen with room, a list keeps the shell, its header, filters and
 * pagination in view and scrolls only its rows, under a header that stays put.
 * A phone keeps ordinary page scrolling.
 */
function overflow(page: Page) {
  return page.evaluate(() => {
    const rows = document.querySelector('.viewport-page__body') as HTMLElement;
    return {
      page: document.documentElement.scrollHeight - innerHeight,
      rows: rows.scrollHeight - rows.clientHeight,
    };
  });
}

for (const path of ['/incidents', '/services']) {
  test(`the ${path} rows scroll inside the viewport under a header that stays`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 640 });
    await page.goto(path);
    await expect(page.locator('table tbody tr').first()).toBeVisible();

    const before = await overflow(page);
    expect(before.page).toBeLessThanOrEqual(0);
    expect(before.rows).toBeGreaterThan(0);

    const rows = page.locator('.viewport-page__body');
    await rows.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    const header = page.locator('thead th').first();
    expect(Math.abs((await header.boundingBox())!.y - (await rows.boundingBox())!.y)).toBeLessThanOrEqual(1);
    await expect(page.locator('.shell__banner')).toBeInViewport();
    await expect(page.locator('form.filters')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Next' })).toBeInViewport();

    // A row that focus brings back into view is fully visible, clear of the sticky header.
    const link = page.locator('tbody tr a').nth(1);
    await link.focus();
    const headerBox = (await header.boundingBox())!;
    const rowsBox = (await rows.boundingBox())!;
    const linkBox = (await link.boundingBox())!;
    expect(linkBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);
    expect(linkBox.y + linkBox.height).toBeLessThanOrEqual(rowsBox.y + rowsBox.height + 1);
  });
}

test('a phone keeps ordinary page scrolling for a long list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/incidents');
  await expect(page.locator('table tbody tr').first()).toBeVisible();

  const result = await overflow(page);
  expect(result.page).toBeGreaterThan(0);
  expect(result.rows).toBeLessThanOrEqual(0);
});
