import { expect, test } from '@playwright/test';

import { provisionService } from '../fixtures/api';
import { runName } from '../fixtures/names';

/**
 * The setup path: raise an incident against a service and find it in the list.
 *
 * The service is created through the API, not the UI, because the application
 * exposes no service-create surface — the service routes are list and detail
 * only. Adding one is product work and out of scope here, so the half of this
 * journey that has a surface is driven through it, and the gap is recorded in
 * the deferred coverage table rather than papered over.
 */
test('an incident is raised against a service through the UI and appears in the list', async ({
  page,
  request,
}) => {
  const serviceName = runName('Journey service');
  await provisionService(request, serviceName);

  const incidentTitle = runName('Journey raised incident');

  await page.goto('/incidents/new');
  await expect(page.getByRole('heading', { name: 'Create incident', level: 1 })).toBeVisible();

  await page.locator('#title').fill(incidentTitle);
  await page.locator('#description').fill('Raised by a browser journey.');
  await page.locator('#serviceId').selectOption({ label: serviceName });
  await page.locator('#severity').selectOption('Medium');
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  // Creating navigates to the new incident's detail page.
  await page.waitForURL(/\/incidents\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { name: incidentTitle, level: 1 })).toBeVisible();
  await expect(page.locator('main')).toContainText(serviceName);

  await page.goto('/incidents');
  await page.getByPlaceholder('Title contains…').fill(incidentTitle);
  await page.waitForURL(/[?&]search=/);

  await expect(page.getByRole('link', { name: incidentTitle })).toBeVisible();
});
