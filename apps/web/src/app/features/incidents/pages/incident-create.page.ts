import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  runInInjectionContext,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import {
  injectMutation,
  injectQuery,
} from '@tanstack/angular-query-experimental';

import {
  createIncidentMutation,
  currentUserQuery,
  isValidationFailed,
  type IncidentSeverity,
  servicesQuery,
} from '../../../data-access';
import { INCIDENT_SEVERITIES } from '../../../data-access/contracts/enums';
import { canCreateIncident } from '../utils/incident-actions';
import { CalloutComponent } from '../../../shared/ui/callout.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';

@Component({
  selector: 'ob-incident-create-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    CalloutComponent,
    PageHeaderComponent,
  ],
  templateUrl: './incident-create.page.html',
  styleUrl: './incident-create.page.scss',
})
export class IncidentCreatePage {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  private readonly servicesOptions = runInInjectionContext(this.injector, () =>
    servicesQuery({ pageSize: 100, sort: 'name' }),
  );
  private readonly currentUserOptions = runInInjectionContext(
    this.injector,
    () => currentUserQuery(),
  );
  private readonly createOptions = runInInjectionContext(this.injector, () =>
    createIncidentMutation(),
  );

  protected readonly services = injectQuery(() => this.servicesOptions);
  protected readonly currentUser = injectQuery(() => this.currentUserOptions);
  protected readonly createMut = injectMutation(() => this.createOptions);

  protected readonly severities = INCIDENT_SEVERITIES;
  protected readonly formError = signal<string | null>(null);

  protected readonly canCreate = computed(() => {
    const user = this.currentUser.data();
    return user ? canCreateIncident(user.role) : false;
  });

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', [Validators.required, Validators.maxLength(10000)]],
    serviceId: ['', Validators.required],
    severity: this.fb.nonNullable.control<IncidentSeverity>('High'),
  });

  cancel(): void {
    void this.router.navigate(['/incidents']);
  }

  async submit(): Promise<void> {
    this.formError.set(null);
    if (this.form.invalid || !this.canCreate()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    try {
      const created = await this.createMut.mutateAsync(value);
      await this.router.navigate(['/incidents', created.id]);
    } catch (error) {
      if (isValidationFailed(error)) {
        const errors = error.errors ?? {};
        for (const [key, messages] of Object.entries(errors)) {
          const control = this.form.get(key);
          if (control) {
            control.setErrors({ server: messages.join(' ') });
          }
        }
        this.formError.set(error.detail || error.title || 'Validation failed');
        return;
      }
      this.formError.set('Could not create incident.');
    }
  }
}
