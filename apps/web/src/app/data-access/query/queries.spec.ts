import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { OpsBoardProblem } from '../errors/problem';
import { currentUserQuery, organizationQuery } from './identity.queries';
import {
  incidentQuery,
  incidentRespondersQuery,
  incidentsQuery,
  incidentTimelineQuery,
} from './incidents.queries';
import { teamsQuery, usersQuery } from './lookups.queries';
import { shouldRetryQuery } from './query-retry';
import { serviceQuery, servicesQuery } from './services.queries';

describe('shouldRetryQuery', () => {
  it('skips retries for 4xx OpsBoardProblem', () => {
    const problem: OpsBoardProblem = {
      status: 409,
      code: 'concurrency_conflict',
      title: 'Concurrency conflict',
      detail: 'conflict',
    };
    expect(shouldRetryQuery(0, problem)).toBe(false);
  });

  it('allows one retry for non-4xx failures', () => {
    const problem: OpsBoardProblem = {
      status: 503,
      code: 'persistence_unavailable',
      title: 'Persistence unavailable',
      detail: 'down',
    };
    expect(shouldRetryQuery(0, problem)).toBe(true);
    expect(shouldRetryQuery(1, problem)).toBe(false);
    expect(shouldRetryQuery(0, new Error('network'))).toBe(true);
  });
});

describe('read query option factories', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('wires identity/lookup/service/incident factories to HTTP APIs', async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: shouldRetryQuery },
      },
    });

    const options = TestBed.runInInjectionContext(() => ({
      currentUser: currentUserQuery(),
      organization: organizationQuery(),
      teams: teamsQuery({ limit: 10 }),
      users: usersQuery({ limit: 10 }),
      services: servicesQuery({ page: 1 }),
      service: serviceQuery('s1'),
      incidents: incidentsQuery({ page: 1 }),
      incident: incidentQuery('i1'),
      responders: incidentRespondersQuery('i1', { limit: 100 }),
      timeline: incidentTimelineQuery('i1', { page: 1 }),
    }));

    expect(options.currentUser.queryKey).toEqual(['opsboard', 'current-user']);

    const currentUserPending = client.fetchQuery(options.currentUser);
    http.expectOne('/api/current-user').flush({
      userId: 'u1',
      organizationId: 'o1',
      displayName: 'Demo',
      role: 'Responder',
      demo: true,
    });
    await expect(currentUserPending).resolves.toMatchObject({ userId: 'u1' });

    const organizationPending = client.fetchQuery(options.organization);
    http.expectOne('/api/organization').flush({ id: 'o1', name: 'Acme' });
    await expect(organizationPending).resolves.toMatchObject({ id: 'o1' });

    const teamsPending = client.fetchQuery(options.teams);
    http
      .expectOne((req) => req.url === '/api/lookups/teams')
      .flush({ items: [], nextAfter: null });
    await expect(teamsPending).resolves.toEqual({
      items: [],
      nextAfter: null,
    });

    const usersPending = client.fetchQuery(options.users);
    http
      .expectOne((req) => req.url === '/api/lookups/users')
      .flush({ items: [], nextAfter: null });
    await expect(usersPending).resolves.toEqual({
      items: [],
      nextAfter: null,
    });

    const servicesPending = client.fetchQuery(options.services);
    http.expectOne((req) => req.url === '/api/services').flush({
      items: [],
      page: 1,
      pageSize: 25,
      totalCount: 0,
      totalPages: 0,
    });
    await expect(servicesPending).resolves.toMatchObject({ totalCount: 0 });

    const servicePending = client.fetchQuery(options.service);
    http.expectOne('/api/services/s1').flush({
      id: 's1',
      name: 'API',
      description: 'd',
      teamId: 't1',
      teamName: 'Platform',
      health: 'Operational',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      version: '1',
    });
    await expect(servicePending).resolves.toMatchObject({ id: 's1' });

    const incidentsPending = client.fetchQuery(options.incidents);
    http.expectOne((req) => req.url === '/api/incidents').flush({
      items: [],
      page: 1,
      pageSize: 25,
      totalCount: 0,
      totalPages: 0,
    });
    await expect(incidentsPending).resolves.toMatchObject({ totalCount: 0 });

    const incidentPending = client.fetchQuery(options.incident);
    http.expectOne('/api/incidents/i1').flush({
      id: 'i1',
      title: 'Outage',
      description: 'd',
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
      version: '1',
      lifecycleVersion: '1',
    });
    await expect(incidentPending).resolves.toMatchObject({ id: 'i1' });

    const respondersPending = client.fetchQuery(options.responders);
    http
      .expectOne((req) => req.url === '/api/incidents/i1/responders')
      .flush({ items: [], nextAfter: null });
    await expect(respondersPending).resolves.toEqual({
      items: [],
      nextAfter: null,
    });

    const timelinePending = client.fetchQuery(options.timeline);
    http.expectOne((req) => req.url === '/api/incidents/i1/timeline').flush({
      items: [],
      page: 1,
      pageSize: 25,
      totalCount: 0,
      totalPages: 0,
    });
    await expect(timelinePending).resolves.toMatchObject({ totalCount: 0 });

    client.clear();
  });
});
