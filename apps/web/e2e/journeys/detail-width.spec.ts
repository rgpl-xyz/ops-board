import { expect, test, type Page } from '@playwright/test';

/**
 * On wide screens a detail page's frame spans the main region like the lists,
 * while its forms keep a readable width. Phones keep a single column.
 */
function frame(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const main = document.querySelector('.shell__content') as HTMLElement;
    const style = getComputedStyle(main);
    const available = main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const box = (s: string) => document.querySelector(s)?.getBoundingClientRect();
    return {
      available,
      header: box('.page-header')!.width / available,
      content: box(sel)!.width / available,
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      mainOverflow: main.scrollWidth - main.clientWidth,
    };
  }, selector);
}

async function openFirst(page: Page, list: '/incidents' | '/services') {
  await page.goto(list);
  await page.locator('tbody tr:not(.row--placeholder) a').first().click();
  await expect(page.locator('.viewport-page__body')).toBeVisible();
}

for (const width of [1920, 2560]) {
  test(`at ${width}px an incident spans the main region in two balanced columns`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openFirst(page, '/incidents');
    await expect(page.locator('#edit-title')).toBeVisible();

    const result = await frame(page, '.layout');
    expect(result.header).toBeGreaterThan(0.95);
    expect(result.content).toBeGreaterThan(0.95);
    expect(result.pageOverflow).toBeLessThanOrEqual(0);
    expect(result.mainOverflow).toBeLessThanOrEqual(0);

    const summary = (await page.locator('.area-summary').boundingBox())!;
    const lifecycle = (await page.locator('.area-lifecycle').boundingBox())!;
    expect(lifecycle.x).toBeGreaterThan(summary.x + summary.width);
    expect(summary.width / result.available).toBeGreaterThan(0.45);
    expect(lifecycle.width / result.available).toBeGreaterThan(0.3);

    // Forms keep a readable width instead of stretching across the column.
    const title = (await page.locator('#edit-title').boundingBox())!;
    expect(title.width / result.available).toBeLessThan(0.5);

    // A wider lifecycle column still keeps each select on its Apply button's row.
    for (const [select, apply] of [['#life-sev', 'Apply severity'], ['#life-st', 'Apply status']]) {
      const control = (await page.locator(select).boundingBox())!;
      const button = (await page.getByRole('button', { name: apply }).boundingBox())!;
      expect(Math.abs(control.y + control.height - (button.y + button.height))).toBeLessThanOrEqual(2);
    }
  });

  test(`at ${width}px a service spans the main region and keeps a readable form`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openFirst(page, '/services');
    await expect(page.locator('#svc-name')).toBeVisible();

    const result = await frame(page, '.viewport-page__body');
    expect(result.header).toBeGreaterThan(0.95);
    expect(result.content).toBeGreaterThan(0.95);
    expect(result.pageOverflow).toBeLessThanOrEqual(0);

    const action = (await page.getByRole('link', { name: 'View incidents for this service' }).boundingBox())!;
    const header = (await page.locator('.page-header').boundingBox())!;
    expect(header.x + header.width - (action.x + action.width)).toBeLessThanOrEqual(2);
    const name = (await page.locator('#svc-name').boundingBox())!;
    expect(name.width / result.available).toBeLessThan(0.5);
  });
}

test('a tablet keeps incident detail in two columns without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openFirst(page, '/incidents');
  const result = await frame(page, '.layout');
  expect(result.pageOverflow).toBeLessThanOrEqual(0);
  const summary = (await page.locator('.area-summary').boundingBox())!;
  const lifecycle = (await page.locator('.area-lifecycle').boundingBox())!;
  expect(lifecycle.x).toBeGreaterThan(summary.x + summary.width);
});

test('a phone keeps incident detail in one column without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFirst(page, '/incidents');
  const result = await frame(page, '.layout');
  expect(result.pageOverflow).toBeLessThanOrEqual(0);
  const summary = (await page.locator('.area-summary').boundingBox())!;
  const lifecycle = (await page.locator('.area-lifecycle').boundingBox())!;
  expect(Math.abs(lifecycle.x - summary.x)).toBeLessThanOrEqual(1);
  expect(lifecycle.y).toBeGreaterThan(summary.y);
});
