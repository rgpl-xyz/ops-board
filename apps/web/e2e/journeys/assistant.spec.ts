import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { provisionIncident } from '../fixtures/api';
import { expectAccessible } from '../fixtures/axe';
import { runName } from '../fixtures/names';

/**
 * The brief against the real stack. In Development the API answers with its
 * offline fake provider, so the journey needs no key and no network, and
 * exercises the same server checks a real model's reply goes through. With no
 * model connected, the page names the tab as simulated.
 */

const markup = '<img src=x onerror="window.__injected=1"> **bold** [docs](javascript:alert(1))';
const briefTabName = 'Brief (simulated)';

async function postUpdate(request: APIRequestContext, incidentId: string, body: string): Promise<void> {
  const incident = await (await request.get(`/api/incidents/${incidentId}`)).json();
  const posted = await request.post(`/api/incidents/${incidentId}/updates`, {
    data: { body, expectedLifecycleVersion: incident.lifecycleVersion },
  });
  if (!posted.ok()) {
    throw new Error(`Could not post an update: ${posted.status()} ${await posted.text()}`);
  }
}

async function openBriefTab(page: Page, incidentId: string, title: string) {
  await page.goto(`/incidents/${incidentId}`);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  const briefTab = page.getByRole('tab', { name: briefTabName });
  await briefTab.click();
  return briefTab;
}

test('a reader summarizes an incident and checks a statement against its source', async ({ page, request }) => {
  const title = runName('Assistant incident');
  const incident = await provisionIncident(request, title, 'Card payments fail for EU customers after the 09:40 deploy.');
  await postUpdate(request, incident.id, 'Error rate at 12%; rolling back the 09:40 deploy.');

  const briefTab = await openBriefTab(page, incident.id, title);
  await expect(briefTab).toHaveAttribute('aria-selected', 'true');
  const panel = page.getByRole('tabpanel', { name: briefTabName });
  await expect(panel).toContainText('No AI model is connected here');
  await expectAccessible(page, 'assistant idle');

  await panel.getByRole('button', { name: 'Summarize incident' }).click();

  await expect(panel.getByText('Simulated brief, no AI model (Fake provider)')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Incident brief ready.' })).toBeAttached();
  await expect(panel.getByRole('heading', { level: 3 })).toHaveText([
    'What happened',
    'Current state',
    'Open questions',
    'Suggested next checks',
  ]);
  await expectAccessible(page, 'assistant brief');

  const source = panel.getByRole('button', { name: /^Source T\d+: Written update by / });
  await source.click();
  const card = page.getByRole('dialog', { name: /^Source T\d+$/ });
  await expect(card).toContainText('Error rate at 12%; rolling back the 09:40 deploy.');
  await expectAccessible(page, 'assistant source card');
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(source).toBeFocused();
});

test('the brief and its sources show stored markup as text', async ({ page, request }) => {
  const title = runName('Assistant markup incident');
  const incident = await provisionIncident(request, title);
  await postUpdate(request, incident.id, markup);

  await openBriefTab(page, incident.id, title);
  const panel = page.getByRole('tabpanel', { name: briefTabName });
  await panel.getByRole('button', { name: 'Summarize incident' }).click();

  await expect(panel.locator('.brief')).toContainText(markup);
  await expect(panel.locator('.brief img, .brief a, .brief strong')).toHaveCount(0);
  expect(await page.evaluate(() => (window as { __injected?: number }).__injected)).toBeUndefined();
});

test('a new update makes the brief stale and it can be regenerated', async ({ page, request }) => {
  const title = runName('Assistant stale incident');
  const incident = await provisionIncident(request, title);

  await openBriefTab(page, incident.id, title);
  const panel = page.getByRole('tabpanel', { name: briefTabName });
  await panel.getByRole('button', { name: 'Summarize incident' }).click();
  await expect(panel.locator('.brief')).toBeVisible();
  await expect(panel.getByText('The incident has changed since this brief was written.')).toHaveCount(0);

  // Posted from the page, so the timeline refreshes without waiting on realtime.
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await page.locator('#update-body').fill('Rolled back; error rate falling.');
  await page.getByRole('button', { name: 'Post update' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Timeline' })).toContainText('Rolled back; error rate falling.');

  await page.getByRole('tab', { name: briefTabName }).click();
  await expect(panel.getByText('The incident has changed since this brief was written.')).toBeVisible();
  await panel.getByRole('button', { name: 'Regenerate' }).click();
  await expect(panel.locator('.brief')).toContainText('Rolled back; error rate falling.');
  await expect(panel.getByText('The incident has changed since this brief was written.')).toHaveCount(0);
});

test('the tabs work from the keyboard', async ({ page, request }) => {
  const title = runName('Assistant keyboard incident');
  const incident = await provisionIncident(request, title);
  await page.goto(`/incidents/${incident.id}`);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();

  const timelineTab = page.getByRole('tab', { name: 'Timeline' });
  const briefTab = page.getByRole('tab', { name: briefTabName });
  await timelineTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(briefTab).toBeFocused();
  await expect(briefTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: briefTabName })).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Summarize incident' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.brief')).toBeFocused();
});
