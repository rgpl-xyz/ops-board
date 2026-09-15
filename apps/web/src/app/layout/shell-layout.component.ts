import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Injector,
  runInInjectionContext,
} from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import {
  currentUserQuery,
  organizationQuery,
} from '../data-access';
import { CalloutComponent } from '../shared/ui/callout.component';

@Component({
  selector: 'ob-shell-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    CalloutComponent,
  ],
  templateUrl: './shell-layout.component.html',
  styleUrl: './shell-layout.component.scss',
})
export class ShellLayoutComponent {
  private readonly injector = inject(Injector);

  /** Resolve factories once in an injection context (injectQuery option fns are not). */
  private readonly currentUserOptions = runInInjectionContext(this.injector, () =>
    currentUserQuery(),
  );
  private readonly organizationOptions = runInInjectionContext(
    this.injector,
    () => organizationQuery(),
  );

  protected readonly demoBanner =
    'Demo Environment — data may be periodically reset.';

  protected readonly currentUser = injectQuery(() => this.currentUserOptions);
  protected readonly organization = injectQuery(
    () => this.organizationOptions,
  );
}
