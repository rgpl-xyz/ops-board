import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { asRevisionString } from '../../../data-access';
import { IdentityApi } from '../../../data-access/http/identity.api';
import { IncidentsApi } from '../../../data-access/http/incidents.api';
import { ServicesApi } from '../../../data-access/http/services.api';
import { IncidentDetailPage } from './incident-detail.page';

function detailDto(overrides: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    title: 'Checkout timeouts',
    description: 'Payments failing',
    serviceId: 's1',
    serviceName: 'Payment Processor',
    teamId: 't1',
    teamName: 'Payments',
    createdByUserId: 'u1',
    severity: 'Critical',
    status: 'Investigating',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T01:00:00Z',
    resolvedAt: null,
    version: asRevisionString('2'),
    lifecycleVersion: asRevisionString('3'),
    ...overrides,
  };
}

describe('IncidentDetailPage', () => {
  const updateMock = vi.fn();
  const getById = vi.fn();

  beforeEach(async () => {
    updateMock.mockReset();
    getById.mockReset();
    getById.mockResolvedValue(detailDto());

    const params$ = new BehaviorSubject(convertToParamMap({ id: 'i1' }));

    await TestBed.configureTestingModule({
      imports: [IncidentDetailPage],
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
          provide: IncidentsApi,
          useValue: {
            getById,
            update: updateMock,
            listResponders: async () => ({
              items: [
                {
                  userId: 'u1',
                  displayName: 'Veyo R',
                  joinedAt: '2026-08-01T00:30:00Z',
                },
              ],
              nextAfter: null,
            }),
            listTimeline: async () => ({
              items: [
                {
                  id: 'e1',
                  sequence: asRevisionString('2'),
                  occurredAt: '2026-08-01T00:40:00Z',
                  actorUserId: 'u1',
                  actorDisplayName: 'Veyo R',
                  type: 'WrittenUpdate',
                  kind: 'writtenUpdate',
                  body: 'Investigating authz path',
                  fromStatus: null,
                  toStatus: null,
                  fromSeverity: null,
                  toSeverity: null,
                },
                {
                  id: 'e0',
                  sequence: asRevisionString('1'),
                  occurredAt: '2026-08-01T00:00:00Z',
                  actorUserId: 'u1',
                  actorDisplayName: 'Veyo R',
                  type: 'IncidentCreated',
                  kind: 'system',
                  body: null,
                  fromStatus: null,
                  toStatus: 'Investigating',
                  fromSeverity: null,
                  toSeverity: 'Critical',
                },
              ],
              page: 1,
              pageSize: 25,
              totalCount: 2,
              totalPages: 1,
            }),
          },
        },
        {
          provide: ServicesApi,
          useValue: {
            list: async () => ({
              items: [
                {
                  id: 's1',
                  name: 'Payment Processor',
                  description: '',
                  teamId: 't1',
                  teamName: 'Payments',
                  health: 'Outage',
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
  });

  it('shows summary, responders, and written vs system timeline', async () => {
    const fixture = TestBed.createComponent(IncidentDetailPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Checkout timeouts');
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Critical');
    expect(text).toContain('Veyo R');
    expect(text).toContain('Written update');
    expect(text).toContain('System · IncidentCreated');
  });

  it('saves details with expectedVersion from Query data', async () => {
    updateMock.mockResolvedValue(
      detailDto({ title: 'Updated', version: asRevisionString('3') }),
    );
    const fixture = TestBed.createComponent(IncidentDetailPage);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(fixture.nativeElement.textContent).toContain('Edit details'),
    );

    fixture.componentInstance.editForm.setValue({
      title: 'Updated',
      description: 'Payments failing',
      serviceId: 's1',
    });
    await fixture.componentInstance.saveDetails();

    expect(updateMock).toHaveBeenCalledWith('i1', {
      title: 'Updated',
      description: 'Payments failing',
      serviceId: 's1',
      expectedVersion: asRevisionString('2'),
    });
  });

  it('handles concurrency conflict without auto-resubmit', async () => {
    updateMock.mockRejectedValueOnce({
      type: 'urn:opsboard:problem:concurrency_conflict',
      title: 'Conflict',
      status: 409,
      detail: 'stale',
      code: 'concurrency_conflict',
    });
    getById
      .mockResolvedValueOnce(detailDto())
      .mockResolvedValue(
        detailDto({
          title: 'Server title',
          version: asRevisionString('9'),
        }),
      );

    const fixture = TestBed.createComponent(IncidentDetailPage);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(fixture.nativeElement.textContent).toContain('Edit details'),
    );

    fixture.componentInstance.editForm.setValue({
      title: 'Stale draft',
      description: 'Payments failing',
      serviceId: 's1',
    });
    await fixture.componentInstance.saveDetails();
    fixture.detectChanges();

    expect(fixture.componentInstance.conflictOpen()).toBe(true);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.editForm.value.title).toBe('Server title');

    await fixture.componentInstance.saveDetails();
    expect(updateMock).toHaveBeenCalledTimes(1);

    fixture.componentInstance.dismissConflict();
    updateMock.mockResolvedValue(
      detailDto({ title: 'Retry', version: asRevisionString('10') }),
    );
    fixture.componentInstance.editForm.setValue({
      title: 'Retry',
      description: 'Payments failing',
      serviceId: 's1',
    });
    await fixture.componentInstance.saveDetails();
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock.mock.calls[1]?.[1]?.expectedVersion).toEqual(
      asRevisionString('9'),
    );
  });
});
