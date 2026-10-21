import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isOpsBoardProblem } from '../errors/is-problem';
import { AssistantApi } from './assistant.api';

describe('AssistantApi', () => {
  let api: AssistantApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(AssistantApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('GETs /api/assistant for whether AI assistance is on', async () => {
    const pending = api.getStatus();
    const req = http.expectOne('/api/assistant');
    expect(req.request.method).toBe('GET');
    req.flush({ enabled: true, simulated: false });
    await expect(pending).resolves.toEqual({ enabled: true, simulated: false });
  });

  it('POSTs for a brief with no body: the server decides everything but the incident', async () => {
    const pending = api.generateBrief('i1');
    const req = http.expectOne('/api/incidents/i1/assistant/brief');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeNull();
    req.flush({ incidentId: 'i1' });
    await expect(pending).resolves.toMatchObject({ incidentId: 'i1' });
  });

  it('abandons the request when its signal aborts', async () => {
    const controller = new AbortController();
    const pending = api.generateBrief('i1', controller.signal);
    const req = http.expectOne('/api/incidents/i1/assistant/brief');

    controller.abort();

    expect(req.cancelled).toBe(true);
    await expect(pending).rejects.toSatisfy(isOpsBoardProblem);
  });

  it('POSTs a question as the only thing in the body, and can abandon it', async () => {
    const pending = api.askQuestion('i1', 'What happened?');
    const req = http.expectOne('/api/incidents/i1/assistant/questions');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ question: 'What happened?' });
    req.flush({ incidentId: 'i1', answered: false });
    await expect(pending).resolves.toMatchObject({ incidentId: 'i1', answered: false });

    const controller = new AbortController();
    const abandoned = api.askQuestion('i1', 'And then?', controller.signal);
    const second = http.expectOne('/api/incidents/i1/assistant/questions');
    controller.abort();
    expect(second.cancelled).toBe(true);
    await expect(abandoned).rejects.toSatisfy(isOpsBoardProblem);
  });

  it('reads an assistant problem with its code and wait', async () => {
    const pending = api.generateBrief('i1');
    http.expectOne('/api/incidents/i1/assistant/brief').flush(
      {
        type: 'urn:opsboard:problem:assistant_busy',
        title: 'AI assistance unavailable',
        status: 429,
        detail: 'AI assistance is busy. Try again in a few seconds.',
        code: 'assistant_busy',
        retryAfterSeconds: 5,
      },
      { status: 429, statusText: 'Too Many Requests' },
    );

    await expect(pending).rejects.toMatchObject({
      status: 429,
      code: 'assistant_busy',
      retryAfterSeconds: 5,
    });
  });
});
