import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
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
  isResponderConflict,
  isValidationFailed,
  joinIncidentMutation,
  leaveIncidentMutation,
  addIncidentUpdateMutation,
  reopenIncidentMutation,
  resolveIncidentMutation,
  servicesQuery,
  updateIncidentMutation,
  type IncidentDetailDto,
  type IncidentSeverity,
  type IncidentStatus,
  type RevisionString,
} from '../../../data-access';
import {
  ACTIVE_STATUS_OPTIONS,
  canChangeActiveStatus,
  canChangeSeverity,
  canEditIncidentDetails,
  canJoin,
  canLeave,
  canPostWrittenUpdate,
  canReopen,
  canResolve,
} from '../utils/incident-actions';
import { focusAfterRender, firstFocusable } from '../../../shared/a11y/focus';
import {
  applyServerFieldErrors,
  fieldErrorMessage,
  firstInvalidField,
  focusFormElement,
  type FormFieldRef,
} from '../../../shared/a11y/form-focus';
import { CalloutComponent } from '../../../shared/ui/callout.component';
import { ConfirmDialogComponent } from '../../../shared/ui/confirm-dialog.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import { SeverityBadgeComponent } from '../../../shared/ui/severity-badge.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { HumanizePipe } from '../../../shared/pipes/humanize.pipe';
import { TimestampPipe } from '../../../shared/pipes/timestamp.pipe';

type ConfirmKind = 'resolve' | 'reopen' | 'leave';

const EDIT_FIELDS: readonly FormFieldRef[] = [
  { name: 'title', id: 'edit-title', label: 'Title' },
  { name: 'description', id: 'edit-description', label: 'Description' },
  { name: 'serviceId', id: 'edit-service', label: 'Service' },
];

