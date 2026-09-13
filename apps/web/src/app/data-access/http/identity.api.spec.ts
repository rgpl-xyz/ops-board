import {
  provideHttpClient,
  HttpHeaders,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { isOpsBoardProblem } from '../errors/is-problem';
import { IdentityApi } from './identity.api';

describe('IdentityApi', () => {
  let api: IdentityApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(IdentityApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('GETs /api/current-user without identity headers', async () => {
    const pending = api.getCurrentUser();
    const req = http.expectOne('/api/current-user');
    expect(req.request.method).toBe('GET');
    expectNoIdentityHeaders(req.request.headers);
    req.flush({
      userId: 'u1',
      organizationId: 'o1',
      displayName: 'Demo',
      role: 'Responder',
      demo: true,
    });
    await expect(pending).resolves.toMatchObject({ userId: 'u1', demo: true });
  });

  it('GETs /api/organization without identity headers', async () => {
    const pending = api.getOrganization();
    const req = http.expectOne('/api/organization');
    expect(req.request.method).toBe('GET');
    expectNoIdentityHeaders(req.request.headers);
    req.flush({ id: 'o1', name: 'Acme Cloud' });
    await expect(pending).resolves.toEqual({ id: 'o1', name: 'Acme Cloud' });
  });

  it('throws OpsBoardProblem on error responses', async () => {
    const pending = api.getCurrentUser();
    const req = http.expectOne('/api/current-user');
    req.flush(
      {
        type: 'urn:opsboard:problem:identity_unavailable',
        title: 'Identity unavailable',
        status: 401,
        detail: 'Current user context is unavailable.',
        code: 'identity_unavailable',
        traceId: 't1',
      },
      { status: 401, statusText: 'Unauthorized' },
    );
    await expect(pending).rejects.toSatisfy(
      (error: unknown) =>
        isOpsBoardProblem(error) && error.code === 'identity_unavailable',
    );
  });
});

function expectNoIdentityHeaders(headers: HttpHeaders): void {
  const names = headers.keys().map((name) => name.toLowerCase());
  expect(names).not.toContain('authorization');
  expect(names.some((name) => name.startsWith('x-demo'))).toBe(false);
  expect(names).not.toContain('x-organization-id');
  expect(names).not.toContain('x-user-id');
}
