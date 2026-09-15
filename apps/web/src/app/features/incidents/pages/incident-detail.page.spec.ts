import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { asRevisionString } from '../../../data-access';
import { IncidentsApi } from '../../../data-access/http/incidents.api';
import { IncidentDetailPage } from './incident-detail.page';

describe('IncidentDetailPage read surface', () => {
  beforeEach(async () => {
    const params$ = new BehaviorSubject(convertToParamMap({ id: 'i1' }));

    await TestBed.configureTestingModule({
      imports: [IncidentDetailPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: params$.asObservable(),
            snapshot: { paramMap: params$.value },
          },
        },
        {
          provide: IncidentsApi,
          useValue: {
            getById: async () => ({
              id: 'i1',
              title: 'Checkout timeouts',
              description: 'Payments failing',
              serviceId: 's1',
              serviceName: 'Payment Processor',
              teamId: 't1',
              teamName: 'Payments',
              createdByUserId: 'u1',
              severity: 'Critical',
              status: 'Investigating',
              createdAt: '2026-08-01T00:00:00Z',
              updatedAt: '2026-08-01T01:00:00Z',
              resolvedAt: null,
              version: asRevisionString('2'),
              lifecycleVersion: asRevisionString('3'),
            }),
            listResponders: async () => ({
              items: [
                {
                  userId: 'u1',
                  displayName: 'Veyo R',
                  joinedAt: '2026-08-01T00:30:00Z',
                },
              ],
              nextAfter: null,
            }),
            listTimeline: async () => ({
              items: [
                {
                  id: 'e1',
                  sequence: asRevisionString('2'),
                  occurredAt: '2026-08-01T00:40:00Z',
                  actorUserId: 'u1',
                  actorDisplayName: 'Veyo R',
                  type: 'WrittenUpdate',
                  kind: 'writtenUpdate',
                  body: 'Investigating authz path',
                  fromStatus: null,
                  toStatus: null,
                  fromSeverity: null,
                  toSeverity: null,
                },
                {
                  id: 'e0',
                  sequence: asRevisionString('1'),
                  occurredAt: '2026-08-01T00:00:00Z',
                  actorUserId: 'u1',
                  actorDisplayName: 'Veyo R',
                  type: 'IncidentCreated',
                  kind: 'system',
                  body: null,
                  fromStatus: null,
                  toStatus: 'Investigating',
                  fromSeverity: null,
                  toSeverity: 'Critical',
                },
              ],
              page: 1,
              pageSize: 25,
              totalCount: 2,
              totalPages: 1,
            }),
          },
        },
      ],
    }).compileComponents();
  });

  it('shows summary, responders, and written vs system timeline', async () => {
    const fixture = TestBed.createComponent(IncidentDetailPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Checkout timeouts');
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Critical');
    expect(text).toContain('Veyo R');
    expect(text).toContain('Written update');
    expect(text).toContain('System · IncidentCreated');
    expect(text).toContain('Investigating authz path');
  });
});