const EDIT_SUMMARY_ID = 'edit-form-error';

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
    TimestampPipe,
    HumanizePipe,
  ],
  templateUrl: './incident-detail.page.html',
  styleUrl: './incident-detail.page.scss',
})
export class IncidentDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly queryClient = inject(QueryClient);
  private readonly fb = inject(FormBuilder);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly confirmDialog =
    viewChild.required<ConfirmDialogComponent>('lifecycleConfirm');
  private readonly conflictDismiss =
    viewChild<ElementRef<HTMLButtonElement>>('conflictDismiss');
  private readonly editTitle =
    viewChild<ElementRef<HTMLInputElement>>('editTitle');
  private readonly lifecycleHeading =
    viewChild<ElementRef<HTMLElement>>('lifecycleHeading');
  private readonly respondersHeading =
    viewChild<ElementRef<HTMLElement>>('respondersHeading');
  private readonly resolveAction =
    viewChild<ElementRef<HTMLButtonElement>>('resolveAction');
  private readonly reopenAction =
    viewChild<ElementRef<HTMLButtonElement>>('reopenAction');
  private readonly joinAction =
    viewChild<ElementRef<HTMLButtonElement>>('joinAction');
  private readonly leaveAction =
    viewChild<ElementRef<HTMLButtonElement>>('leaveAction');

  protected readonly id = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('id') ?? '')),
    { initialValue: '' },
  );

  readonly timelinePage = signal(1);
  readonly conflictOpen = signal(false);
  protected readonly editError = signal<string | null>(null);
  protected readonly lifecycleError = signal<string | null>(null);
  protected readonly collabError = signal<string | null>(null);
  readonly severityDraft = signal<IncidentSeverity>('Low');
  protected readonly statusDraft = signal<IncidentStatus>('Investigating');
  // A picked but unapplied lifecycle value survives passive refreshes.
  private readonly severityChosen = signal(false);
  private readonly statusChosen = signal(false);
  protected readonly confirmKind = signal<ConfirmKind | null>(null);
  readonly updateBody = signal('');

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
  private readonly joinOptions = runInInjectionContext(this.injector, () =>
    joinIncidentMutation(),
  );
  private readonly leaveOptions = runInInjectionContext(this.injector, () =>
    leaveIncidentMutation(),
  );
  private readonly addUpdateOptions = runInInjectionContext(this.injector, () =>
    addIncidentUpdateMutation(),
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
  protected readonly joinMut = injectMutation(() => this.joinOptions);
  protected readonly leaveMut = injectMutation(() => this.leaveOptions);
  protected readonly addUpdateMut = injectMutation(() => this.addUpdateOptions);

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

  protected readonly isMember = computed(() => {
    const user = this.currentUser.data();
    const items = this.responders.data()?.items;
    if (!user || !items) {
      return false;
    }
    return items.some((r) => r.userId === user.userId);
  });

  protected readonly showJoin = computed(() => {
    const user = this.currentUser.data();
    const incident = this.detail.data();
    return user && incident
      ? canJoin(user.role, incident.status, this.isMember())
      : false;
  });

  protected readonly showLeave = computed(() => {
    const user = this.currentUser.data();
    const incident = this.detail.data();
    return user && incident
      ? canLeave(user.role, incident.status, this.isMember())
      : false;
  });

  protected readonly showWrittenUpdate = computed(() => {
    const user = this.currentUser.data();
    const incident = this.detail.data();
    return user && incident
      ? canPostWrittenUpdate(user.role, incident.status)
      : false;
  });

  protected readonly lifecyclePending = computed(
    () =>
      this.severityMut.isPending() ||
      this.statusMut.isPending() ||
      this.resolveMut.isPending() ||
      this.reopenMut.isPending(),
  );

  protected readonly collabPending = computed(
    () =>
      this.joinMut.isPending() ||
      this.leaveMut.isPending() ||
      this.addUpdateMut.isPending(),
  );

  protected readonly confirmTitle = computed(() => {
    switch (this.confirmKind()) {
      case 'reopen':
        return 'Reopen this incident?';
      case 'leave':
        return 'Leave this incident?';
      default:
        return 'Resolve this incident?';
    }
  });

  protected readonly confirmBody = computed(() => {
    switch (this.confirmKind()) {
      case 'reopen':
        return 'The incident returns to Investigating and responders can collaborate again.';
      case 'leave':
        return 'You will be removed from the responder list for this active incident.';
      default:
        return 'This records the resolution time. Updates and new responders are closed until the incident is reopened.';
    }
  });

  protected readonly confirmLabel = computed(() => {
    switch (this.confirmKind()) {
      case 'reopen':
        return 'Confirm reopen';
      case 'leave':
        return 'Confirm leave';
      default:
        return 'Confirm resolve';
    }
  });

  private lastBoundVersion = signal<string | null>(null);
  private lastFormVersion = signal<RevisionString | null>(null);
  // Versions are per incident, so a reused page must also compare the id.
  private boundIncidentId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const incident = this.detail.data();
      if (!incident) {
        return;
      }
      const version = String(incident.version);
      untracked(() => {
        const movedIncident = this.boundIncidentId() !== incident.id;
        if (movedIncident || this.lastBoundVersion() !== version) {
          this.boundIncidentId.set(incident.id);
          this.lastBoundVersion.set(version);
          if (movedIncident) {
            this.severityChosen.set(false);
            this.statusChosen.set(false);
          }
          if (!this.severityChosen()) {
            this.severityDraft.set(incident.severity);
          }
          if (!this.statusChosen()) {
            this.statusDraft.set(
              incident.status === 'Resolved' ? 'Investigating' : incident.status,
            );
          }
        }

        /**
         * A passive refresh never overwrites work in progress: only a pristine
         * form adopts new server values. Explicit conflict recovery is the one
         * path that replaces typed values.
         */
        if (
          !movedIncident &&
          (this.editForm.dirty || this.lastFormVersion() === version)
        ) {
          return;
        }
        this.bindEditForm(incident);
      });
    });
  }

  private bindEditForm(incident: IncidentDetailDto): void {
    this.lastFormVersion.set(incident.version);
    this.editForm.reset({
      title: incident.title,
      description: incident.description,
      serviceId: incident.serviceId,
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
    focusAfterRender(this.injector, () => this.editTitle()?.nativeElement);
  }

  onSeverityDraft(value: string): void {
    this.severityDraft.set(value as IncidentSeverity);
    this.severityChosen.set(true);
  }

  onStatusDraft(value: string): void {
    this.statusDraft.set(value as IncidentStatus);
    this.statusChosen.set(true);
  }

  openResolveConfirm(event: Event): void {
    this.openConfirm('resolve', event);
  }

  openReopenConfirm(event: Event): void {
    this.openConfirm('reopen', event);
  }

  openLeaveConfirm(event: Event): void {
    this.openConfirm('leave', event);
  }

  async onLifecycleConfirmed(): Promise<void> {
    const kind = this.confirmKind();
    if (!kind) {
      return;
    }
    try {
      if (kind === 'resolve') {
        await this.resolveIncident();
      } else if (kind === 'reopen') {
        await this.reopenIncident();
      } else {
        await this.leaveIncident();
      }
    } finally {
      this.confirmKind.set(null);
      this.confirmDialog().settle({
        focusTarget: () => this.confirmationOutcomeTarget(kind),
      });
    }
  }

  onLifecycleCancelled(): void {
    this.confirmKind.set(null);
  }

  private openConfirm(kind: ConfirmKind, event: Event): void {
    this.confirmKind.set(kind);
    const invoker =
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.confirmDialog().open({
      invoker,
      initialFocus: kind === 'resolve' || kind === 'leave' ? 'cancel' : 'confirm',
      cancelFallback: () =>
        kind === 'leave'
          ? this.respondersHeading()?.nativeElement
          : this.lifecycleHeading()?.nativeElement,
    });
  }

  private confirmationOutcomeTarget(kind: ConfirmKind): HTMLElement | null {
    if (this.conflictOpen()) {
      return this.conflictDismiss()?.nativeElement ?? null;
    }
    if (kind === 'leave') {
      return firstFocusable([
        this.joinAction()?.nativeElement,
        this.respondersHeading()?.nativeElement,
        this.leaveAction()?.nativeElement,
      ]);
    }
    if (kind === 'resolve') {
      return firstFocusable([
        this.reopenAction()?.nativeElement,
        this.lifecycleHeading()?.nativeElement,
        this.resolveAction()?.nativeElement,
      ]);
    }
    return firstFocusable([
      this.resolveAction()?.nativeElement,
      this.lifecycleHeading()?.nativeElement,
      this.reopenAction()?.nativeElement,
    ]);
  }

  protected editFieldError(name: string): string | null {
    const field = EDIT_FIELDS.find((candidate) => candidate.name === name);
    return field
      ? fieldErrorMessage(field.label, this.editForm.get(name))
      : null;
  }

  async saveDetails(): Promise<void> {
    this.editError.set(null);
    if (this.conflictOpen() || this.editForm.invalid || !this.canEdit()) {
      this.editForm.markAllAsTouched();
      if (!this.conflictOpen()) {
        const field = firstInvalidField(EDIT_FIELDS, (name) =>
          this.editForm.get(name),
        );
        this.focusEditElement(field?.id);
      }
      return;
    }
    const id = this.id();
    // The version the form was loaded from, not the newest cached one, so a
    // change that arrived while typing is rejected instead of overwritten.
    const baseline = this.lastFormVersion();
    if (!baseline || !id) {
      return;
    }
    const value = this.editForm.getRawValue();
    try {
      const saved = await this.updateMut.mutateAsync({
        id,
        body: {
          ...value,
          expectedVersion: baseline,
        },
      });
      this.bindEditForm(saved);
    } catch (error) {
      if (isValidationFailed(error)) {
        const affected = applyServerFieldErrors(
          error.errors ?? {},
          EDIT_FIELDS,
          (name) => this.editForm.get(name),
        );
        if (affected) {
          this.focusEditElement(affected.id);
          return;
        }
        this.editError.set(
          error.detail || error.title || 'Validation failed',
        );
        this.focusEditElement(EDIT_SUMMARY_ID);
        return;
      }
      await this.handleMutationError(error, 'edit');
      if (!this.conflictOpen()) {
        this.focusEditElement(EDIT_SUMMARY_ID);
      }
    }
  }

  private focusEditElement(elementId: string | undefined): void {
    focusFormElement(this.injector, () => this.host.nativeElement, elementId);
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
      this.severityChosen.set(false);
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
      this.statusChosen.set(false);
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
    this.statusChosen.set(false);
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
    this.statusChosen.set(false);
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

  async joinIncident(): Promise<void> {
    this.collabError.set(null);
    if (this.conflictOpen() || !this.showJoin()) {
      return;
    }
    const id = this.id();
    const incident = this.cachedDetail(id);
    if (!incident || !id) {
      return;
    }
    try {
      await this.joinMut.mutateAsync({
        id,
        body: { expectedLifecycleVersion: incident.lifecycleVersion },
      });
      this.resetTimelinePage();
    } catch (error) {
      await this.handleMutationError(error, 'collab');
    }
  }

  async leaveIncident(): Promise<void> {
    this.collabError.set(null);
    if (this.conflictOpen() || !this.showLeave()) {
      return;
    }
    const id = this.id();
    const incident = this.cachedDetail(id);
    if (!incident || !id) {
      return;
    }
    try {
      await this.leaveMut.mutateAsync({
        id,
        body: { expectedLifecycleVersion: incident.lifecycleVersion },
      });
      this.resetTimelinePage();
    } catch (error) {
      await this.handleMutationError(error, 'collab');
    }
  }

  async postWrittenUpdate(): Promise<void> {
    this.collabError.set(null);
    const body = this.updateBody().trim();
    if (this.conflictOpen() || !this.showWrittenUpdate() || !body) {
      return;
    }
    if (body.length > 10000) {
      this.collabError.set('Update must be at most 10000 characters.');
      return;
    }
    const id = this.id();
    const incident = this.cachedDetail(id);
    if (!incident || !id) {
      return;
    }
    try {
      await this.addUpdateMut.mutateAsync({
        id,
        body: {
          body,
          expectedLifecycleVersion: incident.lifecycleVersion,
        },
      });
      this.updateBody.set('');
      this.resetTimelinePage();
    } catch (error) {
      await this.handleMutationError(error, 'collab');
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
    surface: 'edit' | 'lifecycle' | 'collab',
  ): Promise<void> {
    if (isConcurrencyConflict(error)) {
      this.conflictOpen.set(true);
      focusAfterRender(
        this.injector,
        () => this.conflictDismiss()?.nativeElement,
      );
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
      this.bindEditForm(fresh);
      this.severityChosen.set(false);
      this.statusChosen.set(false);
      this.severityDraft.set(fresh.severity);
      this.statusDraft.set(
        fresh.status === 'Resolved' ? 'Investigating' : fresh.status,
      );
      return;
    }

    const message = this.problemMessage(error);
    if (surface === 'edit') {
      this.editError.set(message);
    } else if (surface === 'lifecycle') {
      this.lifecycleError.set(message);
    } else {
      this.collabError.set(message);
    }
  }

  private problemMessage(error: unknown): string {
    if (isValidationFailed(error)) {
      return error.detail || error.title || 'Validation failed';
    }
    if (isLifecycleConflict(error)) {
      return error.detail || error.title || 'Lifecycle conflict';
    }
    if (isResponderConflict(error)) {
      return error.detail || error.title || 'Responder conflict';
    }
    if (isForbidden(error)) {
      return error.detail || error.title || 'Not allowed';
    }
    return 'Could not complete that action.';
  }
}
