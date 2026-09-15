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
  viewChild,
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
  changeSeverityMutation,
  changeStatusMutation,
  currentUserQuery,
  INCIDENT_SEVERITIES,
  incidentQuery,
  incidentRespondersQuery,
  incidentTimelineQuery,
  isConcurrencyConflict,
  isForbidden,
  isLifecycleConflict,
  isValidationFailed,
  reopenIncidentMutation,
  resolveIncidentMutation,
  servicesQuery,
  updateIncidentMutation,
  type IncidentDetailDto,
  type IncidentSeverity,
  type IncidentStatus,
} from '../../../data-access';
import {
  ACTIVE_STATUS_OPTIONS,
  canChangeActiveStatus,
  canChangeSeverity,
  canEditIncidentDetails,
  canReopen,
  canResolve,
} from '../utils/incident-actions';
import { CalloutComponent } from '../../../shared/ui/callout.component';
import { ConfirmDialogComponent } from '../../../shared/ui/confirm-dialog.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import { SeverityBadgeComponent } from '../../../shared/ui/severity-badge.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';

type ConfirmKind = 'resolve' | 'reopen';

@Component({
  selector: 'ob-incident-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    CalloutComponent,
    ConfirmDialogComponent,
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

  private readonly confirmDialog =
    viewChild.required<ConfirmDialogComponent>('lifecycleConfirm');

  protected readonly id = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('id') ?? '')),
    { initialValue: '' },
  );

  readonly timelinePage = signal(1);
  readonly conflictOpen = signal(false);
  protected readonly editError = signal<string | null>(null);
  protected readonly lifecycleError = signal<string | null>(null);
  readonly severityDraft = signal<IncidentSeverity>('Low');
  protected readonly statusDraft = signal<IncidentStatus>('Investigating');
  protected readonly confirmKind = signal<ConfirmKind | null>(null);

  protected readonly severities = INCIDENT_SEVERITIES;
  protected readonly activeStatusOptions = ACTIVE_STATUS_OPTIONS;

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
  private readonly severityOptions = runInInjectionContext(this.injector, () =>
    changeSeverityMutation(),
  );
  private readonly statusOptions = runInInjectionContext(this.injector, () =>
    changeStatusMutation(),
  );
  private readonly resolveOptions = runInInjectionContext(this.injector, () =>
    resolveIncidentMutation(),
  );
  private readonly reopenOptions = runInInjectionContext(this.injector, () =>
    reopenIncidentMutation(),
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
  protected readonly severityMut = injectMutation(() => this.severityOptions);
  protected readonly statusMut = injectMutation(() => this.statusOptions);
  protected readonly resolveMut = injectMutation(() => this.resolveOptions);
  protected readonly reopenMut = injectMutation(() => this.reopenOptions);

  readonly editForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', [Validators.required, Validators.maxLength(10000)]],
    serviceId: ['', Validators.required],
  });

  protected readonly canEdit = computed(() => {
    const user = this.currentUser.data();
    return user ? canEditIncidentDetails(user.role) : false;
  });

  protected readonly showSeverity = computed(() => {
    const user = this.currentUser.data();
    return user ? canChangeSeverity(user.role) : false;
  });

  protected readonly showStatus = computed(() => {
    const user = this.currentUser.data();
    const incident = this.detail.data();
    return user && incident
      ? canChangeActiveStatus(user.role, incident.status)
      : false;
  });

  protected readonly showResolve = computed(() => {
    const user = this.currentUser.data();
    const incident = this.detail.data();
    return user && incident ? canResolve(user.role, incident.status) : false;
  });

  protected readonly showReopen = computed(() => {
    const user = this.currentUser.data();
    const incident = this.detail.data();
    return user && incident ? canReopen(user.role, incident.status) : false;
  });

  protected readonly lifecyclePending = computed(
    () =>
      this.severityMut.isPending() ||
      this.statusMut.isPending() ||
      this.resolveMut.isPending() ||
      this.reopenMut.isPending(),
  );

  protected readonly confirmTitle = computed(() =>
    this.confirmKind() === 'reopen' ? 'Reopen this incident?' : 'Resolve this incident?',
  );

  protected readonly confirmBody = computed(() =>
    this.confirmKind() === 'reopen'
      ? 'The incident returns to Investigating and responders can collaborate again.'
      : 'This records resolution time and ends active collaboration intent.',
  );

  protected readonly confirmLabel = computed(() =>
    this.confirmKind() === 'reopen' ? 'Confirm reopen' : 'Confirm resolve',
  );

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
        this.severityDraft.set(incident.severity);
        this.statusDraft.set(
          incident.status === 'Resolved' ? 'Investigating' : incident.status,
        );
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

  onSeverityDraft(value: string): void {
    this.severityDraft.set(value as IncidentSeverity);
  }

  onStatusDraft(value: string): void {
    this.statusDraft.set(value as IncidentStatus);
  }

  openResolveConfirm(event: Event): void {
    this.confirmKind.set('resolve');
    const target =
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.confirmDialog().open(target);
  }

  openReopenConfirm(event: Event): void {
    this.confirmKind.set('reopen');
    const target =
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.confirmDialog().open(target);
  }

  onLifecycleConfirmed(): void {
    const kind = this.confirmKind();
    this.confirmKind.set(null);
    if (kind === 'resolve') {
      void this.resolveIncident();
    } else if (kind === 'reopen') {
      void this.reopenIncident();
    }
  }

  onLifecycleCancelled(): void {
    this.confirmKind.set(null);
  }

  async saveDetails(): Promise<void> {
    this.editError.set(null);
    if (this.conflictOpen() || this.editForm.invalid || !this.canEdit()) {
      this.editForm.markAllAsTouched();
      return;
    }
    const id = this.id();
    const incident = this.cachedDetail(id);
    if (!incident || !id) {
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
      await this.handleMutationError(error, 'edit');
    }
  }

  async applySeverity(): Promise<void> {
    this.lifecycleError.set(null);
    if (this.conflictOpen() || !this.showSeverity()) {
      return;
    }
    const id = this.id();
    const incident = this.cachedDetail(id);
    if (!incident || !id) {
      return;
    }
    try {
      await this.severityMut.mutateAsync({
        id,
        body: {
          severity: this.severityDraft(),
          expectedVersion: incident.version,
        },
      });
      this.resetTimelinePage();
    } catch (error) {
      await this.handleMutationError(error, 'lifecycle');
    }
  }

  async applyStatus(): Promise<void> {
    this.lifecycleError.set(null);
    if (this.conflictOpen() || !this.showStatus()) {
      return;
    }
    const id = this.id();
    const incident = this.cachedDetail(id);
    if (!incident || !id) {
      return;
    }
    try {
      await this.statusMut.mutateAsync({
        id,
        body: {
          status: this.statusDraft(),
          expectedVersion: incident.version,
        },
      });
      this.resetTimelinePage();
    } catch (error) {
      await this.handleMutationError(error, 'lifecycle');
    }
  }

  async resolveIncident(): Promise<void> {
    this.lifecycleError.set(null);
    if (this.conflictOpen() || !this.showResolve()) {
      return;
    }
    const id = this.id();
    const incident = this.cachedDetail(id);
    if (!incident || !id) {
      return;
    }
    try {
      await this.resolveMut.mutateAsync({
        id,
        body: { expectedVersion: incident.version },
      });
      this.resetTimelinePage();
    } catch (error) {
      await this.handleMutationError(error, 'lifecycle');
    }
  }

  async reopenIncident(): Promise<void> {
    this.lifecycleError.set(null);
    if (this.conflictOpen() || !this.showReopen()) {
      return;
    }
    const id = this.id();
    const incident = this.cachedDetail(id);
    if (!incident || !id) {
      return;
    }
    try {
      await this.reopenMut.mutateAsync({
        id,
        body: { expectedVersion: incident.version },
      });
      this.resetTimelinePage();
    } catch (error) {
      await this.handleMutationError(error, 'lifecycle');
    }
  }

  private cachedDetail(id: string): IncidentDetailDto | undefined {
    if (!id) {
      return undefined;
    }
    const options = runInInjectionContext(this.injector, () =>
      incidentQuery(id),
    );
    return (
      this.queryClient.getQueryData<IncidentDetailDto>(options.queryKey) ??
      this.detail.data()
    );
  }

  private async handleMutationError(
    error: unknown,
    surface: 'edit' | 'lifecycle',
  ): Promise<void> {
    if (isConcurrencyConflict(error)) {
      this.conflictOpen.set(true);
      const id = this.id();
      if (!id) {
        return;
      }
      const options = runInInjectionContext(this.injector, () =>
        incidentQuery(id),
      );
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
      this.severityDraft.set(fresh.severity);
      this.statusDraft.set(
        fresh.status === 'Resolved' ? 'Investigating' : fresh.status,
      );
      return;
    }

    const message = this.problemMessage(error);
    if (surface === 'edit') {
      this.editError.set(message);
    } else {
      this.lifecycleError.set(message);
    }
  }

  private problemMessage(error: unknown): string {
    if (isValidationFailed(error)) {
      return error.detail || error.title || 'Validation failed';
    }
    if (isLifecycleConflict(error)) {
      return error.detail || error.title || 'Lifecycle conflict';
    }
    if (isForbidden(error)) {
      return error.detail || error.title || 'Not allowed';
    }
    return 'Could not complete that action.';
  }
}
