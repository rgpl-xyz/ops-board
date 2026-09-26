import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  Injector,
  runInInjectionContext,
  signal,
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
import { CalloutComponent } from '../../../shared/ui/callout.component';
import { HealthBadgeComponent } from '../../../shared/ui/health-badge.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import {
  navigateServiceListQuery,
  serviceListQueryFromParamMap,
  withServicePageResetOnFilterChange,
} from '../../../shared/url/list-query.sync';
import { TimestampPipe } from '../../../shared/pipes/timestamp.pipe';

@Component({
  selector: 'ob-service-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    CalloutComponent,
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

  onPage(delta: -1 | 1): void {
    const page = this.listQuery().page ?? 1;
    void this.commitQuery({ ...this.listQuery(), page: page + delta });
  }

  private async commitQuery(next: ServiceQuery): Promise<void> {
    const adjusted = withServicePageResetOnFilterChange(this.listQuery(), next);
    await navigateServiceListQuery(this.router, adjusted);
  }
}
