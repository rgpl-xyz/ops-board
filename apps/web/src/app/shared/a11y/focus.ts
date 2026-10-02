import { afterNextRender, effect, Injector, untracked } from '@angular/core';

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

/**
 * Focus a target now if it is ready, otherwise keep checking briefly. A target
 * can trail the code that wants it: query results reach the view after an
 * awaited fetch, and form controls re-enable a tick after they render.
 */
export function focusWhenRendered(
  target: () => HTMLElement | null | undefined,
  attempts = 10,
): void {
  const element = target();
  if (element?.isConnected && !(element as { disabled?: boolean }).disabled) {
    element.focus();
    return;
  }
  if (attempts > 1) {
    setTimeout(() => focusWhenRendered(target, attempts - 1), 25);
  }
}

/**
 * Once `ready` holds, focus the target as soon as it renders. Query results
 * reach the view after the awaited fetch resolves, so a retry that succeeded
 * waits for its query state rather than for a fixed number of renders.
 */
export function focusWhenReady(
  injector: Injector,
  ready: () => boolean,
  target: () => HTMLElement | null | undefined,
): void {
  const watcher = effect(
    () => {
      if (!ready()) {
        return;
      }
      untracked(() => {
        watcher.destroy();
        focusWhenRendered(target);
      });
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
