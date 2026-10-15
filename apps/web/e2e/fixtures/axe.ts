import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

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

export async function expectAccessible(page: Page, state: string): Promise<void> {
  await animationsSettled(page);
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

/**
 * Route content fades in from transparent, and a heading counts as visible
 * from the first frame, so axe would otherwise measure contrast through the
 * fade. Endless animations, such as loading placeholders, are not waited for.
 */
async function animationsSettled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
  });
}
