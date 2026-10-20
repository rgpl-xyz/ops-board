import { expect, test } from '@playwright/test';

import { provisionIncident } from '../fixtures/api';
import { expectAccessible } from '../fixtures/axe';
import { runName } from '../fixtures/names';

/**
 * Related incidents against the real stack. The journey creates a pair on one
 * service whose titles share two run names, words no other incident has, so
 * each is the other's strongest match whatever earlier runs left behind.
 */
test('a reader sees why another incident is related and follows it', async ({ page, request }) => {
  const shared = `${runName('Related')} ${runName('pair')}`;
  const first = await provisionIncident(request, `${shared} replay`);
  const second = await provisionIncident(request, `${shared} backlog`);

  await page.goto(`/incidents/${first.id}`);
  await expect(page.getByRole('heading', { name: first.title, level: 1 })).toBeVisible();
  await page.getByRole('tab', { name: 'Related' }).click();

  const panel = page.getByRole('tabpanel', { name: 'Related' });
  await expect(panel).toContainText('Picked by fixed rules, not AI');
  const strongest = panel.getByRole('listitem').first();
  await expect(strongest.getByRole('link')).toHaveText(second.title);
  await expect(strongest).toContainText('Same service, and both titles mention “Related”');
  await expect(strongest).toContainText('“pair”');
  await expectAccessible(page, 'related incidents');

  await strongest.getByRole('link', { name: second.title }).click();

  await expect(page.getByRole('heading', { name: second.title, level: 1 })).toBeVisible();
  await expect(panel.getByRole('listitem').first().getByRole('link')).toHaveText(first.title);
});
