import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { map } from 'rxjs';

import {
  incidentQuery,
  incidentRespondersQuery,
  incidentTimelineQuery,
} from '../../../data-access';
import { CalloutComponent } from '../../../shared/ui/callout.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import { SeverityBadgeComponent } from '../../../shared/ui/severity-badge.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';

@Component({
  selector: 'ob-incident-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CalloutComponent,
    PageHeaderComponent,
    PaginationComponent,
    SeverityBadgeComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './incident-detail.page.html',
  styleUrl: './incident-detail.page.scss',
})
export class IncidentDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);

  protected readonly id = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('id') ?? '')),
    { initialValue: '' },
  );

  protected readonly timelinePage = signal(1);

  private readonly detailOptions = computed(() => {
    const id = this.id();
    if (!id) {
      return null;
    }
    return runInInjectionContext(this.injector, () => incidentQuery(id));
  });

  private readonly respondersOptions = computed(() => {
    const id = this.id();
    if (!id) {
      return null;
    }
    return runInInjectionContext(this.injector, () =>
      incidentRespondersQuery(id, { limit: 100 }),
    );
  });

  private readonly timelineOptions = computed(() => {
    const id = this.id();
    if (!id) {
      return null;
    }
    return runInInjectionContext(this.injector, () =>
      incidentTimelineQuery(id, {
        page: this.timelinePage(),
        pageSize: 25,
      }),
    );
  });

  protected readonly detail = injectQuery(() => {
    const options = this.detailOptions();
    return (
      options ?? {
        queryKey: ['opsboard', 'incidents', 'detail', 'missing'] as const,
        queryFn: async () => {
          throw new Error('missing id');
        },
        enabled: false,
      }
    );
  });

  protected readonly responders = injectQuery(() => {
    const options = this.respondersOptions();
    return (
      options ?? {
        queryKey: ['opsboard', 'incidents', 'responders', 'missing'] as const,
        queryFn: async () => ({ items: [], nextAfter: null }),
        enabled: false,
      }
    );
  });

  protected readonly timeline = injectQuery(() => {
    const options = this.timelineOptions();
    return (
      options ?? {
        queryKey: ['opsboard', 'incidents', 'timeline', 'missing'] as const,
        queryFn: async () => ({
          items: [],
          page: 1,
          pageSize: 25,
          totalCount: 0,
          totalPages: 0,
        }),
        enabled: false,
      }
    );
  });

  onTimelinePage(delta: -1 | 1): void {
    this.timelinePage.update((p) => Math.max(1, p + delta));
  }

  resetTimelinePage(): void {
    this.timelinePage.set(1);
  }
}
