import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  runInInjectionContext,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';

import {
  currentUserQuery,
  incidentsQuery,
  servicesQuery,
} from '../data-access';
import { canCreateIncident } from '../features/incidents/utils/incident-actions';

/** Dismissal restores the invoker; navigation deliberately suppresses restoration. */
export type PaletteCloseReason = 'dismiss' | 'navigate';

type PaletteGroup = 'commands' | 'incidents' | 'services';

type PaletteKind = 'navigate' | 'create-incident' | 'incident' | 'service';

/** Display-only rows. Entity payloads stay in Query; nothing here is cached. */
interface PaletteResult {
  key: string;
  optionId: string;
  group: PaletteGroup;
  label: string;
  detail: string | null;
  kind: PaletteKind;
  enabled: boolean;
  route: readonly string[];
}

const ENTITY_TERM_MIN = 2;
const ENTITY_PAGE_SIZE = 5;
const SEARCH_DEBOUNCE_MS = 250;

const GROUP_HEADINGS: readonly (readonly [PaletteGroup, string])[] = [
  ['commands', 'Commands'],
  ['incidents', 'Incidents'],
  ['services', 'Services'],
];

function result(
  key: string,
  group: PaletteGroup,
  label: string,
  detail: string | null,
  kind: PaletteKind,
  route: readonly string[],
): PaletteResult {
  return {
    key,
    optionId: `palette-option-${key.replace(':', '-')}`,
    group,
    label,
    detail,
    kind,
    enabled: true,
    route,
  };
}

@Component({
  selector: 'ob-command-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './command-palette.component.html',
  styleUrl: './command-palette.component.scss',
})
export class CommandPaletteComponent {
  private readonly injector = inject(Injector);

  private readonly dialogRef =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly searchRef =
    viewChild.required<ElementRef<HTMLInputElement>>('search');

  protected readonly open = signal(false);
  protected readonly rawQuery = signal('');
  private readonly activeIndexRaw = signal(0);

  private invoker: HTMLElement | null = null;
  private closingForNavigation = false;

  private readonly trimmedQuery = computed(() => this.rawQuery().trim());

