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
  const teamsMock = vi.fn();
  let queryParams$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    listMock.mockReset();
    teamsMock.mockReset();
    teamsMock.mockResolvedValue({ items: [{ id: 't1', name: 'Payments' }], nextAfter: null });
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
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false } } }),
        ),
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
            listTeams: teamsMock,
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

  it('shows when each incident was created, the order the list defaults to', async () => {
    const fixture = await mountList();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Checkout timeouts');
    });
    const el = fixture.nativeElement as HTMLElement;
    const headers = [...el.querySelectorAll('thead th')].map((th) => th.textContent?.trim());

    expect(headers).toContain('Created (UTC)');
    expect(headers).not.toContain('Updated (UTC)');
    expect(el.querySelector('tbody time')?.getAttribute('datetime')).toBe(
      '2026-08-01T00:00:00Z',
    );
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

  function clearButton(fixture: { nativeElement: HTMLElement }): HTMLButtonElement {
    return [...fixture.nativeElement.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Clear filters',
    ) as HTMLButtonElement;
  }

  it('keeps Clear filters in place but disabled when nothing is filtered', async () => {
    queryParams$.next(convertToParamMap({ sort: 'severity' }));
    const fixture = await mountList();
    fixture.detectChanges();

    expect(clearButton(fixture).disabled).toBe(true);
  });

  it('clears filters and search but keeps the sort, then focuses the first filter', async () => {
    queryParams$.next(
      convertToParamMap({
        status: 'Investigating',
        severity: 'High',
        search: 'checkout',
        sort: 'severity',
        direction: 'asc',
      }),
    );
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = await mountList();
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();

    const clear = clearButton(fixture);
    expect(clear.disabled).toBe(false);
    clear.click();

    const params = navigateSpy.mock.calls.at(-1)?.[1]?.queryParams as Record<string, unknown>;
    expect(params).toMatchObject({ sort: 'severity', direction: 'asc' });
    for (const key of ['status', 'severity', 'serviceId', 'teamId', 'search', 'page']) {
      expect(params[key] ?? null).toBeNull();
    }
    expect(document.activeElement).toBe(
      fixture.nativeElement.querySelector('select[name="status"]'),
    );

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  async function mountList() {
    const fixture = TestBed.createComponent(IncidentListPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(listMock).toHaveBeenCalled();
    });
    return fixture;
  }

  it('requests the sort and direction it is given', async () => {
    queryParams$.next(
      convertToParamMap({ sort: 'severity', direction: 'asc', pageSize: '10' }),
    );
    await mountList();

    await vi.waitFor(() => {
      expect(listMock.mock.calls.at(-1)?.[0]).toMatchObject({
        sort: 'severity',
        direction: 'asc',
        pageSize: 10,
      });
    });
  });

  it('moves page while preserving the active filters', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = await mountList();

    fixture.componentInstance.onPage(1);

    expect(navigateSpy).toHaveBeenCalledWith(
      ['/incidents'],
      expect.objectContaining({
        queryParams: expect.objectContaining({
          status: 'Investigating',
          // The mapper stringifies and omits defaults, so page 2 arrives as '2'.
          page: '2',
        }),
      }),
    );
  });

  it('renders its empty state with a way out when no incident matches', async () => {
    listMock.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      totalCount: 0,
      totalPages: 0,
    });
    const fixture = await mountList();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No incidents match these filters');
    });
    const state = fixture.nativeElement.querySelector('.list-state') as HTMLElement;
    expect(state.getAttribute('role')).toBe('status');
    // The fixture route carries a filter, so the state offers to clear it.
    expect(state.querySelector('button')?.textContent?.trim()).toBe('Clear filters');
  });

  it('renders its error state with a retry that recovers the list', async () => {
    listMock.mockRejectedValueOnce({
      type: 'urn:opsboard:problem:unavailable',
      title: 'Unavailable',
      status: 503,
      detail: 'Database is down.',
      code: 'unavailable',
    });
    const fixture = await mountList();
    document.body.append(fixture.nativeElement);
    const el = fixture.nativeElement as HTMLElement;

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector('[role="alert"]')?.textContent).toContain('Could not load incidents');
    });
    const retry = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Try again')!;
    retry.click();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.textContent).toContain('Checkout timeouts');
      expect(document.activeElement).toBe(el.querySelector('tbody a'));
    });
    expect(el.querySelector('[role="alert"]')).toBeNull();

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('shows placeholder rows under the real header while the list loads', async () => {
    listMock.mockReturnValue(new Promise(() => undefined));
    const fixture = TestBed.createComponent(IncidentListPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('thead th').length).toBeGreaterThan(0);
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.getAttribute('aria-hidden')).toBe('true');
    }
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Loading incidents…');
  });
  it('keeps a failed filter lookup in line as an unavailable field with a retry', async () => {
    teamsMock.mockRejectedValueOnce({
      type: 'urn:opsboard:problem:unavailable',
      title: 'Unavailable',
      status: 503,
      detail: 'Database is down.',
      code: 'unavailable',
    });
    const fixture = await mountList();
    document.body.append(fixture.nativeElement);
    const el = fixture.nativeElement as HTMLElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.textContent).toContain('Could not load teams.');
    });

    const team = el.querySelector('select[name="teamId"]') as HTMLSelectElement;
    expect(team.disabled).toBe(true);
    expect(team.selectedOptions[0]?.textContent?.trim()).toBe('Unavailable');
    expect(el.querySelector(`#${team.getAttribute('aria-describedby')}`)?.textContent).toContain(
      'Could not load teams.',
    );
    // The page's own failure state is untouched by a lookup failure.
    expect(el.querySelector('[role="alert"]')).toBeNull();

    const retry = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Retry')!;
    retry.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      const restored = el.querySelector('select[name="teamId"]') as HTMLSelectElement;
      expect(restored.disabled).toBe(false);
      expect(restored.textContent).toContain('Payments');
      expect(document.activeElement).toBe(restored);
    });
    expect(teamsMock).toHaveBeenCalledTimes(2);

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('shows the committed search text in its search field', async () => {
    queryParams$.next(convertToParamMap({ search: 'payments' }));
    const fixture = await mountList();

    await vi.waitFor(() => {
      fixture.detectChanges();
      const input = fixture.nativeElement.querySelector(
        'input[type="search"], #search',
      ) as HTMLInputElement | null;
      expect(input?.value).toBe('payments');
    });
  });
});
