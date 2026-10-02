import { expect, test, type Locator, type Page } from '@playwright/test';

import { provisionIncident } from '../fixtures/api';
import { runName } from '../fixtures/names';

/**
 * On a screen with room, a detail page keeps the shell and its header in view
 * and scrolls one body region; dialogs open in full above it. A phone keeps
 * ordinary page scrolling.
 */
function measure(page: Page) {
  return page.evaluate(() => {
    const body = document.querySelector('.viewport-page__body') as HTMLElement | null;
    const scrollers = [...document.querySelectorAll<HTMLElement>('*')].filter((el) => {
      const overflowY = getComputedStyle(el).overflowY;
      return (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1;
    });
    return {
      page: document.documentElement.scrollHeight - innerHeight,
      body: body ? body.scrollHeight - body.clientHeight : null,
      bodyTop: body?.scrollTop ?? null,
      scrollers: scrollers.length,
    };
  });
}

async function expectFullyInViewport(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

async function paletteTo(page: Page, title: string) {
  await page.getByRole('button', { name: /Command menu/ }).click();
  await page.getByRole('dialog').getByRole('combobox').fill(title);
  await page.getByRole('option', { name: new RegExp(title) }).first().click();
}

test('an incident keeps its header in view, scrolls one body region and opens dialogs in full', async ({
  page,
  request,
}) => {
  const incident = await provisionIncident(request, runName('Contained detail incident'));
  await page.setViewportSize({ width: 1440, height: 640 });
  await page.goto(`/incidents/${incident.id}`);
  await expect(page.locator('#edit-title')).toHaveValue(incident.title);

  const contained = await measure(page);
  expect(contained.page).toBeLessThanOrEqual(0);
  expect(contained.body).toBeGreaterThan(0);
  expect(contained.scrollers).toBe(1);

  const body = page.locator('.viewport-page__body');
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(page.getByRole('heading', { level: 1, name: incident.title })).toBeInViewport();
  await expect(page.locator('.shell__banner')).toBeInViewport();

  // A control further down that focus reaches is scrolled fully into view.
  await body.evaluate((el) => el.scrollTo(0, 0));
  const update = page.locator('#update-body');
  await update.focus();
  const bodyBox = (await body.boundingBox())!;
  const updateBox = (await update.boundingBox())!;
  expect(updateBox.y).toBeGreaterThanOrEqual(bodyBox.y - 1);
  expect(updateBox.y + updateBox.height).toBeLessThanOrEqual(bodyBox.y + bodyBox.height + 1);

  // Dialogs open in the top layer, not clipped by the scrolling body.
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.getByRole('button', { name: 'Resolve…' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toBeVisible();
  await expectFullyInViewport(page, confirm);
  await page.keyboard.press('Escape');
  await expect(confirm).toBeHidden();

  await page.getByRole('button', { name: /Command menu/ }).click();
  const palette = page.getByRole('dialog');
  await expect(palette).toBeVisible();
  await expectFullyInViewport(page, palette);
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
});

test('moving to another incident in place starts at the top with that incident', async ({
  page,
  request,
}) => {
  const first = await provisionIncident(request, runName('Scroll start first'));
  const second = await provisionIncident(request, runName('Scroll start second'));
  await page.setViewportSize({ width: 1440, height: 640 });

  // Visit the second first, so it is cached and the page is reused in place.
  await page.goto(`/incidents/${second.id}`);
  await expect(page.locator('#edit-title')).toHaveValue(second.title);
  await paletteTo(page, first.title);
  await expect(page.locator('#edit-title')).toHaveValue(first.title);

  const body = page.locator('.viewport-page__body');
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  expect((await measure(page)).bodyTop).toBeGreaterThan(0);

  await paletteTo(page, second.title);
  await expect(page).toHaveURL(new RegExp(`/incidents/${second.id}$`));
  await expect(page.getByRole('heading', { level: 1, name: second.title })).toBeVisible();
  await expect(page.locator('#edit-title')).toHaveValue(second.title);
  expect((await measure(page)).bodyTop).toBe(0);
});

test('a service keeps its header in view and scrolls one body region', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 580 });
  await page.goto('/services');
  await page.locator('tbody tr a').first().click();
  await expect(page.locator('#svc-name')).not.toHaveValue('');

  const contained = await measure(page);
  expect(contained.page).toBeLessThanOrEqual(0);
  expect(contained.body).toBeGreaterThan(0);
  expect(contained.scrollers).toBe(1);
  await page.locator('.viewport-page__body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
});

test('a phone keeps ordinary page scrolling on a detail page', async ({ page, request }) => {
  const incident = await provisionIncident(request, runName('Phone detail incident'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/incidents/${incident.id}`);
  await expect(page.locator('#edit-title')).toHaveValue(incident.title);

  const result = await measure(page);
  expect(result.page).toBeGreaterThan(0);
  expect(result.body).toBeLessThanOrEqual(0);
});
