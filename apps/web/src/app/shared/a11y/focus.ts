import { afterNextRender, Injector } from '@angular/core';

/**
 * Focus a target that only exists once the next render has run, and only while
 * it is still connected. Used by surfaces that appear and take focus together,
 * such as explicit conflict recovery.
 */
export function focusAfterRender(
  injector: Injector,
  target: () => HTMLElement | null | undefined,
): void {
  afterNextRender(
    () => {
      const element = target();
      if (element?.isConnected) {
        element.focus();
      }
    },
    { injector },
  );
}

export function firstFocusable(
  candidates: readonly (HTMLElement | null | undefined)[],
): HTMLElement | null {
  return (
    candidates.find(
      (candidate) =>
        candidate?.isConnected &&
        !(candidate instanceof HTMLButtonElement && candidate.disabled),
    ) ?? null
  );
}
