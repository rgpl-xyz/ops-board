import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { provisionIncident, provisionService } from '../fixtures/api';
import { runName } from '../fixtures/names';

interface AcceptedViolation {
  readonly rule: string;
  readonly state: string;
  readonly reason: string;
}

/**
 * Accepted violations are data, not configuration: accepting one is a
 * reviewable diff carrying a reason. Nothing is excluded in the checker's
 * options, so a violation cannot be silenced invisibly.
 */
const accepted: readonly AcceptedViolation[] = JSON.parse(
  readFileSync(join(__dirname, '..', 'a11y-accepted.json'), 'utf8'),
) as AcceptedViolation[];

async function expectAccessible(page: Page, state: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();

  const unaccepted = results.violations.filter(
    (violation) =>
      !accepted.some(
        (entry) => entry.rule === violation.id && entry.state === state,
      ),
  );

  expect(
    unaccepted.map((violation) => ({
      state,
      rule: violation.id,
      impact: violation.impact,
      help: violation.help,
      // Named so a failure says which element, not merely which rule.
      targets: violation.nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([]);
}

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