  /** Only debounced, trimmed text reaches the server. */
  private readonly deferredTerm = toSignal(
    toObservable(this.rawQuery).pipe(
      map((value) => value.trim()),
      debounceTime(SEARCH_DEBOUNCE_MS),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );

  private readonly entityTerm = computed(() => {
    const term = this.deferredTerm();
    return term.length >= ENTITY_TERM_MIN ? term : '';
  });

  /** Newer text is pending, so earlier rows must not read as current matches. */
  protected readonly termPending = computed(
    () => this.trimmedQuery() !== this.deferredTerm(),
  );

  private readonly currentUserOptions = runInInjectionContext(
    this.injector,
    () => currentUserQuery(),
  );

  private readonly incidentsOptions = computed(() => {
    const term = this.entityTerm();
    const enabled = term !== '' && this.open();
    return runInInjectionContext(this.injector, () => ({
      ...incidentsQuery({ search: term, page: 1, pageSize: ENTITY_PAGE_SIZE }),
      enabled,
    }));
  });

  private readonly servicesOptions = computed(() => {
    const term = this.entityTerm();
    const enabled = term !== '' && this.open();
    return runInInjectionContext(this.injector, () => ({
      ...servicesQuery({
        search: term,
        page: 1,
        pageSize: ENTITY_PAGE_SIZE,
        sort: 'name',
      }),
      enabled,
    }));
  });

  private readonly currentUser = injectQuery(() => this.currentUserOptions);
  private readonly incidents = injectQuery(() => this.incidentsOptions());
  private readonly services = injectQuery(() => this.servicesOptions());

  private readonly commandRows = computed<PaletteResult[]>(() => {
    const user = this.currentUser.data();
    const rows = [
      result(
        'command:incidents',
        'commands',
        'Go to Incidents',
        null,
        'navigate',
        ['/incidents'],
      ),
      result(
        'command:services',
        'commands',
        'Go to Services',
        null,
        'navigate',
        ['/services'],
      ),
    ];

    if (user && canCreateIncident(user.role)) {
      rows.push(
        result(
          'command:create',
          'commands',
          'Create incident',
          null,
          'create-incident',
          ['/incidents', 'new'],
        ),
      );
    }

    const needle = this.trimmedQuery().toLowerCase();
    return needle === ''
      ? rows
      : rows.filter((row) => row.label.toLowerCase().includes(needle));
  });

  private readonly incidentRows = computed<PaletteResult[]>(() => {
    if (this.entityTerm() === '' || this.termPending()) {
      return [];
    }

    return (this.incidents.data()?.items ?? []).map((incident) =>
      result(
        `incident:${incident.id}`,
        'incidents',
        incident.title,
        `${incident.status} · ${incident.serviceName}`,
        'incident',
        ['/incidents', incident.id],
      ),
    );
  });

  private readonly serviceRows = computed<PaletteResult[]>(() => {
    if (this.entityTerm() === '' || this.termPending()) {
      return [];
    }

    return (this.services.data()?.items ?? []).map((service) =>
      result(
        `service:${service.id}`,
        'services',
        service.name,
        `${service.health} · ${service.teamName}`,
        'service',
        ['/services', service.id],
      ),
    );
  });

  protected readonly results = computed<PaletteResult[]>(() => [
    ...this.commandRows(),
    ...this.incidentRows(),
    ...this.serviceRows(),
  ]);

  private readonly enabledResults = computed(() =>
    this.results().filter((row) => row.enabled),
  );

  protected readonly sections = computed(() => {
    const rows = this.results();
    return GROUP_HEADINGS.map(([group, heading]) => ({
      group,
      heading,
      rows: rows.filter((row) => row.group === group),
    })).filter((section) => section.rows.length > 0);
  });

  protected readonly activeIndex = computed(() => {
    const count = this.enabledResults().length;
    if (count === 0) {
      return -1;
    }
    return Math.min(Math.max(this.activeIndexRaw(), 0), count - 1);
  });

  protected readonly activeOptionId = computed(
    () => this.enabledResults()[this.activeIndex()]?.optionId ?? null,
  );

  /** Readable local state only; entity failures never become keystroke alerts. */
  protected readonly searching = computed(
    () =>
      this.entityTerm() !== '' &&
      (this.termPending() ||
        this.incidents.isFetching() ||
        this.services.isFetching()),
  );

  protected readonly lookupFailed = computed(
    () =>
      this.entityTerm() !== '' &&
      !this.termPending() &&
      (this.incidents.isError() || this.services.isError()),
  );

  /** Announced only once a searched result count or no-match outcome settles. */
  protected readonly resultSummary = computed(() => {
    if (!this.open() || this.trimmedQuery() === '' || this.searching()) {
      return '';
    }

    const count = this.results().length;
    if (count === 0) {
      return 'No matching commands or records';
    }
    return count === 1 ? '1 result' : `${count} results`;
  });

  constructor() {
    effect(() => {
      this.rawQuery();
      this.activeIndexRaw.set(0);
    });
  }

  /** Read by the shell shortcut to decide between opening and refocusing. */
  get isOpen(): boolean {
    return this.open();
  }

  /**
   * Opens the palette and focuses search. When already open the original
   * invoker is retained and only the search field is refocused.
   */
  openFrom(invoker?: HTMLElement | null): void {
    if (this.open()) {
      this.searchRef().nativeElement.focus();
      return;
    }

    this.invoker = invoker ?? this.activeElement();
    this.closingForNavigation = false;

    const dialog = this.dialogRef().nativeElement;
    if (!dialog.open) {
      dialog.showModal();
    }
    this.open.set(true);

    afterNextRender(() => this.searchRef().nativeElement.focus(), {
      injector: this.injector,
    });
  }

  close(reason: PaletteCloseReason = 'dismiss'): void {
    this.closingForNavigation = reason === 'navigate';

    const dialog = this.dialogRef().nativeElement;
    if (dialog.open) {
      dialog.close();
    }
    this.open.set(false);

    const invoker = this.invoker;
    this.invoker = null;
    if (this.closingForNavigation) {
      return;
    }

    if (invoker && invoker.isConnected && !this.isDisabled(invoker)) {
      afterNextRender(() => invoker.focus(), { injector: this.injector });
    }
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.close('dismiss');
  }

  /** Keeps local state truthful if the dialog is closed outside close(). */
  protected onDialogClose(): void {
    this.open.set(false);
  }

  protected onQueryInput(event: Event): void {
    this.rawQuery.set((event.target as HTMLInputElement).value);
  }

  protected onSearchKeydown(event: KeyboardEvent): void {
    const count = this.enabledResults().length;

    switch (event.key) {
      case 'ArrowDown':
        if (count === 0) {
          return;
        }
        event.preventDefault();
        this.activeIndexRaw.set((this.activeIndex() + 1) % count);
        return;
      case 'ArrowUp':
        if (count === 0) {
          return;
        }
        event.preventDefault();
        this.activeIndexRaw.set((this.activeIndex() - 1 + count) % count);
        return;
      case 'Home':
        if (count === 0) {
          return;
        }
        event.preventDefault();
        this.activeIndexRaw.set(0);
        return;
      case 'End':
        if (count === 0) {
          return;
        }
        event.preventDefault();
        this.activeIndexRaw.set(count - 1);
        return;
      case 'Enter': {
        const active = this.enabledResults()[this.activeIndex()];
        if (!active) {
          return;
        }
        event.preventDefault();
        this.activate(active);
        return;
      }
      case 'Escape':
        event.preventDefault();
        this.close('dismiss');
        return;
      default:
        return;
    }
  }

  protected activate(row: PaletteResult): void {
    if (!row.enabled) {
      return;
    }

    this.close('navigate');
  }

  private activeElement(): HTMLElement | null {
    return document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  }

  private isDisabled(element: HTMLElement): boolean {
    return 'disabled' in element && element.disabled === true;
  }
}
