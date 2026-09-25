import { expect, test, type Page } from '@playwright/test';

import { provisionIncident } from '../fixtures/api';
import { runName } from '../fixtures/names';

/**
 * Failure behaviour a visitor could genuinely hit. One specific request is
 * overridden at the network boundary; everything else in the test still reaches
 * the real API, so this is not a parallel mock of the backend.
 */

const problem = (status: number, code: string, detail: string, errors?: Record<string, string[]>) =>
  JSON.stringify({
    type: `urn:opsboard:problem:${code}`,
    title: code === 'validation_failed' ? 'Validation failed' : 'Concurrency conflict',
    status,
    detail,
    code,
    ...(errors ? { errors } : {}),
  });

/** Overrides the next incident save only, and reports when it has fired. */
async function failNextSave(page: Page, body: string, status: number): Promise<void> {
  let used = false;
  await page.route('**/api/incidents/*', async (route) => {
    if (used || route.request().method() !== 'PUT') {
      await route.fallback();
      return;
    }
    used = true;
    await route.fulfill({ status, contentType: 'application/json', body });
  });
}

test('a rejected save explains itself and keeps what was typed', async ({ page, request }) => {
  const incident = await provisionIncident(request, runName('Rejected save incident'));
  await failNextSave(
    page,
    problem(400, 'validation_failed', 'One or more fields are invalid.', {
      title: ['Title is already used by another incident.'],
    }),
    400,
  );

  await page.goto(`/incidents/${incident.id}`);
  const title = page.locator('#edit-title');
  await expect(title).toBeVisible();

  const typed = `${incident.title} edited`;
  await title.fill(typed);
  await page.getByRole('button', { name: 'Save details' }).click();

  await expect(page.locator('#edit-title-error')).toContainText(
    'Title is already used by another incident.',
  );
  await expect(title).toHaveValue(typed);
  expect(await title.evaluate((node) => node === document.activeElement)).toBe(true);

  await page.unroute('**/api/incidents/*');
});

test('a conflicting change offers recovery instead of silently discarding it', async ({
  page,
  request,
}) => {
  const incident = await provisionIncident(request, runName('Conflicting save incident'));
  await failNextSave(
    page,
    problem(409, 'concurrency_conflict', 'This incident changed since you loaded it.'),
    409,
  );

  await page.goto(`/incidents/${incident.id}`);
  const title = page.locator('#edit-title');
  await expect(title).toBeVisible();

  await title.fill(`${incident.title} edited`);
  await page.getByRole('button', { name: 'Save details' }).click();

  const recovery = page.getByRole('alert');
  await expect(recovery).toContainText('changed since you loaded it');
  const dismiss = page.getByRole('button', { name: 'Dismiss and continue editing' });
  await expect(dismiss).toBeVisible();

  // The form shows current server values again and editing can continue.
  await dismiss.click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(title).toBeEnabled();

  await page.unroute('**/api/incidents/*');
});

test('a stale edit is rejected rather than overwriting a change that arrived while typing', async ({
  page,
  request,
}) => {
  const incident = await provisionIncident(request, runName('Concurrent edit incident'));

  await page.goto(`/incidents/${incident.id}`);
  const title = page.locator('#edit-title');
  await expect(title).toBeVisible();
  const typed = `${incident.title} edited`;
  await title.fill(typed);

  // Someone else saves first, through the real API, from the current version.
  const current = await (await request.get(`/api/incidents/${incident.id}`)).json();
  const concurrentDescription = `Changed elsewhere ${runName('description')}`;
  const concurrent = await request.put(`/api/incidents/${incident.id}`, {
    data: {
      title: current.title,
      description: concurrentDescription,
      serviceId: current.serviceId,
      expectedVersion: current.version,
    },
  });
  expect(concurrent.ok()).toBe(true);

  // The realtime refresh reaches the page, and the unsaved edit survives it.
  await expect(page.getByText(concurrentDescription)).toBeVisible();
  await expect(title).toHaveValue(typed);

  const save = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().endsWith(`/api/incidents/${incident.id}`),
  );
  await page.getByRole('button', { name: 'Save details' }).click();
  expect((await save).status()).toBe(409);
  await expect(page.getByRole('alert')).toContainText('changed since you loaded it');

  const stored = await (await request.get(`/api/incidents/${incident.id}`)).json();
  expect(stored.description).toBe(concurrentDescription);
  expect(stored.title).toBe(incident.title);
});
