import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  runInInjectionContext,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { debounceTime, distinctUntilChanged, skip } from 'rxjs';

import {
  SERVICE_HEALTHS,
  servicesQuery,
  teamsQuery,
  type ServiceQuery,
} from '../../../data-access';
import { HealthBadgeComponent } from '../../../shared/ui/health-badge.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { focusWhenReady } from '../../../shared/a11y/focus';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import {
  navigateServiceListQuery,
  serviceListQueryFromParamMap,
  withServicePageResetOnFilterChange,
} from '../../../shared/url/list-query.sync';
import { TimestampPipe } from '../../../shared/pipes/timestamp.pipe';

@Component({
  selector: 'ob-service-list-page',
  host: { class: 'viewport-page' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    HealthBadgeComponent,
    PageHeaderComponent,
    PaginationComponent,
    TimestampPipe,
  ],
  templateUrl: './service-list.page.html',
})
export class ServiceListPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    requireSync: true,
  });

  protected readonly listQuery = computed(() =>
    serviceListQueryFromParamMap(this.queryParamMap()),
  );

  private readonly servicesOptions = computed(() =>
    runInInjectionContext(this.injector, () =>
      servicesQuery(this.listQuery()),
    ),
  );
  private readonly teamsOptions = runInInjectionContext(this.injector, () =>
    teamsQuery({ limit: 100 }),
  );

  protected readonly services = injectQuery(() => this.servicesOptions());
  protected readonly teams = injectQuery(() => this.teamsOptions);

  protected readonly healths = SERVICE_HEALTHS;
  protected readonly searchDraft = signal(this.listQuery().search ?? '');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly firstFilter =
    viewChild<ElementRef<HTMLSelectElement>>('firstFilter');

  /** Sort is a view choice, not a filter, so it does not count. */
  protected readonly hasActiveFilters = computed(() => {
    const q = this.listQuery();
    return !!(q.health || q.teamId || q.search || this.searchDraft());
  });

  constructor() {
    toObservable(this.listQuery)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((q) => {
        const next = q.search ?? '';
        if (this.searchDraft() !== next) {
          this.searchDraft.set(next);
        }
      });

    toObservable(this.searchDraft)
      .pipe(
        skip(1),
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((search) => {
        const committed = this.listQuery().search ?? '';
        if (search === committed) {
          return;
        }
        void this.commitQuery({
          ...this.listQuery(),
          search: search || null,
        });
      });
  }

  commitFilter(patch: Partial<ServiceQuery>): void {
    void this.commitQuery({ ...this.listQuery(), ...patch });
  }

  /** Health and recency read most-urgent first; names read from A to Z. */
  commitSort(sort: string): void {
    this.commitFilter({ sort, direction: sort === 'name' ? undefined : 'desc' });
  }

  /** Placeholder rows shown under the real header while the list loads. */
  protected readonly placeholderRows = [1, 2, 3, 4, 5, 6, 7, 8];

  /** Retries the list; on success focus moves to its first row, or the page heading. */
  protected async retryList(): Promise<void> {
    const result = await this.services.refetch();
    if (!result.isSuccess) {
      return;
    }
    const host = this.host.nativeElement;
    focusWhenReady(
      this.injector,
      () => this.services.isSuccess(),
      // Wait for the first row when rows came back; an empty list goes to the heading.
      () =>
        (this.services.data()?.items.length ?? 0) > 0
          ? host.querySelector<HTMLElement>('tbody a')
          : host.querySelector<HTMLElement>('h1'),
    );
  }

  /** Refetches a failed filter lookup, then moves focus to its restored control. */
  protected async retryLookup(
    lookup: { refetch(): Promise<{ isSuccess: boolean }>; isSuccess(): boolean },
    name: string,
  ): Promise<void> {
    const result = await lookup.refetch();
    if (!result.isSuccess) {
      return;
    }
    focusWhenReady(
      this.injector,
      () => lookup.isSuccess(),
      () => this.host.nativeElement.querySelector<HTMLSelectElement>(`select[name="${name}"]:not(:disabled)`),
    );
  }

  /** Focus moves to the first filter because the pressed button becomes disabled. */
  clearFilters(): void {
    this.searchDraft.set('');
    this.commitFilter({ health: null, teamId: null, search: null });
    this.firstFilter()?.nativeElement.focus();
  }

  onPage(delta: -1 | 1): void {
    const page = this.listQuery().page ?? 1;
    void this.commitQuery({ ...this.listQuery(), page: page + delta });
  }

  private async commitQuery(next: ServiceQuery): Promise<void> {
    const adjusted = withServicePageResetOnFilterChange(this.listQuery(), next);
    await navigateServiceListQuery(this.router, adjusted);
  }
}
