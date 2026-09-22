import { expect, test } from '@playwright/test';

import { provisionIncident } from '../fixtures/api';
import { runName } from '../fixtures/names';

/**
 * Three properties a simulated DOM cannot judge: where focus lands after a real
 * navigation, whether a native dialog truly contains it, and whether a keyboard
 * user can see it. The component specs already assert roles and names, so those
 * are not repeated here.
 */

test('a page change focuses its destination, and an in-page change does not', async ({
  page,
  request,
}) => {
  const incident = await provisionIncident(request, runName('Focus journey incident'));

  await page.goto('/incidents');
  await page.getByPlaceholder('Title contains…').fill(incident.title);
  await page.waitForURL(/[?&]search=/);
  await page.getByRole('link', { name: incident.title }).click();
  await page.waitForURL(/\/incidents\/[0-9a-f-]{36}/);

  // The destination of a lazily loaded route renders after the navigation, so
  // focus arrives shortly after it, not synchronously with the URL change.
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName), { timeout: 5_000 })
    .toBe('H1');
  const focusedText = await page.evaluate(() =>
    document.activeElement?.textContent?.trim(),
  );
  expect(focusedText).toBe(incident.title);
  const markedDestination = await page.evaluate(
    () => document.activeElement?.hasAttribute('data-ob-route-focus') ?? false,
  );
  expect(markedDestination).toBe(true);

  // An in-page change must leave focus where the user put it.
  await page.goto('/incidents');
  const status = page.getByRole('combobox', { name: 'Status' });
  await status.focus();
  await status.selectOption('Investigating');
  await page.waitForURL(/[?&]status=Investigating/);

  const stillOnStatus = await status.evaluate((node) => node === document.activeElement);
  expect(stillOnStatus).toBe(true);
});

test('the confirmation dialog contains focus and cancels on Escape when idle', async ({
  page,
  request,
}) => {
  const incident = await provisionIncident(request, runName('Dialog focus incident'));
  await page.goto(`/incidents/${incident.id}`);

  await page.getByRole('button', { name: /^Resolve/ }).click();
  const dialog = page.locator('dialog.confirm');
  await expect(dialog).toBeVisible();

  const cancelFocused = await page.evaluate(
    () => document.activeElement?.getAttribute('value') === 'cancel',
  );
  expect(cancelFocused).toBe(true);

  // A modal tab cycle passes through the document itself, which is expected.
  // What must never happen is focus reaching a control behind the modal.
  let stopsInside = 0;
  for (let press = 0; press < 8; press++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const open = document.querySelector('dialog.confirm');
      const active = document.activeElement;
      return {
        inside: open !== null && active !== null ? open.contains(active) : false,
        isDocument: active === document.body || active === document.documentElement,
        label: active === null ? 'none' : `${active.tagName.toLowerCase()}`,
      };
    });

    expect(
      stop.inside || stop.isDocument,
      `focus reached ${stop.label} behind the modal after ${press + 1} tab presses`,
    ).toBe(true);
    if (stop.inside) {
      stopsInside++;
    }
  }
  expect(stopsInside, 'the modal never received focus while cycling').toBeGreaterThan(1);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /^Resolve/ })).toBeVisible();
});

test('keyboard focus is visible on the controls a keyboard user reaches', async ({ page }) => {
  await page.goto('/incidents');
  await expect(page.getByRole('heading', { name: 'Incidents', level: 1 })).toBeVisible();

  const seen: string[] = [];
  for (let press = 0; press < 8; press++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (element === null || element === document.body) {
        return null;
      }
      const style = getComputedStyle(element);
      const outlined = style.outlineStyle !== 'none' && style.outlineWidth !== '0px';
      const shadowed = style.boxShadow !== 'none' && style.boxShadow !== '';
      return {
        label: `${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}`,
        visible: outlined || shadowed,
      };
    });

    if (stop === null) {
      continue;
    }
    seen.push(stop.label);
    expect(stop.visible, `no visible focus indicator on ${stop.label}`).toBe(true);
  }

  expect(seen.length, 'the page offered no keyboard stops to check').toBeGreaterThan(2);
});
