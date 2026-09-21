import { afterNextRender, Injectable, Injector, inject } from '@angular/core';
import { NavigationEnd, PRIMARY_OUTLET, Router } from '@angular/router';
import { filter } from 'rxjs';

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
    afterNextRender(
      () => {
        const target = document.querySelector<HTMLElement>(
          'main [data-ob-route-focus]',
        );

        if (target?.isConnected) {
          target.focus({ preventScroll: false });
        }
      },
      { injector: this.injector },
    );
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
