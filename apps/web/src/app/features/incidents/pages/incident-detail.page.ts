import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  runInInjectionContext,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  injectMutation,
  injectQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { map } from 'rxjs';

import {
  currentUserQuery,
  incidentQuery,
  incidentRespondersQuery,
  incidentTimelineQuery,
  isConcurrencyConflict,
  isValidationFailed,
  servicesQuery,
  updateIncidentMutation,
  type IncidentDetailDto,
} from '../../../data-access';
import { canEditIncidentDetails } from '../utils/incident-actions';
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
    ReactiveFormsModule,
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
  private readonly queryClient = inject(QueryClient);
  private readonly fb = inject(FormBuilder);

  protected readonly id = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('id') ?? '')),
    { initialValue: '' },
  );

  protected readonly timelinePage = signal(1);
  readonly conflictOpen = signal(false);
  protected readonly editError = signal<string | null>(null);

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

  private readonly servicesOptions = runInInjectionContext(this.injector, () =>
    servicesQuery({ pageSize: 100, sort: 'name' }),
  );
  private readonly currentUserOptions = runInInjectionContext(
    this.injector,
    () => currentUserQuery(),
  );
  private readonly updateOptions = runInInjectionContext(this.injector, () =>
    updateIncidentMutation(),
  );

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

  protected readonly services = injectQuery(() => this.servicesOptions);
  protected readonly currentUser = injectQuery(() => this.currentUserOptions);
  protected readonly updateMut = injectMutation(() => this.updateOptions);

  readonly editForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', [Validators.required, Validators.maxLength(10000)]],
    serviceId: ['', Validators.required],
  });

  protected readonly canEdit = computed(() => {
    const user = this.currentUser.data();
    return user ? canEditIncidentDetails(user.role) : false;
  });

  private lastBoundVersion = signal<string | null>(null);

  constructor() {
    effect(() => {
      const incident = this.detail.data();
      if (!incident) {
        return;
      }
      const version = String(incident.version);
      untracked(() => {
        if (this.lastBoundVersion() === version) {
          return;
        }
        this.lastBoundVersion.set(version);
        this.editForm.reset({
          title: incident.title,
          description: incident.description,
          serviceId: incident.serviceId,
        });
      });
    });
  }

  onTimelinePage(delta: -1 | 1): void {
    this.timelinePage.update((p) => Math.max(1, p + delta));
  }

  resetTimelinePage(): void {
    this.timelinePage.set(1);
  }

  dismissConflict(): void {
    this.conflictOpen.set(false);
  }

  async saveDetails(): Promise<void> {
    this.editError.set(null);
    if (this.conflictOpen() || this.editForm.invalid || !this.canEdit()) {
      this.editForm.markAllAsTouched();
      return;
    }
    const id = this.id();
    if (!id) {
      return;
    }
    // Prefer QueryClient cache so submit tokens stay current even when the
    // injectQuery signal has not flushed yet after conflict recovery.
    const options = runInInjectionContext(this.injector, () =>
      incidentQuery(id),
    );
    const incident =
      this.queryClient.getQueryData<IncidentDetailDto>(options.queryKey) ??
      this.detail.data();
    if (!incident) {
      return;
    }
    const value = this.editForm.getRawValue();
    try {
      await this.updateMut.mutateAsync({
        id,
        body: {
          ...value,
          expectedVersion: incident.version,
        },
      });
      this.editForm.markAsPristine();
    } catch (error) {
      if (isConcurrencyConflict(error)) {
        this.conflictOpen.set(true);
        const fresh = await this.queryClient.fetchQuery({
          ...options,
          staleTime: 0,
        });
        this.lastBoundVersion.set(String(fresh.version));
        this.editForm.reset({
          title: fresh.title,
          description: fresh.description,
          serviceId: fresh.serviceId,
        });
        return;
      }
      if (isValidationFailed(error)) {
        this.editError.set(error.detail || error.title || 'Validation failed');
        return;
      }
      this.editError.set('Could not save incident details.');
    }
  }
}
