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
import type { ServiceDto } from '../contracts/services';
import { opsboardKeys } from './keys';
import {
  createServiceMutation,
  updateServiceMutation,
} from './services.mutations';

const serviceDto: ServiceDto = {
  id: 's1',
  name: 'API Gateway',
  description: 'edge',
  teamId: 't1',
  teamName: 'Platform',
  health: 'Operational',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  version: asRevisionString('1'),
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

describe('service mutations + cache matrix', () => {
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

  it('create sets detail and invalidates lists without optimistic writes', async () => {
    const listKey = opsboardKeys.services.list({ page: 1 });
    queryClient.setQueryData(listKey, {
      items: [],
      page: 1,
      pageSize: 25,
      totalCount: 0,
      totalPages: 0,
    });

    const options = TestBed.runInInjectionContext(() => createServiceMutation());
    expect(options.retry).toBe(false);

    const pending = runMutation(queryClient, options, {
      name: 'API Gateway',
      description: 'edge',
      teamId: 't1',
    });

    const req = http.expectOne('/api/services');
    expect(
      queryClient.getQueryData(opsboardKeys.services.detail('s1')),
    ).toBeUndefined();
    req.flush(serviceDto, { status: 201, statusText: 'Created' });
    await pending;

    expect(queryClient.getQueryData(opsboardKeys.services.detail('s1'))).toEqual(
      serviceDto,
    );
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
  });

  it('update sets detail, invalidates lists, and concurrency_conflict invalidates detail+lists', async () => {
    const listKey = opsboardKeys.services.list({ page: 1 });
    queryClient.setQueryData(opsboardKeys.services.detail('s1'), serviceDto);
    queryClient.setQueryData(listKey, {
      items: [serviceDto],
      page: 1,
      pageSize: 25,
      totalCount: 1,
      totalPages: 1,
    });

    const options = TestBed.runInInjectionContext(() => updateServiceMutation());
    const updated = { ...serviceDto, version: asRevisionString('2') };
    const successPending = runMutation(queryClient, options, {
      id: 's1',
      body: {
        name: 'API Gateway',
        description: 'edge',
        teamId: 't1',
        health: 'Operational',
        expectedVersion: asRevisionString('1'),
      },
    });
    http.expectOne('/api/services/s1').flush(updated);
    await successPending;
    expect(queryClient.getQueryData(opsboardKeys.services.detail('s1'))).toEqual(
      updated,
    );
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);

    queryClient.setQueryData(listKey, {
      items: [updated],
      page: 1,
      pageSize: 25,
      totalCount: 1,
      totalPages: 1,
    });

    const conflictPending = runMutation(queryClient, options, {
      id: 's1',
      body: {
        name: 'API Gateway',
        description: 'edge',
        teamId: 't1',
        health: 'Operational',
        expectedVersion: asRevisionString('1'),
      },
    });
    http.expectOne('/api/services/s1').flush(
      {
        type: 'urn:opsboard:problem:concurrency_conflict',
        title: 'Concurrency conflict',
        status: 409,
        detail: 'conflict',
        code: 'concurrency_conflict',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await expect(conflictPending).rejects.toMatchObject({
      code: 'concurrency_conflict',
    });
    expect(
      queryClient.getQueryState(opsboardKeys.services.detail('s1'))
        ?.isInvalidated,
    ).toBe(true);
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
  });
});
