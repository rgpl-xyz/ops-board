import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { asRevisionString } from '../contracts/common';
import { isOpsBoardProblem } from '../errors/is-problem';
import { ServicesApi } from './services.api';

const serviceDto = {
  id: 's1',
  name: 'API Gateway',
  description: 'edge',
  teamId: 't1',
  teamName: 'Platform',
  health: 'Operational' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  version: '1',
};

describe('ServicesApi', () => {
  let api: ServicesApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ServicesApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('lists services with allowlisted query params only', async () => {
    const pending = api.list({
      page: 2,
      pageSize: 10,
      teamId: 't1',
      health: 'Degraded',
      search: 'api',
      sort: 'name',
      direction: 'asc',
    });
    const req = http.expectOne((request) => request.url === '/api/services');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().sort()).toEqual([
      'direction',
      'health',
      'page',
      'pageSize',
      'search',
      'sort',
      'teamId',
    ]);
    expect(req.request.params.get('health')).toBe('Degraded');
    req.flush({
      items: [serviceDto],
      page: 2,
      pageSize: 10,
      totalCount: 1,
      totalPages: 1,
    });
    await expect(pending).resolves.toMatchObject({ page: 2, totalCount: 1 });
  });

  it('gets service detail', async () => {
    const pending = api.getById('s1');
    const req = http.expectOne('/api/services/s1');
    expect(req.request.method).toBe('GET');
    req.flush(serviceDto);
    await expect(pending).resolves.toMatchObject({ id: 's1', version: '1' });
  });

  it('creates a service', async () => {
    const pending = api.create({
      name: 'API Gateway',
      description: 'edge',
      teamId: 't1',
    });
    const req = http.expectOne('/api/services');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'API Gateway',
      description: 'edge',
      teamId: 't1',
    });
    req.flush(serviceDto, { status: 201, statusText: 'Created' });
    await expect(pending).resolves.toMatchObject({ id: 's1' });
  });

  it('updates a service with revision string body', async () => {
    const body = {
      name: 'API Gateway',
      description: 'edge',
      teamId: 't1',
      health: 'Operational' as const,
      expectedVersion: asRevisionString('1'),
    };
    const pending = api.update('s1', body);
    const req = http.expectOne('/api/services/s1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.expectedVersion).toBe('1');
    expect(typeof req.request.body.expectedVersion).toBe('string');
    req.flush({ ...serviceDto, version: '2' });
    await expect(pending).resolves.toMatchObject({ version: '2' });
  });

  it('throws OpsBoardProblem on update conflict', async () => {
    const pending = api.update('s1', {
      name: 'API Gateway',
      description: 'edge',
      teamId: 't1',
      health: 'Operational',
      expectedVersion: asRevisionString('1'),
    });
    const req = http.expectOne('/api/services/s1');
    req.flush(
      {
        type: 'urn:opsboard:problem:concurrency_conflict',
        title: 'Concurrency conflict',
        status: 409,
        detail: 'The incident changed. Reload it and reconsider this action.',
        code: 'concurrency_conflict',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await expect(pending).rejects.toSatisfy(
      (error: unknown) =>
        isOpsBoardProblem(error) && error.code === 'concurrency_conflict',
    );
  });
});
