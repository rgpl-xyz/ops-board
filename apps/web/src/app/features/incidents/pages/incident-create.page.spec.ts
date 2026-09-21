import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { asRevisionString } from '../../../data-access';
import { IdentityApi } from '../../../data-access/http/identity.api';
import { IncidentsApi } from '../../../data-access/http/incidents.api';
import { ServicesApi } from '../../../data-access/http/services.api';
import { IncidentCreatePage } from './incident-create.page';

describe('IncidentCreatePage', () => {
  const createMock = vi.fn();
  let router: Router;

  beforeEach(async () => {
    createMock.mockReset();
    createMock.mockResolvedValue({
      id: 'new-1',
      title: 'New',
      description: 'Desc',
      serviceId: 's1',
      serviceName: 'API',
      teamId: 't1',
      teamName: 'Platform',
      createdByUserId: 'u1',
      severity: 'High',
      status: 'Investigating',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
      resolvedAt: null,
      version: asRevisionString('1'),
      lifecycleVersion: asRevisionString('1'),
    });

    await TestBed.configureTestingModule({
      imports: [IncidentCreatePage],
      providers: [
        provideRouter([
          { path: 'incidents', children: [] },
          { path: 'incidents/new', component: IncidentCreatePage },
          { path: 'incidents/:id', children: [] },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: IncidentsApi, useValue: { create: createMock } },
        {
          provide: ServicesApi,
          useValue: {
            list: async () => ({
              items: [
                {
                  id: 's1',
                  name: 'API Gateway',
                  description: '',
                  teamId: 't1',
                  teamName: 'Platform',
                  health: 'Operational',
                  createdAt: '2026-08-01T00:00:00Z',
                  updatedAt: '2026-08-01T00:00:00Z',
                  version: asRevisionString('1'),
                },
              ],
              page: 1,
              pageSize: 100,
              totalCount: 1,
              totalPages: 1,
            }),
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

    router = TestBed.inject(Router);
  });

  it('creates an incident and navigates to detail', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(IncidentCreatePage);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(fixture.nativeElement.textContent).toContain('API Gateway'),
    );

    fixture.componentInstance.form.setValue({
      title: 'New incident',
      description: 'Something broke',
      serviceId: 's1',
      severity: 'High',
    });
    await fixture.componentInstance.submit();

    expect(createMock).toHaveBeenCalledWith({
      title: 'New incident',
      description: 'Something broke',
      serviceId: 's1',
      severity: 'High',
    });
    expect(navigateSpy).toHaveBeenCalledWith(['/incidents', 'new-1']);
  });

  it('cancel navigates to list without mutating', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(IncidentCreatePage);
    fixture.componentInstance.cancel();
    expect(createMock).not.toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/incidents']);
  });

  async function mountCreate() {
    const fixture = TestBed.createComponent(IncidentCreatePage);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('API Gateway');
    });
    return fixture;
  }

  it('keeps values, associates messages, and focuses the first invalid field', async () => {
    const fixture = await mountCreate();
    fixture.componentInstance.form.patchValue({
      description: 'Typed body',
      serviceId: 's1',
    });

    await fixture.componentInstance.submit();
    await TestBed.tick();
    fixture.detectChanges();

    expect(createMock).not.toHaveBeenCalled();
    expect(fixture.componentInstance.form.getRawValue().description).toBe(
      'Typed body',
    );

    const title = fixture.nativeElement.querySelector(
      '#title',
    ) as HTMLInputElement;
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(title.getAttribute('aria-describedby')).toBe('title-error');
    const message = fixture.nativeElement.querySelector(
      '#title-error',
    ) as HTMLElement;
    expect(message.textContent).toContain('Title is required.');
    expect(message.getAttribute('role')).toBeNull();
    expect(document.activeElement).toBe(title);

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('maps server field errors to their control and focuses the first one', async () => {
    createMock.mockRejectedValueOnce({
      type: 'urn:opsboard:problem:validation_failed',
      title: 'Validation failed',
      status: 400,
      detail: 'One or more fields are invalid.',
      code: 'validation_failed',
      errors: { description: ['Description is too vague.'] },
    });

    const fixture = await mountCreate();
    fixture.componentInstance.form.setValue({
      title: 'New incident',
      description: 'Broke',
      serviceId: 's1',
      severity: 'High',
    });

    await fixture.componentInstance.submit();
    await TestBed.tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.form.getRawValue().description).toBe(
      'Broke',
    );
    const description = fixture.nativeElement.querySelector(
      '#description',
    ) as HTMLTextAreaElement;
    expect(description.getAttribute('aria-describedby')).toBe(
      'description-error',
    );
    expect(
      (
        fixture.nativeElement.querySelector('#description-error') as HTMLElement
      ).textContent,
    ).toContain('Description is too vague.');
    expect(document.activeElement).toBe(description);
    expect(fixture.nativeElement.querySelectorAll('[role="alert"]')).toHaveLength(
      0,
    );

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('focuses one alert summary when no known field is affected', async () => {
    createMock.mockRejectedValueOnce({
      type: 'urn:opsboard:problem:validation_failed',
      title: 'Validation failed',
      status: 400,
      detail: 'Organization quota reached.',
      code: 'validation_failed',
      errors: { organization: ['Quota reached.'] },
    });

    const fixture = await mountCreate();
    fixture.componentInstance.form.setValue({
      title: 'New incident',
      description: 'Something broke',
      serviceId: 's1',
      severity: 'High',
    });

    await fixture.componentInstance.submit();
    await TestBed.tick();
    fixture.detectChanges();

    const alerts = fixture.nativeElement.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    const summary = fixture.nativeElement.querySelector(
      '#create-form-error',
    ) as HTMLElement;
    expect(summary.textContent).toContain('Organization quota reached.');
    expect(document.activeElement).toBe(summary);
    expect(fixture.componentInstance.form.getRawValue().title).toBe(
      'New incident',
    );

    fixture.destroy();
    fixture.nativeElement.remove();
  });
});
