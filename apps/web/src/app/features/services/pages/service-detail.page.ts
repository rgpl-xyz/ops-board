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
  isConcurrencyConflict,
  isForbidden,
  isValidationFailed,
  SERVICE_HEALTHS,
  serviceQuery,
  teamsQuery,
  updateServiceMutation,
  type ServiceDto,
  type ServiceHealth,
} from '../../../data-access';
import { canManage } from '../../../shared/permissions/capabilities';
import { CalloutComponent } from '../../../shared/ui/callout.component';
import { HealthBadgeComponent } from '../../../shared/ui/health-badge.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';

@Component({
  selector: 'ob-service-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    CalloutComponent,
    HealthBadgeComponent,
    PageHeaderComponent,
  ],
  templateUrl: './service-detail.page.html',
  styleUrl: './service-detail.page.scss',
})
export class ServiceDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly queryClient = inject(QueryClient);
  private readonly fb = inject(FormBuilder);

  protected readonly id = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('id') ?? '')),
    { initialValue: '' },
  );

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

  private lastBoundVersion = signal<string | null>(null);

  constructor() {
    effect(() => {
      const service = this.detail.data();
      if (!service) {
        return;
      }
      const version = String(service.version);
      untracked(() => {
        if (this.lastBoundVersion() === version) {
          return;
        }
        this.lastBoundVersion.set(version);
        this.editForm.reset({
          name: service.name,
          description: service.description,
          teamId: service.teamId,
          health: service.health,
        });
      });
    });
  }

  dismissConflict(): void {
    this.conflictOpen.set(false);
  }

  async save(): Promise<void> {
    this.editError.set(null);
    if (this.conflictOpen() || this.editForm.invalid || !this.canEdit()) {
      this.editForm.markAllAsTouched();
      return;
    }
    const id = this.id();
    if (!id) {
      return;
    }
    const options = runInInjectionContext(this.injector, () =>
      serviceQuery(id),
    );
    const service =
      this.queryClient.getQueryData<ServiceDto>(options.queryKey) ??
      this.detail.data();
    if (!service) {
      return;
    }
    const value = this.editForm.getRawValue();
    try {
      await this.updateMut.mutateAsync({
        id,
        body: {
          ...value,
          expectedVersion: service.version,
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
          name: fresh.name,
          description: fresh.description,
          teamId: fresh.teamId,
          health: fresh.health,
        });
        return;
      }
      if (isValidationFailed(error)) {
        this.editError.set(error.detail || error.title || 'Validation failed');
        return;
      }
      if (isForbidden(error)) {
        this.editError.set(error.detail || error.title || 'Not allowed');
        return;
      }
      this.editError.set('Could not save service.');
    }
  }
}
