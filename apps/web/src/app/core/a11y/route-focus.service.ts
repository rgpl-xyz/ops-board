import { afterNextRender, Injectable, Injector, inject } from '@angular/core';
import { NavigationEnd, PRIMARY_OUTLET, Router } from '@angular/router';
import { filter } from 'rxjs';

/** Bounded retry window for a destination that renders after its navigation. */
const FOCUS_ATTEMPTS = 20;
const FOCUS_RETRY_MS = 50;

@Injectable({ providedIn: 'root' })
export class RouteFocusService {
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private previousPathname: string | null = null;
  private initialized = false;

  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      )
      .subscribe((event) => this.handleNavigation(event));
  }

  private handleNavigation(event: NavigationEnd): void {
    const pathname = this.primaryPathname(event.urlAfterRedirects);

    if (this.previousPathname === null) {
      this.previousPathname = pathname;
      return;
    }

    if (this.previousPathname === pathname) {
      return;
    }

    this.previousPathname = pathname;
    afterNextRender(() => this.focusDestination(0), {
      injector: this.injector,
    });
  }

  /**
   * A destination can arrive after the navigation that reached it, and can
   * arrive twice: a page showing a loading marker replaces it with its heading
   * once data lands, which drops the focus the first marker held. So this
   * watches briefly rather than trying once.
   *
   * The first attempt belongs to the navigation and focuses the destination
   * outright. Later attempts only rescue focus that no live element holds, so
   * they never take focus from wherever the user has since put it, and the
   * watch stops as soon as the destination itself holds focus.
   */
  private focusDestination(attempt: number): void {
    const target = document.querySelector<HTMLElement>(
      'main [data-ob-route-focus]',
    );

    if (target?.isConnected) {
      if (document.activeElement === target) {
        return;
      }
      if (attempt === 0 || this.focusIsUnclaimed()) {
        target.focus({ preventScroll: false });
      }
    }

    if (attempt >= FOCUS_ATTEMPTS) {
      return;
    }

    setTimeout(() => this.focusDestination(attempt + 1), FOCUS_RETRY_MS);
  }

  private focusIsUnclaimed(): boolean {
    const active = document.activeElement;
    return active === null || active === document.body || !active.isConnected;
  }

  private primaryPathname(url: string): string {
    const urlTree = this.router.parseUrl(url);
    const segments: string[] = [];
    let group = urlTree.root.children[PRIMARY_OUTLET];

    while (group) {
      segments.push(...group.segments.map((segment) => segment.toString()));
      group = group.children[PRIMARY_OUTLET];
    }

    return `/${segments.join('/')}`;
  }
}
