import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { asRevisionString } from '../../../data-access';
import { LookupsApi } from '../../../data-access/http/lookups.api';
import { ServicesApi } from '../../../data-access/http/services.api';
import { ServiceListPage } from './service-list.page';

describe('ServiceListPage', () => {
  const listMock = vi.fn();
  let queryParams$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    listMock.mockReset();
    listMock.mockResolvedValue({
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
      pageSize: 25,
      totalCount: 1,
      totalPages: 1,
    });

    queryParams$ = new BehaviorSubject(convertToParamMap({ health: 'Outage' }));

    await TestBed.configureTestingModule({
      imports: [ServiceListPage],
      providers: [
        provideRouter([{ path: 'services', component: ServiceListPage }]),
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
          provide: ServicesApi,
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
      ],
    }).compileComponents();
  });

  it('loads services from reactive queryParamMap with health text cue', async () => {
    const fixture = TestBed.createComponent(ServiceListPage);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Payment Processor');
    });

    expect(fixture.nativeElement.textContent).toContain('Outage');
    expect(listMock.mock.calls.at(-1)?.[0]).toMatchObject({ health: 'Outage' });

    queryParams$.next(convertToParamMap({ health: 'Degraded' }));
    fixture.detectChanges();
    await vi.waitFor(() => {
      expect(listMock.mock.calls.at(-1)?.[0]).toMatchObject({
        health: 'Degraded',
      });
    });
  });

  it('commits filters through service list navigate helper', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(ServiceListPage);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(fixture.nativeElement.textContent).toContain('Payment Processor'),
    );

    fixture.componentInstance.commitFilter({ teamId: 't1' });
    expect(navigateSpy).toHaveBeenCalledWith(
      ['/services'],
      expect.objectContaining({
        queryParams: expect.objectContaining({
          health: 'Outage',
          teamId: 't1',
        }),
        queryParamsHandling: '',
      }),
    );
  });
});
