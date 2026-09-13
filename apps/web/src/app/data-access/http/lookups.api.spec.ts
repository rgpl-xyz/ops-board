import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { isOpsBoardProblem } from '../errors/is-problem';
import { LookupsApi } from './lookups.api';

describe('LookupsApi', () => {
  let api: LookupsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(LookupsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('GETs /api/lookups/teams with continuation params', async () => {
    const pending = api.listTeams({ limit: 50, after: 'after-id' });
    const req = http.expectOne(
      (request) => request.url === '/api/lookups/teams',
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('limit')).toBe('50');
    expect(req.request.params.get('after')).toBe('after-id');
    expect(req.request.headers.keys()).toEqual([]);
    req.flush({
      items: [{ id: 't1', name: 'Platform' }],
      nextAfter: null,
    });
    await expect(pending).resolves.toEqual({
      items: [{ id: 't1', name: 'Platform' }],
      nextAfter: null,
    });
  });

  it('GETs /api/lookups/users and omits null after', async () => {
    const pending = api.listUsers({ limit: 100, after: null });
    const req = http.expectOne(
      (request) => request.url === '/api/lookups/users',
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('limit')).toBe('100');
    expect(req.request.params.has('after')).toBe(false);
    req.flush({ items: [], nextAfter: null });
    await expect(pending).resolves.toEqual({ items: [], nextAfter: null });
  });

  it('throws OpsBoardProblem on lookup failures', async () => {
    const pending = api.listTeams();
    const req = http.expectOne('/api/lookups/teams');
    req.flush(
      {
        type: 'urn:opsboard:problem:forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'You are not allowed to perform this action.',
        code: 'forbidden',
      },
      { status: 403, statusText: 'Forbidden' },
    );
    await expect(pending).rejects.toSatisfy(
      (error: unknown) => isOpsBoardProblem(error) && error.code === 'forbidden',
    );
  });
});
