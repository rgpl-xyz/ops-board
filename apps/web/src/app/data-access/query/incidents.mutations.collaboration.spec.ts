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
import type {
  IncidentDetailDto,
  ResponseMutationDto,
} from '../contracts/incidents';
import {
  addIncidentUpdateMutation,
  joinIncidentMutation,
  leaveIncidentMutation,
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

const mutationResponse: ResponseMutationDto = {
  incidentId: 'i1',
  version: asRevisionString('4'),
  lifecycleVersion: asRevisionString('5'),
  entry: {
    id: 'e1',
    sequence: asRevisionString('1'),
    occurredAt: '2026-01-01T00:00:00Z',
    actorUserId: 'u1',
    actorDisplayName: 'Demo',
    type: 'ResponderJoined',
    kind: 'system',
    body: null,
    fromStatus: null,
    toStatus: null,
    fromSeverity: null,
    toSeverity: null,
  },
  responder: {
    userId: 'u1',
    displayName: 'Demo',
    joinedAt: '2026-01-01T00:00:00Z',
  },
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

describe('incident collaboration mutations', () => {
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

  it('join/leave patch revisions when detail exists and invalidate lists+responders+timeline', async () => {
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

    const joinOptions = TestBed.runInInjectionContext(() =>
      joinIncidentMutation(),
    );
    expect(joinOptions.retry).toBe(false);
    const joinPending = runMutation(queryClient, joinOptions, {
      id: 'i1',
      body: { expectedLifecycleVersion: asRevisionString('1') },
    });
    http.expectOne('/api/incidents/i1/responders/join').flush(mutationResponse);
    await joinPending;

    const afterJoin = queryClient.getQueryData<IncidentDetailDto>(
      opsboardKeys.incidents.detail('i1'),
    );
    expect(afterJoin?.version).toBe('4');
    expect(afterJoin?.lifecycleVersion).toBe('5');
    expect(afterJoin?.title).toBe('Outage');
    expect(afterJoin).not.toHaveProperty('entry');
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(respondersKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(timelineKey)?.isInvalidated).toBe(true);

    queryClient.setQueryData(opsboardKeys.incidents.detail('i1'), {
      ...detail,
      version: asRevisionString('4'),
      lifecycleVersion: asRevisionString('5'),
    });
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

    const leaveOptions = TestBed.runInInjectionContext(() =>
      leaveIncidentMutation(),
    );
    const leavePending = runMutation(queryClient, leaveOptions, {
      id: 'i1',
      body: { expectedLifecycleVersion: asRevisionString('5') },
    });
    http.expectOne('/api/incidents/i1/responders/leave').flush({
      ...mutationResponse,
      version: asRevisionString('6'),
      lifecycleVersion: asRevisionString('7'),
      responder: null,
    });
    await leavePending;
    expect(
      queryClient.getQueryData<IncidentDetailDto>(
        opsboardKeys.incidents.detail('i1'),
      )?.lifecycleVersion,
    ).toBe('7');
    expect(queryClient.getQueryState(respondersKey)?.isInvalidated).toBe(true);
  });

  it('addUpdate patches revisions, invalidates lists+timeline, leaves responders', async () => {
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
      addIncidentUpdateMutation(),
    );
    expect(options.retry).toBe(false);
    const pending = runMutation(queryClient, options, {
      id: 'i1',
      body: {
        body: 'working',
        expectedLifecycleVersion: asRevisionString('1'),
      },
    });
    http.expectOne('/api/incidents/i1/updates').flush({
      ...mutationResponse,
      entry: {
        ...mutationResponse.entry,
        type: 'WrittenUpdate',
        kind: 'writtenUpdate',
        body: 'working',
      },
      responder: null,
    });
    await pending;

    expect(
      queryClient.getQueryData(opsboardKeys.incidents.detail('i1')),
    ).toMatchObject({
      version: '4',
      lifecycleVersion: '5',
      title: 'Outage',
    });
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(timelineKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(respondersKey)?.isInvalidated).toBe(false);
  });

  it('skips detail patch when detail cache is absent; concurrency invalidates nested prefixes', async () => {
    const listKey = opsboardKeys.incidents.list({ page: 1 });
    const respondersKey = opsboardKeys.incidents.responders('i1', {
      limit: 100,
    });
    const timelineKey = opsboardKeys.incidents.timeline('i1', { page: 1 });
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

    const joinOptions = TestBed.runInInjectionContext(() =>
      joinIncidentMutation(),
    );
    const joinPending = runMutation(queryClient, joinOptions, {
      id: 'i1',
      body: { expectedLifecycleVersion: asRevisionString('1') },
    });
    http.expectOne('/api/incidents/i1/responders/join').flush(mutationResponse);
    await joinPending;
    expect(
      queryClient.getQueryData(opsboardKeys.incidents.detail('i1')),
    ).toBeUndefined();

    const conflictPending = runMutation(queryClient, joinOptions, {
      id: 'i1',
      body: { expectedLifecycleVersion: asRevisionString('1') },
    });
    http.expectOne('/api/incidents/i1/responders/join').flush(
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
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(respondersKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(timelineKey)?.isInvalidated).toBe(true);
  });

  it('does not auto-retry R-008 codes', async () => {
    const options = TestBed.runInInjectionContext(() =>
      addIncidentUpdateMutation(),
    );
    expect(options.retry).toBe(false);
    const pending = runMutation(queryClient, options, {
      id: 'i1',
      body: {
        body: 'note',
        expectedLifecycleVersion: asRevisionString('1'),
      },
    });
    http.expectOne('/api/incidents/i1/updates').flush(
      {
        type: 'urn:opsboard:problem:lifecycle_conflict',
        title: 'Lifecycle conflict',
        status: 409,
        detail: 'not allowed',
        code: 'lifecycle_conflict',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await expect(pending).rejects.toMatchObject({
      code: 'lifecycle_conflict',
    });
    // No second HTTP call — verify() in afterEach proves single request.
  });
});
