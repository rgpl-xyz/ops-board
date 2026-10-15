import { expect, test } from '@playwright/test';

import { provisionIncident, provisionService } from '../fixtures/api';
import { expectAccessible } from '../fixtures/axe';
import { runName } from '../fixtures/names';

test('the incident list is accessible', async ({ page }) => {
  await page.goto('/incidents');
  await expect(page.getByRole('heading', { name: 'Incidents', level: 1 })).toBeVisible();
  await expectAccessible(page, 'incidents-list');
});

test('the incident detail is accessible', async ({ page, request }) => {
  const incident = await provisionIncident(request, runName('Axe incident'));
  await page.goto(`/incidents/${incident.id}`);
  await expect(page.getByRole('heading', { name: incident.title, level: 1 })).toBeVisible();
  await expectAccessible(page, 'incident-detail');

  // The details form opens on demand, so it is checked open too.
  await page.getByRole('button', { name: 'Edit details' }).click();
  await expect(page.locator('#edit-title')).toBeFocused();
  await expectAccessible(page, 'incident-detail-editing');
});

test('the incident create form is accessible', async ({ page }) => {
  await page.goto('/incidents/new');
  await expect(page.getByRole('heading', { name: 'Create incident', level: 1 })).toBeVisible();
  await expectAccessible(page, 'incident-create');
});

test('the service list is accessible', async ({ page }) => {
  await page.goto('/services');
  await expect(page.getByRole('heading', { name: 'Services', level: 1 })).toBeVisible();
  await expectAccessible(page, 'services-list');
});

test('the service detail is accessible', async ({ page, request }) => {
  const serviceId = await provisionService(request, runName('Axe service'));
  await page.goto(`/services/${serviceId}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectAccessible(page, 'service-detail');
});

test('the command palette is accessible with results and with none', async ({ page }) => {
  await page.goto('/incidents');
  await page.getByRole('button', { name: /Command menu/ }).click();

  // The filter selects are comboboxes too, so the palette's field is named.
  const search = page.locator('input.palette__search');
  await expect(search).toBeFocused();

  // Scoped to the palette: the filter selects behind the modal contain native
  // options, which carry the same role.
  const options = page.locator('#palette-results [role="option"]');
  await expect(options.first()).toBeVisible();
  await expectAccessible(page, 'palette-open');

  await search.fill('zzzznomatchzzzz');
  await expect(options).toHaveCount(0);
  await expect(page.getByText('No matching commands or records')).toBeVisible();
  await expectAccessible(page, 'palette-no-match');
});
