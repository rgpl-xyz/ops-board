import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { asRevisionString, opsboardKeys } from '../../../data-access';
import { IdentityApi } from '../../../data-access/http/identity.api';
import { LookupsApi } from '../../../data-access/http/lookups.api';
import { ServicesApi } from '../../../data-access/http/services.api';
import { ServiceDetailPage } from './service-detail.page';

function serviceDto(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    name: 'Payment Processor',
    description: 'Authorizes checkout payments',
    teamId: 't1',
    teamName: 'Payments',
    health: 'Outage',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    version: asRevisionString('2'),
    ...overrides,
  };
}

describe('ServiceDetailPage', () => {
  const getById = vi.fn();
  const update = vi.fn();

  beforeEach(async () => {
    getById.mockReset();
    update.mockReset();
    getById.mockResolvedValue(serviceDto());

    const params$ = new BehaviorSubject(convertToParamMap({ id: 's1' }));

    await TestBed.configureTestingModule({
      imports: [ServiceDetailPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: params$.asObservable(),
            snapshot: { paramMap: params$.value },
          },
        },
        {
          provide: ServicesApi,
          useValue: { getById, update },
        },
        {
          provide: LookupsApi,
          useValue: {
            listTeams: async () => ({
              items: [{ id: 't1', name: 'Payments' }],
              nextAfter: null,
            }),
            listUsers: async () => ({ items: [], nextAfter: null }),
          },
        },
        {
          provide: IdentityApi,
          useValue: {
            getCurrentUser: async () => ({
              userId: 'u1',
              organizationId: 'o1',
              displayName: 'Veyo R',
              role: 'IncidentManager',
              demo: true,
            }),
            getOrganization: async () => ({ id: 'o1', name: 'Acme' }),
          },
        },
      ],
    }).compileComponents();
  });

  it('shows service summary, health text, and incidents link', async () => {
    const fixture = TestBed.createComponent(ServiceDetailPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Payment Processor');
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Outage');
    expect(text).toContain('View incidents for this service');
    const link = fixture.nativeElement.querySelector(
      'a[href*="serviceId=s1"]',
    ) as HTMLAnchorElement | null;
    expect(link).toBeTruthy();
  });

  it('marks its loading branch as a named route-focus context', () => {
    const fixture = TestBed.createComponent(ServiceDetailPage);
    fixture.detectChanges();

    const target = fixture.nativeElement.querySelector(
      '[data-ob-route-focus]',
    ) as HTMLElement;
    expect(target.getAttribute('tabindex')).toBe('-1');
    expect(target.getAttribute('aria-label')).toBe('Loading service details');
  });

  it('saves with the version the form was loaded from and recovers from 409', async () => {
    update.mockRejectedValueOnce({
      type: 'urn:opsboard:problem:concurrency_conflict',
      title: 'Conflict',
      status: 409,
      detail: 'stale',
      code: 'concurrency_conflict',
    });
    getById
      .mockResolvedValueOnce(serviceDto())
      .mockResolvedValue(
        serviceDto({
          name: 'Server name',
          version: asRevisionString('9'),
        }),
      );

    const fixture = TestBed.createComponent(ServiceDetailPage);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(fixture.nativeElement.textContent).toContain('Update service'),
    );

    fixture.componentInstance.editForm.setValue({
      name: 'Stale draft',
      description: 'Authorizes checkout payments',
      teamId: 't1',
      health: 'Outage',
    });
    await fixture.componentInstance.save();
    expect(fixture.componentInstance.conflictOpen()).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.editForm.value.name).toBe('Server name');

    await fixture.componentInstance.save();
    expect(update).toHaveBeenCalledTimes(1);

    fixture.componentInstance.dismissConflict();
    update.mockResolvedValue(
      serviceDto({ name: 'Retry', version: asRevisionString('10') }),
    );
    fixture.componentInstance.editForm.setValue({
      name: 'Retry',
      description: 'Authorizes checkout payments',
      teamId: 't1',
      health: 'Degraded',
    });
    await fixture.componentInstance.save();
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1]?.[1]).toMatchObject({
      name: 'Retry',
      health: 'Degraded',
      expectedVersion: asRevisionString('9'),
    });
  });

  async function mountEditable() {
    const fixture = TestBed.createComponent(ServiceDetailPage);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Update service');
    });
    return fixture;
  }

  /** Mirrors a background refetch landing in the cache. */
  function passiveDetail(overrides: Record<string, unknown>) {
    TestBed.inject(QueryClient).setQueryData(
      opsboardKeys.services.detail('s1'),
      serviceDto(overrides),
    );
  }

  function typeName(fixture: { nativeElement: HTMLElement; detectChanges(): void }, value: string) {
    const input = fixture.nativeElement.querySelector('#svc-name') as HTMLInputElement;
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    return input;
  }

  it('keeps unsaved edits, dirty state, and focus across a passive refresh', async () => {
    const fixture = await mountEditable();
    const input = typeName(fixture, 'Half typed name');
    fixture.componentInstance.editForm.controls.health.setValue('Degraded');
    fixture.componentInstance.editForm.controls.health.markAsDirty();
    expect(fixture.componentInstance.editForm.dirty).toBe(true);

    passiveDetail({
      name: 'Server renamed',
      description: 'Server description',
      health: 'Operational',
      version: asRevisionString('5'),
    });
    // The refresh really landed: the page header shows the new name.
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Server renamed');
    });

    expect(fixture.componentInstance.editForm.getRawValue()).toEqual({
      name: 'Half typed name',
      description: 'Authorizes checkout payments',
      teamId: 't1',
      health: 'Degraded',
    });
    expect(fixture.componentInstance.editForm.dirty).toBe(true);
    expect(input.value).toBe('Half typed name');
    expect(document.activeElement).toBe(input);

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('adopts fresh server values while the edit form is pristine', async () => {
    const fixture = await mountEditable();

    passiveDetail({
      name: 'Server renamed',
      health: 'Operational',
      version: asRevisionString('5'),
    });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.componentInstance.editForm.getRawValue().name).toBe('Server renamed');
    });

    expect(fixture.componentInstance.editForm.getRawValue().health).toBe('Operational');
    expect(fixture.componentInstance.editForm.pristine).toBe(true);

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('saves a dirty form with the version it was loaded from after a passive refresh', async () => {
    update.mockResolvedValue(serviceDto({ version: asRevisionString('6') }));
    const fixture = await mountEditable();
    typeName(fixture, 'Half typed name');

    passiveDetail({ name: 'Server renamed', version: asRevisionString('5') });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Server renamed');
    });

    await fixture.componentInstance.save();

    // Loaded at 2: the server must still be able to reject this as stale.
    expect(update.mock.calls[0]?.[1]).toMatchObject({
      name: 'Half typed name',
      expectedVersion: asRevisionString('2'),
    });

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('bases the next save on the version a successful save returned', async () => {
    update
      .mockResolvedValueOnce(serviceDto({ name: 'First edit', version: asRevisionString('3') }))
      .mockResolvedValueOnce(serviceDto({ name: 'Second edit', version: asRevisionString('4') }));
    const fixture = await mountEditable();

    fixture.componentInstance.editForm.controls.name.setValue('First edit');
    fixture.componentInstance.editForm.markAsDirty();
    await fixture.componentInstance.save();
    fixture.detectChanges();

    fixture.componentInstance.editForm.controls.name.setValue('Second edit');
    fixture.componentInstance.editForm.markAsDirty();
    await fixture.componentInstance.save();

    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0]?.[1]?.expectedVersion).toEqual(asRevisionString('2'));
    expect(update.mock.calls[1]?.[1]?.expectedVersion).toEqual(asRevisionString('3'));

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('focuses its conflict recovery action and returns focus on dismiss', async () => {
    update.mockRejectedValueOnce({
      type: 'urn:opsboard:problem:concurrency_conflict',
      title: 'Conflict',
      status: 409,
      detail: 'stale',
      code: 'concurrency_conflict',
    });
    getById
      .mockResolvedValueOnce(serviceDto())
      .mockResolvedValue(
        serviceDto({ name: 'Server name', version: asRevisionString('9') }),
      );

    const fixture = TestBed.createComponent(ServiceDetailPage);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Update service');
    });

    fixture.componentInstance.editForm.setValue({
      name: 'Stale draft',
      description: 'Authorizes checkout payments',
      teamId: 't1',
      health: 'Outage',
    });
    await fixture.componentInstance.save();
    await TestBed.tick();
    fixture.detectChanges();

    const alerts = fixture.nativeElement.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);

    const recovery = alerts[0].querySelector('button') as HTMLButtonElement;
    expect(document.activeElement).toBe(recovery);

    recovery.click();
    await TestBed.tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.conflictOpen()).toBe(false);
    expect(document.activeElement).toBe(
      fixture.nativeElement.querySelector('#svc-name'),
    );

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('focuses the first invalid control and one summary for a general failure', async () => {
    const fixture = TestBed.createComponent(ServiceDetailPage);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Update service');
    });

    const name = fixture.nativeElement.querySelector(
      '#svc-name',
    ) as HTMLInputElement;
    name.value = '';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    await fixture.componentInstance.save();
    await TestBed.tick();
    fixture.detectChanges();

    expect(update).not.toHaveBeenCalled();
    expect(name.getAttribute('aria-describedby')).toBe('svc-name-error');
    expect(document.activeElement).toBe(name);

    fixture.componentInstance.editForm.setValue({
      name: 'Payment Processor',
      description: 'Authorizes checkout payments',
      teamId: 't1',
      health: 'Outage',
    });
    update.mockRejectedValueOnce({
      type: 'urn:opsboard:problem:validation_failed',
      title: 'Validation failed',
      status: 400,
      detail: 'Service cannot be updated right now.',
      code: 'validation_failed',
      errors: { organization: ['Quota reached.'] },
    });

    await fixture.componentInstance.save();
    await TestBed.tick();
    fixture.detectChanges();

    const alerts = fixture.nativeElement.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    const summary = fixture.nativeElement.querySelector(
      '#svc-edit-error',
    ) as HTMLElement;
    expect(document.activeElement).toBe(summary);
    expect(fixture.componentInstance.editForm.getRawValue().name).toBe(
      'Payment Processor',
    );

    fixture.destroy();
    fixture.nativeElement.remove();
  });
});
