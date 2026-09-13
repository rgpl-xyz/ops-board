import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  provideTanStackQuery,
  QueryClient,
  type CreateMutationOptions,
} from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { asRevisionString } from '../contracts/common';
import type { IncidentDetailDto } from '../contracts/incidents';
import {
  changeSeverityMutation,
  changeStatusMutation,
  createIncidentMutation,
  reopenIncidentMutation,
  resolveIncidentMutation,
  updateIncidentMutation,
} from './incidents.mutations';
import { opsboardKeys } from './keys';

const detail: IncidentDetailDto = {
  id: 'i1',
  title: 'Outage',
  description: 'down',
  serviceId: 's1',
  serviceName: 'API',
  teamId: 't1',
  teamName: 'Platform',
  createdByUserId: 'u1',
  severity: 'High',
  status: 'Investigating',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  resolvedAt: null,
  version: asRevisionString('1'),
  lifecycleVersion: asRevisionString('1'),
};

async function runMutation<TData, TError, TVariables>(
  queryClient: QueryClient,
  options: CreateMutationOptions<TData, TError, TVariables>,
  variables: TVariables,
): Promise<TData> {
  const context = { client: queryClient } as never;
  try {
    const data = await options.mutationFn!(variables, context);
    await options.onSuccess?.(data, variables, undefined, context);
    return data;
  } catch (error) {
    await options.onError?.(error as TError, variables, undefined, context);
    throw error;
  }
}

describe('incident scalar mutations', () => {
  let http: HttpTestingController;
  let queryClient: QueryClient;

  beforeEach(() => {
    TestBed.resetTestingModule();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(queryClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    queryClient.clear();
    TestBed.resetTestingModule();
  });

  it('create/update write detail and invalidate lists; retry stays false', async () => {
    const listKey = opsboardKeys.incidents.list({ page: 1 });
    queryClient.setQueryData(listKey, {
      items: [],
      page: 1,
      pageSize: 25,
      totalCount: 0,
      totalPages: 0,
    });

    const createOptions = TestBed.runInInjectionContext(() =>
      createIncidentMutation(),
    );
    expect(createOptions.retry).toBe(false);
    const createPending = runMutation(queryClient, createOptions, {
      title: 'Outage',
      description: 'down',
      serviceId: 's1',
      severity: 'High',
    });
    http
      .expectOne('/api/incidents')
      .flush(detail, { status: 201, statusText: 'Created' });
    await createPending;
    expect(queryClient.getQueryData(opsboardKeys.incidents.detail('i1'))).toEqual(
      detail,
    );
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);

    const updateOptions = TestBed.runInInjectionContext(() =>
      updateIncidentMutation(),
    );
    const updated = { ...detail, version: asRevisionString('2') };
    const updatePending = runMutation(queryClient, updateOptions, {
      id: 'i1',
      body: {
        title: 'Outage',
        description: 'down',
        serviceId: 's1',
        expectedVersion: asRevisionString('1'),
      },
    });
    http.expectOne('/api/incidents/i1').flush(updated);
    await updatePending;
    expect(queryClient.getQueryData(opsboardKeys.incidents.detail('i1'))).toEqual(
      updated,
    );
  });

  it('severity/status/resolve/reopen write detail and invalidate lists+timeline', async () => {
    const listKey = opsboardKeys.incidents.list({ page: 1 });
    const timelineKey = opsboardKeys.incidents.timeline('i1', { page: 1 });
    queryClient.setQueryData(opsboardKeys.incidents.detail('i1'), detail);
    queryClient.setQueryData(listKey, {
      items: [],
      page: 1,
      pageSize: 25,
      totalCount: 0,
      totalPages: 0,
    });
    queryClient.setQueryData(timelineKey, {
      items: [],
      page: 1,
      pageSize: 25,
      totalCount: 0,
      totalPages: 0,
    });

    const cases: Array<{
      factory: () => { mutationFn?: unknown; retry?: unknown; onSuccess?: unknown; onError?: unknown };
      url: string;
      variables: { id: string; body: unknown };
    }> = [
      {
        factory: () => changeSeverityMutation(),
        url: '/api/incidents/i1/severity',
        variables: {
          id: 'i1',
          body: {
            severity: 'Critical',
            expectedVersion: asRevisionString('1'),
          },
        },
      },
      {
        factory: () => changeStatusMutation(),
        url: '/api/incidents/i1/status',
        variables: {
          id: 'i1',
          body: {
            status: 'Identified',
            expectedVersion: asRevisionString('1'),
          },
        },
      },
      {
        factory: () => resolveIncidentMutation(),
        url: '/api/incidents/i1/resolve',
        variables: {
          id: 'i1',
          body: { expectedVersion: asRevisionString('1') },
        },
      },
      {
        factory: () => reopenIncidentMutation(),
        url: '/api/incidents/i1/reopen',
        variables: {
          id: 'i1',
          body: { expectedVersion: asRevisionString('1') },
        },
      },
    ];

    for (const testCase of cases) {
      queryClient.setQueryData(listKey, {
        items: [],
        page: 1,
        pageSize: 25,
        totalCount: 0,
        totalPages: 0,
      });
      queryClient.setQueryData(timelineKey, {
        items: [],
        page: 1,
        pageSize: 25,
        totalCount: 0,
        totalPages: 0,
      });

      const options = TestBed.runInInjectionContext(testCase.factory);
      expect(options.retry).toBe(false);
      const pending = runMutation(
        queryClient,
        options as never,
        testCase.variables as never,
      );
      const next = {
        ...detail,
        version: asRevisionString('3'),
      };
      http.expectOne(testCase.url).flush(next);
      await pending;
      expect(
        queryClient.getQueryData(opsboardKeys.incidents.detail('i1')),
      ).toEqual(next);
      expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(timelineKey)?.isInvalidated).toBe(true);
    }
  });

  it('concurrency_conflict invalidates detail+lists+nested prefixes without retry', async () => {
    const listKey = opsboardKeys.incidents.list({ page: 1 });
    const respondersKey = opsboardKeys.incidents.responders('i1', {
      limit: 100,
    });
    const timelineKey = opsboardKeys.incidents.timeline('i1', { page: 1 });
    queryClient.setQueryData(opsboardKeys.incidents.detail('i1'), detail);
    queryClient.setQueryData(listKey, {
      items: [],
      page: 1,
      pageSize: 25,
      totalCount: 0,
      totalPages: 0,
    });
    queryClient.setQueryData(respondersKey, { items: [], nextAfter: null });
    queryClient.setQueryData(timelineKey, {
      items: [],
      page: 1,
      pageSize: 25,
      totalCount: 0,
      totalPages: 0,
    });

    const options = TestBed.runInInjectionContext(() =>
      updateIncidentMutation(),
    );
    const pending = runMutation(queryClient, options, {
      id: 'i1',
      body: {
        title: 'Outage',
        description: 'down',
        serviceId: 's1',
        expectedVersion: asRevisionString('1'),
      },
    });
    http.expectOne('/api/incidents/i1').flush(
      {
        type: 'urn:opsboard:problem:concurrency_conflict',
        title: 'Concurrency conflict',
        status: 409,
        detail: 'conflict',
        code: 'concurrency_conflict',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await expect(pending).rejects.toMatchObject({
      code: 'concurrency_conflict',
    });

    expect(
      queryClient.getQueryState(opsboardKeys.incidents.detail('i1'))
        ?.isInvalidated,
    ).toBe(true);
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(respondersKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(timelineKey)?.isInvalidated).toBe(true);
    http.verify();
  });
});
