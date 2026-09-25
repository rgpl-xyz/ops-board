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
  currentUserQuery,
  isConcurrencyConflict,
  isForbidden,
  isValidationFailed,
  SERVICE_HEALTHS,
  serviceQuery,
  teamsQuery,
  updateServiceMutation,
  type RevisionString,
  type ServiceDto,
  type ServiceHealth,
} from '../../../data-access';
import { canManage } from '../../../shared/permissions/capabilities';
import { focusAfterRender } from '../../../shared/a11y/focus';
import {
  applyServerFieldErrors,
  fieldErrorMessage,
  firstInvalidField,
  focusFormElement,
  type FormFieldRef,
} from '../../../shared/a11y/form-focus';
import { CalloutComponent } from '../../../shared/ui/callout.component';
import { HealthBadgeComponent } from '../../../shared/ui/health-badge.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { TimestampPipe } from '../../../shared/pipes/timestamp.pipe';

const EDIT_FIELDS: readonly FormFieldRef[] = [
  { name: 'name', id: 'svc-name', label: 'Name' },
  { name: 'description', id: 'svc-desc', label: 'Description' },
  { name: 'teamId', id: 'svc-team', label: 'Team' },
  { name: 'health', id: 'svc-health', label: 'Health' },
];

const EDIT_SUMMARY_ID = 'svc-edit-error';

@Component({
  selector: 'ob-service-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    CalloutComponent,
    HealthBadgeComponent,
    PageHeaderComponent,
    TimestampPipe,
  ],
  templateUrl: './service-detail.page.html',
  styleUrl: './service-detail.page.scss',
})
export class ServiceDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly queryClient = inject(QueryClient);
  private readonly fb = inject(FormBuilder);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly id = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('id') ?? '')),
    { initialValue: '' },
  );

  private readonly conflictDismiss =
    viewChild<ElementRef<HTMLButtonElement>>('conflictDismiss');
  private readonly editName =
    viewChild<ElementRef<HTMLInputElement>>('editName');

  readonly conflictOpen = signal(false);
  protected readonly editError = signal<string | null>(null);
  protected readonly healths = SERVICE_HEALTHS;

  private readonly detailOptions = computed(() => {
    const id = this.id();
    if (!id) {
      return null;
    }
    return runInInjectionContext(this.injector, () => serviceQuery(id));
  });

  private readonly teamsOptions = runInInjectionContext(this.injector, () =>
    teamsQuery({ limit: 100 }),
  );
  private readonly currentUserOptions = runInInjectionContext(
    this.injector,
    () => currentUserQuery(),
  );
  private readonly updateOptions = runInInjectionContext(this.injector, () =>
    updateServiceMutation(),
  );

  protected readonly detail = injectQuery(() => {
    const options = this.detailOptions();
    return (
      options ?? {
        queryKey: ['opsboard', 'services', 'detail', 'missing'] as const,
        queryFn: async () => {
          throw new Error('missing id');
        },
        enabled: false,
      }
    );
  });

  protected readonly teams = injectQuery(() => this.teamsOptions);
  protected readonly currentUser = injectQuery(() => this.currentUserOptions);
  protected readonly updateMut = injectMutation(() => this.updateOptions);

  readonly editForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', [Validators.required, Validators.maxLength(10000)]],
    teamId: ['', Validators.required],
    health: ['Operational' as ServiceHealth, Validators.required],
  });

  protected readonly canEdit = computed(() => {
    const user = this.currentUser.data();
    return user ? canManage(user.role) : false;
  });

  private lastBoundVersion = signal<RevisionString | null>(null);

  constructor() {
    effect(() => {
      const service = this.detail.data();
      if (!service) {
        return;
      }
      const version = String(service.version);
      untracked(() => {
        // A passive refresh never overwrites unsaved edits; only a pristine
        // form adopts new server values.
        if (this.lastBoundVersion() === version || this.editForm.dirty) {
          return;
        }
        this.bindEditForm(service);
      });
    });
  }

  private bindEditForm(service: ServiceDto): void {
    this.lastBoundVersion.set(service.version);
    this.editForm.reset({
      name: service.name,
      description: service.description,
      teamId: service.teamId,
      health: service.health,
    });
  }

  dismissConflict(): void {
    this.conflictOpen.set(false);
    focusAfterRender(this.injector, () => this.editName()?.nativeElement);
  }

  protected editFieldError(name: string): string | null {
    const field = EDIT_FIELDS.find((candidate) => candidate.name === name);
    return field
      ? fieldErrorMessage(field.label, this.editForm.get(name))
      : null;
  }

  async save(): Promise<void> {
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
    if (!id) {
      return;
    }
    const options = runInInjectionContext(this.injector, () =>
      serviceQuery(id),
    );
    // The version the form was loaded from, so a change made elsewhere since
    // then is rejected as a conflict instead of overwritten.
    const baseline = this.lastBoundVersion();
    if (!baseline) {
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
      if (isConcurrencyConflict(error)) {
        this.conflictOpen.set(true);
        focusAfterRender(
          this.injector,
          () => this.conflictDismiss()?.nativeElement,
        );
        const fresh = await this.queryClient.fetchQuery({
          ...options,
          staleTime: 0,
        });
        this.bindEditForm(fresh);
        return;
      }
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
        this.editError.set(error.detail || error.title || 'Validation failed');
        this.focusEditElement(EDIT_SUMMARY_ID);
        return;
      }
      if (isForbidden(error)) {
        this.editError.set(error.detail || error.title || 'Not allowed');
        this.focusEditElement(EDIT_SUMMARY_ID);
        return;
      }
      this.editError.set('Could not save service.');
      this.focusEditElement(EDIT_SUMMARY_ID);
    }
  }

  private focusEditElement(elementId: string | undefined): void {
    focusFormElement(this.injector, () => this.host.nativeElement, elementId);
  }
}
