import { FormBuilder, Validators } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyServerFieldErrors,
  fieldErrorMessage,
  firstInvalidField,
  type FormFieldRef,
} from './form-focus';

const FIELDS: readonly FormFieldRef[] = [
  { name: 'title', id: 'title', label: 'Title' },
  { name: 'description', id: 'description', label: 'Description' },
  { name: 'serviceId', id: 'serviceId', label: 'Service' },
];

function buildForm(fb: FormBuilder) {
  return fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(5)]],
    description: ['', Validators.required],
    serviceId: ['s1', Validators.required],
  });
}

describe('form-focus helpers', () => {
  let form: ReturnType<typeof buildForm>;

  beforeEach(() => {
    form = buildForm(TestBed.inject(FormBuilder));
  });

  it('reports the first invalid control in form order', () => {
    expect(firstInvalidField(FIELDS, (n) => form.get(n))?.name).toBe('title');

    form.get('title')?.setValue('ok');
    expect(firstInvalidField(FIELDS, (n) => form.get(n))?.name).toBe(
      'description',
    );

    form.get('description')?.setValue('filled');
    expect(firstInvalidField(FIELDS, (n) => form.get(n))).toBeNull();
  });

  it('maps known server field errors and keeps entered values', () => {
    form.setValue({
      title: 'Typed',
      description: 'Typed body',
      serviceId: 's1',
    });

    const affected = applyServerFieldErrors(
      { description: ['Too short.'], unknownField: ['ignored'] },
      FIELDS,
      (n) => form.get(n),
    );

    expect(affected?.name).toBe('description');
    expect(form.get('description')?.errors?.['server']).toBe('Too short.');
    expect(form.get('description')?.touched).toBe(true);
    expect(form.getRawValue()).toEqual({
      title: 'Typed',
      description: 'Typed body',
      serviceId: 's1',
    });
  });

  it('returns null when no known control is affected', () => {
    expect(
      applyServerFieldErrors({ nothingKnown: ['x'] }, FIELDS, (n) =>
        form.get(n),
      ),
    ).toBeNull();
  });

  it('describes touched client and server errors only', () => {
    const title = form.get('title');
    expect(fieldErrorMessage('Title', title)).toBeNull();

    title?.markAsTouched();
    expect(fieldErrorMessage('Title', title)).toBe('Title is required.');

    title?.setValue('far too long');
    expect(fieldErrorMessage('Title', title)).toBe(
      'Title must be at most 5 characters.',
    );

    title?.setErrors({ server: 'Server said no.' });
    expect(fieldErrorMessage('Title', title)).toBe('Server said no.');
  });
});
