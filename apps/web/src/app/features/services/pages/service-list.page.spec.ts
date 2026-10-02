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
  const teamsMock = vi.fn();
  let queryParams$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    listMock.mockReset();
    teamsMock.mockReset();
    teamsMock.mockResolvedValue({ items: [{ id: 't1', name: 'Payments' }], nextAfter: null });
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
          provide: ServicesApi,
          useValue: { list: listMock, getById: vi.fn() },
        },
        {
          provide: LookupsApi,
          useValue: {
            listTeams: teamsMock,
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

  async function mountList() {
    const fixture = TestBed.createComponent(ServiceListPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(listMock).toHaveBeenCalled();
    });
    return fixture;
  }

  function clearButton(fixture: { nativeElement: HTMLElement }): HTMLButtonElement {
    return [...fixture.nativeElement.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Clear filters',
    ) as HTMLButtonElement;
  }

  it('keeps Clear filters in place but disabled when nothing is filtered', async () => {
    queryParams$.next(convertToParamMap({ sort: 'health', direction: 'desc' }));
    const fixture = await mountList();
    fixture.detectChanges();

    expect(clearButton(fixture).disabled).toBe(true);
  });

  it('clears filters and search but keeps the sort, then focuses the first filter', async () => {
    queryParams$.next(
      convertToParamMap({
        health: 'Outage',
        teamId: 't1',
        search: 'pay',
        sort: 'health',
        direction: 'desc',
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
    expect(params).toMatchObject({ sort: 'health', direction: 'desc' });
    for (const key of ['health', 'teamId', 'search', 'page']) {
      expect(params[key] ?? null).toBeNull();
    }
    expect(document.activeElement).toBe(
      fixture.nativeElement.querySelector('select[name="health"]'),
    );

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  /// `name` is the default sort, so it is omitted and only the direction and
  /// page size vary here.
  it('requests the direction and page size it is given', async () => {
    queryParams$.next(convertToParamMap({ direction: 'desc', pageSize: '10' }));
    await mountList();

    await vi.waitFor(() => {
      // sort is omitted from the query when it equals the default.
      expect(listMock.mock.calls.at(-1)?.[0]).toMatchObject({
        direction: 'desc',
        pageSize: 10,
      });
    });
  });

  it('reads health and recency most-urgent first and names from A to Z', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = await mountList();

    fixture.componentInstance.commitSort('health');
    expect(navigateSpy).toHaveBeenLastCalledWith(
      ['/services'],
      expect.objectContaining({
        queryParams: expect.objectContaining({ sort: 'health', direction: 'desc' }),
      }),
    );

    fixture.componentInstance.commitSort('updatedAt');
    expect(navigateSpy).toHaveBeenLastCalledWith(
      ['/services'],
      expect.objectContaining({
        queryParams: expect.objectContaining({ sort: 'updatedAt', direction: 'desc' }),
      }),
    );

    fixture.componentInstance.commitSort('name');
    const last = navigateSpy.mock.calls.at(-1)?.[1]?.queryParams as Record<string, unknown>;
    expect(last['sort']).toBeUndefined();
    expect(last['direction']).toBeUndefined();
  });

  it('moves page while preserving the active filters', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = await mountList();

    fixture.componentInstance.onPage(1);

    expect(navigateSpy).toHaveBeenCalledWith(
      ['/services'],
      expect.objectContaining({
        // The mapper stringifies and omits defaults, so page 2 arrives as '2'.
        queryParams: expect.objectContaining({ page: '2' }),
      }),
    );
  });

  it('keeps a failed team lookup in line as an unavailable field with a retry', async () => {
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
    expect(team.getAttribute('aria-describedby')).toBe('teams-unavailable');

    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Retry')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      const restored = el.querySelector('select[name="teamId"]') as HTMLSelectElement;
      expect(restored.disabled).toBe(false);
      expect(document.activeElement).toBe(restored);
    });

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('renders its empty state when no service matches', async () => {
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
      expect(fixture.nativeElement.textContent).toContain(
        'No services match these filters',
      );
    });
  });

  it('renders its error state when the list cannot be loaded', async () => {
    listMock.mockRejectedValue({
      type: 'urn:opsboard:problem:unavailable',
      title: 'Unavailable',
      status: 503,
      detail: 'Database is down.',
      code: 'unavailable',
    });
    const fixture = await mountList();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain(
        'Could not load services',
      );
    });
  });
});
