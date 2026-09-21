import { Injector } from '@angular/core';
import type { AbstractControl } from '@angular/forms';

import { focusAfterRender } from './focus';

/** One selected form control: reactive name, stable DOM id, message label. */
export interface FormFieldRef {
  readonly name: string;
  readonly id: string;
  readonly label: string;
}

type ControlLookup = (name: string) => AbstractControl | null;

/** The first invalid control in the given visual form order. */
export function firstInvalidField(
  fields: readonly FormFieldRef[],
  control: ControlLookup,
): FormFieldRef | null {
  return fields.find((field) => control(field.name)?.invalid === true) ?? null;
}

/**
 * Apply ProblemDetails field errors to the controls that own them and report
 * the first affected field in form order. Entered values are never replaced.
 */
export function applyServerFieldErrors(
  errors: Readonly<Record<string, readonly string[]>>,
  fields: readonly FormFieldRef[],
  control: ControlLookup,
): FormFieldRef | null {
  let first: FormFieldRef | null = null;

  for (const field of fields) {
    const messages = errors[field.name];
    const target = control(field.name);
    if (!messages?.length || !target) {
      continue;
    }

    target.setErrors({ ...(target.errors ?? {}), server: messages.join(' ') });
    target.markAsTouched();
    first ??= field;
  }

  return first;
}

/** Focus a form element by id once it has rendered, if it is still present. */
export function focusFormElement(
  injector: Injector,
  root: () => HTMLElement | null | undefined,
  elementId: string | null | undefined,
): void {
  if (!elementId) {
    return;
  }

  focusAfterRender(injector, () =>
    root()?.querySelector<HTMLElement>(`#${elementId}`),
  );
}

/** The message a field should describe, or null while it has nothing to say. */
export function fieldErrorMessage(
  label: string,
  control: AbstractControl | null,
): string | null {
  if (!control?.touched || !control.errors) {
    return null;
  }

  const errors = control.errors;
  const server = errors['server'];
  if (typeof server === 'string' && server !== '') {
    return server;
  }
  if (errors['required']) {
    return `${label} is required.`;
  }

  const maxLength = errors['maxlength'] as
    | { requiredLength?: number }
    | undefined;
  if (maxLength?.requiredLength) {
    return `${label} must be at most ${maxLength.requiredLength} characters.`;
  }

  return `${label} is not valid.`;
}
