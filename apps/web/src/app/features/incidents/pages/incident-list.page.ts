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
  type IncidentQuery,
  incidentsQuery,
  servicesQuery,
  teamsQuery,
  currentUserQuery,
} from '../../../data-access';
import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
} from '../../../data-access/contracts/enums';
import { canCreateIncident } from '../utils/incident-actions';
import { CalloutComponent } from '../../../shared/ui/callout.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import { SeverityBadgeComponent } from '../../../shared/ui/severity-badge.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import {
  incidentListQueryFromParamMap,
  navigateIncidentListQuery,
  withPageResetOnFilterChange,
} from '../../../shared/url/list-query.sync';
import { TimestampPipe } from '../../../shared/pipes/timestamp.pipe';

@Component({
  selector: 'ob-incident-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    CalloutComponent,
    PageHeaderComponent,
    PaginationComponent,
    SeverityBadgeComponent,
    StatusBadgeComponent,
    TimestampPipe,
  ],
  templateUrl: './incident-list.page.html',
})
export class IncidentListPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    requireSync: true,
  });

  protected readonly listQuery = computed(() =>
    incidentListQueryFromParamMap(this.queryParamMap()),
  );

  private readonly incidentsOptions = computed(() =>
    runInInjectionContext(this.injector, () =>
      incidentsQuery(this.listQuery()),
    ),
  );
  private readonly teamsOptions = runInInjectionContext(this.injector, () =>
    teamsQuery({ limit: 100 }),
  );
  private readonly servicesOptions = runInInjectionContext(this.injector, () =>
    servicesQuery({ pageSize: 100, sort: 'name' }),
  );
  private readonly currentUserOptions = runInInjectionContext(
    this.injector,
    () => currentUserQuery(),
  );

  protected readonly incidents = injectQuery(() => this.incidentsOptions());
  protected readonly teams = injectQuery(() => this.teamsOptions);
  protected readonly services = injectQuery(() => this.servicesOptions);
  protected readonly currentUser = injectQuery(() => this.currentUserOptions);

  protected readonly statuses = INCIDENT_STATUSES;
  protected readonly severities = INCIDENT_SEVERITIES;

  protected readonly searchDraft = signal(this.listQuery().search ?? '');

  protected readonly canCreate = computed(() => {
    const user = this.currentUser.data();
    return user ? canCreateIncident(user.role) : false;
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

  commitFilter(patch: Partial<IncidentQuery>): void {
    void this.commitQuery({ ...this.listQuery(), ...patch });
  }

  onPage(delta: -1 | 1): void {
    const page = this.listQuery().page ?? 1;
    void this.commitQuery({ ...this.listQuery(), page: page + delta });
  }

  private async commitQuery(next: IncidentQuery): Promise<void> {
    const adjusted = withPageResetOnFilterChange(this.listQuery(), next);
    await navigateIncidentListQuery(this.router, adjusted);
  }
}
