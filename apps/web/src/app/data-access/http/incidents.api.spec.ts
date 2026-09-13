import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { asRevisionString } from '../contracts/common';
import { isOpsBoardProblem } from '../errors/is-problem';
import { IncidentsApi } from './incidents.api';

const detail = {
  id: 'i1',
  title: 'Outage',
  description: 'down',
  serviceId: 's1',
  serviceName: 'API',
  teamId: 't1',
  teamName: 'Platform',
  createdByUserId: 'u1',
  severity: 'High' as const,
  status: 'Investigating' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  resolvedAt: null,
  version: '1',
  lifecycleVersion: '1',
};

const mutation = {
  incidentId: 'i1',
  version: '2',
  lifecycleVersion: '3',
  entry: {
    id: 'e1',
    sequence: '1',
    occurredAt: '2026-01-01T00:00:00Z',
    actorUserId: 'u1',
    actorDisplayName: 'Demo',
    type: 'ResponderJoined' as const,
    kind: 'system' as const,
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

describe('IncidentsApi', () => {
  let api: IncidentsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(IncidentsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('lists incidents with allowlisted filters', async () => {
    const pending = api.list({
      page: 1,
      pageSize: 25,
      serviceId: 's1',
      severity: 'High',
      status: 'Investigating',
      sort: 'createdAt',
      direction: 'desc',
    });
    const req = http.expectOne((request) => request.url === '/api/incidents');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('severity')).toBe('High');
    expect(req.request.params.get('status')).toBe('Investigating');
    req.flush({
      items: [],
      page: 1,
      pageSize: 25,
      totalCount: 0,
      totalPages: 0,
    });
    await expect(pending).resolves.toMatchObject({ totalCount: 0 });
  });

  it('reads and writes scalar incident routes with revision strings', async () => {
    const getPending = api.getById('i1');
    http.expectOne('/api/incidents/i1').flush(detail);
    await expect(getPending).resolves.toMatchObject({ id: 'i1' });

    const createPending = api.create({
      title: 'Outage',
      description: 'down',
      serviceId: 's1',
      severity: 'High',
    });
    const createReq = http.expectOne('/api/incidents');
    expect(createReq.request.method).toBe('POST');
    createReq.flush(detail, { status: 201, statusText: 'Created' });
    await expect(createPending).resolves.toMatchObject({ id: 'i1' });

    const updatePending = api.update('i1', {
      title: 'Outage',
      description: 'down',
      serviceId: 's1',
      expectedVersion: asRevisionString('1'),
    });
    const updateReq = http.expectOne('/api/incidents/i1');
    expect(updateReq.request.method).toBe('PUT');
    expect(updateReq.request.body.expectedVersion).toBe('1');
    updateReq.flush(detail);
    await expect(updatePending).resolves.toMatchObject({ id: 'i1' });

    const severityPending = api.changeSeverity('i1', {
      severity: 'Critical',
      expectedVersion: asRevisionString('1'),
    });
    const severityReq = http.expectOne('/api/incidents/i1/severity');
    expect(severityReq.request.method).toBe('PATCH');
    severityReq.flush(detail);
    await expect(severityPending).resolves.toMatchObject({ id: 'i1' });

    const statusPending = api.changeStatus('i1', {
      status: 'Identified',
      expectedVersion: asRevisionString('1'),
    });
    const statusReq = http.expectOne('/api/incidents/i1/status');
    expect(statusReq.request.method).toBe('PATCH');
    statusReq.flush(detail);
    await expect(statusPending).resolves.toMatchObject({ id: 'i1' });

    const resolvePending = api.resolve('i1', {
      expectedVersion: asRevisionString('1'),
    });
    const resolveReq = http.expectOne('/api/incidents/i1/resolve');
    expect(resolveReq.request.method).toBe('POST');
    resolveReq.flush(detail);
    await expect(resolvePending).resolves.toMatchObject({ id: 'i1' });

    const reopenPending = api.reopen('i1', {
      expectedVersion: asRevisionString('1'),
    });
    const reopenReq = http.expectOne('/api/incidents/i1/reopen');
    expect(reopenReq.request.method).toBe('POST');
    reopenReq.flush(detail);
    await expect(reopenPending).resolves.toMatchObject({ id: 'i1' });
  });

  it('covers responders, updates, and timeline routes', async () => {
    const respondersPending = api.listResponders('i1', {
      limit: 100,
      after: 'u0',
    });
    const respondersReq = http.expectOne(
      (request) => request.url === '/api/incidents/i1/responders',
    );
    expect(respondersReq.request.method).toBe('GET');
    expect(respondersReq.request.params.get('after')).toBe('u0');
    respondersReq.flush({ items: [], nextAfter: null });
    await expect(respondersPending).resolves.toEqual({
      items: [],
      nextAfter: null,
    });

    const joinPending = api.join('i1', {
      expectedLifecycleVersion: asRevisionString('1'),
    });
    const joinReq = http.expectOne('/api/incidents/i1/responders/join');
    expect(joinReq.request.method).toBe('POST');
    expect(joinReq.request.body.expectedLifecycleVersion).toBe('1');
    joinReq.flush(mutation);
    await expect(joinPending).resolves.toMatchObject({ incidentId: 'i1' });

    const leavePending = api.leave('i1', {
      expectedLifecycleVersion: asRevisionString('2'),
    });
    const leaveReq = http.expectOne('/api/incidents/i1/responders/leave');
    expect(leaveReq.request.method).toBe('POST');
    leaveReq.flush({ ...mutation, responder: null });
    await expect(leavePending).resolves.toMatchObject({ responder: null });

    const updatePending = api.addUpdate('i1', {
      body: 'working on it',
      expectedLifecycleVersion: asRevisionString('3'),
    });
    const updateReq = http.expectOne('/api/incidents/i1/updates');
    expect(updateReq.request.method).toBe('POST');
    expect(updateReq.request.body.body).toBe('working on it');
    updateReq.flush(mutation, { status: 201, statusText: 'Created' });
    await expect(updatePending).resolves.toMatchObject({ version: '2' });

    const timelinePending = api.listTimeline('i1', { page: 1, pageSize: 25 });
    const timelineReq = http.expectOne(
      (request) => request.url === '/api/incidents/i1/timeline',
    );
    expect(timelineReq.request.method).toBe('GET');
    expect(timelineReq.request.params.get('page')).toBe('1');
    timelineReq.flush({
      items: [mutation.entry],
      page: 1,
      pageSize: 25,
      totalCount: 1,
      totalPages: 1,
    });
    await expect(timelinePending).resolves.toMatchObject({ totalCount: 1 });
  });

  it('throws OpsBoardProblem on incident errors', async () => {
    const pending = api.getById('missing');
    http.expectOne('/api/incidents/missing').flush(
      {
        type: 'urn:opsboard:problem:unavailable',
        title: 'Unavailable',
        status: 404,
        detail: 'The requested resource is unavailable.',
        code: 'unavailable',
      },
      { status: 404, statusText: 'Not Found' },
    );
    await expect(pending).rejects.toSatisfy(
      (error: unknown) =>
        isOpsBoardProblem(error) && error.code === 'unavailable',
    );
  });
});
