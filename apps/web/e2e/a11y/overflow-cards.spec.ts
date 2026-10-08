import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

import { provisionIncident } from '../fixtures/api';
import { expectAccessible } from '../fixtures/axe';
import { runName } from '../fixtures/names';

/**
 * An incident's long description and long responder list fold into cards
 * behind "… more" and "+N more responders". What needs a real browser is the
 * popover behaviour: reaching each button and the card after it by Tab,
 * Escape and a click elsewhere closing a card, focus going back to its button,
 * one card closing the other, and a resting mouse able to cross into a card.
 */

const description = 'Notification sends stalled while a worker leaked pooled connections. '
  .repeat(14)
  .trim();

const responders = ['Ana Reyes', 'Ben Okafor', 'Chloe Martin', 'Dev Patel', 'Eli Novak', 'Fay Lim'].map(
  (displayName, n) => ({
    userId: `00000000-0000-4000-8000-00000000000${n + 1}`,
    displayName,
    joinedAt: `2026-09-10T10:0${n}:00Z`,
  }),
);

/**
 * Joining always acts on the caller, and the stack has a single demo identity,
 * so the API cannot give an incident six responders. This incident's responder
 * read is answered here instead; everything else reaches the real API.
 */
async function openOverflowingIncident(page: Page, request: APIRequestContext) {
  const incident = await provisionIncident(request, runName('Overflow cards incident'), description);
  await page.route(
    (url) => url.pathname === `/api/incidents/${incident.id}/responders`,
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({ json: { items: responders, nextAfter: null } });
    },
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/incidents/${incident.id}`);
  await expect(page.locator('#edit-title')).toHaveValue(incident.title);

  return {
    heading: page.getByRole('heading', { name: incident.title, level: 1 }),
    descriptionMore: page.getByRole('button', { name: 'More of the description' }),
    descriptionCard: page.getByRole('dialog', { name: 'Description' }),
    respondersMore: page.getByRole('button', { name: '+3 more responders' }),
    respondersCard: page.getByRole('dialog', { name: 'Responders' }),
  };
}

/** Reaches the button by Tab, as a keyboard user would, and opens its card with Enter. */
async function openByKeyboard(page: Page, button: Locator, card: Locator): Promise<void> {
  await expect(button).toBeInViewport();
  for (let presses = 0; presses < 80; presses++) {
    if (await button.evaluate((el) => el === document.activeElement)) {
      break;
    }
    await page.keyboard.press('Tab');
  }
  await expect(button).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(card).toBeVisible();
}

/**
 * The next Tab lands in the open card, which sits wholly inside the window,
 * and End from there brings the last of its content into view.
 */
async function expectReadableByKeyboard(page: Page, card: Locator): Promise<void> {
  const body = card.locator('.card__body');
  await page.keyboard.press('Tab');
  await expect(body).toBeFocused();

  await page.keyboard.press('End');
  await expect
    .poll(() =>
      body.evaluate((el) => {
        const view = el.getBoundingClientRect();
        const end = el.lastElementChild!.getBoundingClientRect();
        return {
          cutBelow: Math.max(0, Math.round(end.bottom - view.bottom)),
          cutBeside: Math.max(0, el.scrollWidth - el.clientWidth),
        };
      }),
    )
    .toEqual({ cutBelow: 0, cutBeside: 0 });

  const box = (await card.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

async function closeWithEscape(page: Page, button: Locator, card: Locator): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(button).toBeFocused();
}

test('both overflow cards open from the keyboard, pass axe while open and hand focus back', async ({
  page,
  request,
}) => {
  const ui = await openOverflowingIncident(page, request);

  await openByKeyboard(page, ui.descriptionMore, ui.descriptionCard);
  await expect(ui.descriptionCard).toContainText(description);
  await expectReadableByKeyboard(page, ui.descriptionCard);
  await expectAccessible(page, 'incident-description-card');
  await closeWithEscape(page, ui.descriptionMore, ui.descriptionCard);

  await openByKeyboard(page, ui.respondersMore, ui.respondersCard);
  await expect(ui.respondersCard.getByRole('listitem')).toHaveText(
    responders.map((r) => new RegExp(r.displayName)),
  );
  await expectReadableByKeyboard(page, ui.respondersCard);
  await expectAccessible(page, 'incident-responders-card');
  await closeWithEscape(page, ui.respondersMore, ui.respondersCard);
});

test('opening one overflow card closes the other, and a click elsewhere closes it', async ({
  page,
  request,
}) => {
  const ui = await openOverflowingIncident(page, request);

  await ui.descriptionMore.click();
  await expect(ui.descriptionCard).toBeVisible();

  await ui.respondersMore.focus();
  await page.keyboard.press('Enter');
  await expect(ui.respondersCard).toBeVisible();
  await expect(ui.descriptionCard).toBeHidden();

  await ui.heading.click();
  await expect(ui.respondersCard).toBeHidden();
  await expect(ui.descriptionCard).toBeHidden();
});

test('a resting mouse opens the responder card and can cross into it', async ({ page, request }) => {
  const ui = await openOverflowingIncident(page, request);

  await ui.respondersMore.hover();
  await expect(ui.respondersCard).toBeVisible();
  await ui.respondersCard.hover();
  // Longer than the close delay: the card stays while the pointer is on it.
  await page.waitForTimeout(500);
  await expect(ui.respondersCard).toBeVisible();

  await page.mouse.move(0, 0);
  await expect(ui.respondersCard).toBeHidden();
});
