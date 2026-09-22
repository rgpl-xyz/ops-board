import { expect, test } from '@playwright/test';

import { provisionIncident } from '../fixtures/api';
import { runName } from '../fixtures/names';

/**
 * The responder path, against the real stack. The journey provisions the
 * incident it changes, so resolving is not a one-way change to seeded data and
 * the journey gives the same result when run again.
 *
 * Every assertion follows from an action this test performed. Nothing waits on
 * a realtime message, which keeps realtime coverage where it already is.
 */
test('a responder filters to an incident, records an update, and resolves it', async ({
  page,
  request,
}) => {
  const title = runName('Journey incident');
  await provisionIncident(request, title);

  await page.goto('/incidents');
  await page.getByPlaceholder('Title contains…').fill(title);
  // The search field debounces and then commits by navigating, so wait for the
  // committed URL rather than clicking into a list that is about to re-render.
  await page.waitForURL(/[?&]search=/);

  const row = page.getByRole('link', { name: title });
  await expect(row).toBeVisible();
  await row.click();
  await page.waitForURL(/\/incidents\/[0-9a-f-]{36}/);

  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();

  const update = `Narrowed to the payments path ${Date.now().toString(36)}`;
  await page.locator('#update-body').fill(update);
  await page.getByRole('button', { name: 'Post update' }).click();
  await expect(page.getByText(update)).toBeVisible();

  await page.getByRole('button', { name: /^Resolve/ }).click();
  await page.getByRole('button', { name: 'Confirm resolve' }).click();

  await expect(page.getByRole('button', { name: /^Reopen/ })).toBeVisible();
  await expect(page.locator('main')).toContainText('Resolved');
});
