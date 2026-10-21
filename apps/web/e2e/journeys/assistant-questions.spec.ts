import { expect, test } from '@playwright/test';

import { provisionIncident } from '../fixtures/api';
import { expectAccessible } from '../fixtures/axe';
import { runName } from '../fixtures/names';

/**
 * Typed questions against the real stack. In Development the API answers
 * with its offline fake provider, which reads a related incident when asked
 * about earlier ones, so the journey exercises the server's lookup and checks
 * without a key or network.
 */

const briefTabName = 'Brief (simulated)';

test('a reader asks about an incident and checks the answers against their sources', async ({ page, request }) => {
  const title = runName('Question incident');
  const incident = await provisionIncident(request, title, 'Card payments fail for EU customers after the 09:40 deploy.');

  await page.goto(`/incidents/${incident.id}`);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await page.getByRole('tab', { name: briefTabName }).click();
  const panel = page.getByRole('tabpanel', { name: briefTabName });
  const question = panel.getByRole('textbox', { name: 'Question' });

  await question.fill('What is the current status?');
  await panel.getByRole('button', { name: 'Ask' }).click();

  const answer = panel.getByRole('article', { name: /^Simulated answer, no AI model/ });
  await expect(answer).toContainText('“What is the current status?”');
  await expect(answer.getByRole('listitem')).toContainText(`${title} is Investigating at High severity`);
  await expect(page.getByRole('status').filter({ hasText: 'Answer ready.' })).toBeAttached();
  await expect(question).toHaveValue('');
  await expectAccessible(page, 'assistant answer');

  await answer.getByRole('button', { name: 'Source I: Incident record' }).click();
  await expect(page.getByRole('dialog', { name: 'Source I' })).toContainText(title);
  await page.keyboard.press('Escape');

  await question.fill('Has this happened before?');
  await panel.getByRole('button', { name: 'Ask' }).click();

  await expect(answer).toContainText('“Has this happened before?”');
  await expect(answer.getByRole('button', { name: 'Source R1: Related incident' }).first()).toBeVisible();
});
