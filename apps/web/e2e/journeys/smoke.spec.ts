import { expect, test } from '@playwright/test';

/**
 * Proves the harness: the built frontend, the real API and the seeded database
 * are all answering. A retained assertion, not scaffolding.
 */
test('the incident list renders seeded data through the real stack', async ({ page }) => {
  await page.goto('/incidents');

  await expect(page.getByRole('heading', { name: 'Incidents', level: 1 })).toBeVisible();
  await expect(page.getByText('Demo Environment')).toBeVisible();

  const rows = page.locator('table tbody tr:not(.row--placeholder)');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(0);
});
