import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { asRevisionString } from '../../../data-access';
import { IdentityApi } from '../../../data-access/http/identity.api';
import { IncidentsApi } from '../../../data-access/http/incidents.api';
import { LookupsApi } from '../../../data-access/http/lookups.api';
import { ServicesApi } from '../../../data-access/http/services.api';
import { IncidentListPage } from './incident-list.page';

describe('IncidentListPage', () => {
  const listMock = vi.fn();
  let queryParams$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    listMock.mockReset();
    listMock.mockResolvedValue({
      items: [
        {
          id: 'i1',
          title: 'Checkout timeouts',
          serviceId: 's1',
          serviceName: 'Payment Processor',
          teamId: 't1',
          teamName: 'Payments',
          severity: 'Critical',
          status: 'Investigating',
          createdAt: '2026-08-01T00:00:00Z',
          updatedAt: '2026-08-01T01:00:00Z',
          resolvedAt: null,
          version: asRevisionString('1'),
          lifecycleVersion: asRevisionString('1'),
        },
      ],
      page: 1,
      pageSize: 25,
      totalCount: 1,
      totalPages: 1,
    });

    queryParams$ = new BehaviorSubject(
      convertToParamMap({ status: 'Investigating' }),
    );

    await TestBed.configureTestingModule({
      imports: [IncidentListPage],
      providers: [
        provideRouter([{ path: 'incidents', component: IncidentListPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: queryParams$.asObservable(),
            snapshot: { queryParamMap: queryParams$.value },
          },
        },
        {
          provide: IncidentsApi,
          useValue: { list: listMock, getById: vi.fn() },
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
            getOrganization: async () => ({ id: 'o1', name: 'Acme Cloud' }),
          },
        },
      ],
    }).compileComponents();
  });

  it('loads incidents from reactive queryParamMap and shows severity text', async () => {
    const fixture = TestBed.createComponent(IncidentListPage);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Checkout timeouts');
    });

    expect(fixture.nativeElement.textContent).toContain('Critical');
    expect(listMock).toHaveBeenCalled();
    expect(listMock.mock.calls.at(-1)?.[0]).toMatchObject({
      status: 'Investigating',
    });

    queryParams$.next(convertToParamMap({ status: 'Resolved' }));
    fixture.detectChanges();

    await vi.waitFor(() => {
      expect(listMock.mock.calls.at(-1)?.[0]).toMatchObject({
        status: 'Resolved',
      });
    });
  });

  it('commits filter changes through router navigate helpers', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(IncidentListPage);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(fixture.nativeElement.textContent).toContain('Checkout timeouts'),
    );

    fixture.componentInstance.commitFilter({ severity: 'High' });
    expect(navigateSpy).toHaveBeenCalledWith(
      ['/incidents'],
      expect.objectContaining({
        queryParams: expect.objectContaining({
          status: 'Investigating',
          severity: 'High',
        }),
        queryParamsHandling: '',
      }),
    );
  });
});
