import { InjectionToken } from '@angular/core';

/** Replaced at build time by `ng build --define`; undefined under `ng serve` and in tests. */
declare const OPSBOARD_COMMIT: string | undefined;

/** The full commit this bundle was built from, or `dev` when the build named none. */
export const BUILD_COMMIT = new InjectionToken<string>('BUILD_COMMIT', {
  providedIn: 'root',
  factory: () => (typeof OPSBOARD_COMMIT === 'string' ? OPSBOARD_COMMIT : 'dev'),
});

export interface BuildLabel {
  readonly text: string;
  readonly href: string | null;
}

/** A full commit shows short and links to GitHub; anything else is an unlinked `dev`. */
export function buildLabel(commit: string): BuildLabel {
  return /^[0-9a-f]{40}$/.test(commit)
    ? { text: commit.slice(0, 7), href: `https://github.com/rgpl-xyz/ops-board/commit/${commit}` }
    : { text: 'dev', href: null };
}
