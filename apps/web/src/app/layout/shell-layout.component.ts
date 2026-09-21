import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  runInInjectionContext,
  viewChild,
} from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import {
  currentUserQuery,
  organizationQuery,
} from '../data-access';
import { IncidentRealtimeConnection } from '../core/realtime/incident-realtime-connection';
import { RouteFocusService } from '../core/a11y/route-focus.service';
import { CalloutComponent } from '../shared/ui/callout.component';
import { CommandPaletteComponent } from './command-palette.component';

const EDITABLE_TARGET_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [contenteditable=""]';

@Component({
  selector: 'ob-shell-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    CalloutComponent,
    CommandPaletteComponent,
  ],
  host: {
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
  templateUrl: './shell-layout.component.html',
  styleUrl: './shell-layout.component.scss',
})
export class ShellLayoutComponent {
  private readonly injector = inject(Injector);
  private readonly realtimeConnection = inject(IncidentRealtimeConnection);
  private readonly routeFocus = inject(RouteFocusService);

  private readonly palette = viewChild.required(CommandPaletteComponent);

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
  protected readonly realtimeStatus = this.realtimeConnection.status;
  protected readonly realtimeStatusText = computed(() => {
    switch (this.realtimeStatus()) {
      case 'connecting':
        return 'Connecting';
      case 'connected':
        return 'Connected';
      case 'reconnecting':
        return 'Reconnecting';
      case 'disconnected':
        return 'Disconnected';
    }
  });

  protected readonly currentUser = injectQuery(() => this.currentUserOptions);
  protected readonly organization = injectQuery(
    () => this.organizationOptions,
  );

  constructor() {
    this.routeFocus.initialize();
  }

  protected openPalette(event: MouseEvent): void {
    this.palette().openFrom(
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
    );
  }

  /**
   * The single app-level palette shortcut. Order matters: the palette's own
   * search field is editable, so the already-open branch runs before the
   * editable-target and other-dialog exclusions.
   */
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') {
      return;
    }

    const palette = this.palette();
    if (palette.isOpen) {
      event.preventDefault();
      palette.openFrom();
      return;
    }

    if (document.querySelector('dialog[open]')) {
      return;
    }

    if (
      event.target instanceof Element &&
      event.target.closest(EDITABLE_TARGET_SELECTOR)
    ) {
      return;
    }

    event.preventDefault();
    palette.openFrom(
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null,
    );
  }
}
