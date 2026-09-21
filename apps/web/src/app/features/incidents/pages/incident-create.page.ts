import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
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
import {
  applyServerFieldErrors,
  fieldErrorMessage,
  firstInvalidField,
  focusFormElement,
  type FormFieldRef,
} from '../../../shared/a11y/form-focus';
import { CalloutComponent } from '../../../shared/ui/callout.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';

const FIELDS: readonly FormFieldRef[] = [
  { name: 'title', id: 'title', label: 'Title' },
  { name: 'description', id: 'description', label: 'Description' },
  { name: 'serviceId', id: 'serviceId', label: 'Service' },
  { name: 'severity', id: 'severity', label: 'Severity' },
];

const SUMMARY_ID = 'create-form-error';

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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

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

  protected fieldError(name: string): string | null {
    const field = FIELDS.find((candidate) => candidate.name === name);
    return field ? fieldErrorMessage(field.label, this.form.get(name)) : null;
  }

  cancel(): void {
    void this.router.navigate(['/incidents']);
  }

  async submit(): Promise<void> {
    this.formError.set(null);
    if (this.form.invalid || !this.canCreate()) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid();
      return;
    }
    const value = this.form.getRawValue();
    try {
      const created = await this.createMut.mutateAsync(value);
      await this.router.navigate(['/incidents', created.id]);
    } catch (error) {
      if (isValidationFailed(error)) {
        const affected = applyServerFieldErrors(
          error.errors ?? {},
          FIELDS,
          (name) => this.form.get(name),
        );
        if (affected) {
          this.focusField(affected.id);
          return;
        }
        this.formError.set(error.detail || error.title || 'Validation failed');
        this.focusField(SUMMARY_ID);
        return;
      }
      this.formError.set('Could not create incident.');
      this.focusField(SUMMARY_ID);
    }
  }

  private focusFirstInvalid(): void {
    const field = firstInvalidField(FIELDS, (name) => this.form.get(name));
    this.focusField(field?.id);
  }

  private focusField(elementId: string | undefined): void {
    focusFormElement(this.injector, () => this.host.nativeElement, elementId);
  }
}
