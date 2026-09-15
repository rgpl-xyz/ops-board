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
import { IdentityApi } from '../../../data-access/http/identity.api';
import { IncidentsApi } from '../../../data-access/http/incidents.api';
import { ServicesApi } from '../../../data-access/http/services.api';
import { IncidentDetailPage } from './incident-detail.page';

function detailDto(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

describe('IncidentDetailPage', () => {
  const updateMock = vi.fn();
  const changeSeverity = vi.fn();
  const changeStatus = vi.fn();
  const resolve = vi.fn();
  const reopen = vi.fn();
  const joinMock = vi.fn();
  const leaveMock = vi.fn();
  const addUpdateMock = vi.fn();
  const getById = vi.fn();

  beforeEach(async () => {
    updateMock.mockReset();
    changeSeverity.mockReset();
    changeStatus.mockReset();
    resolve.mockReset();
    reopen.mockReset();
    joinMock.mockReset();
    leaveMock.mockReset();
    addUpdateMock.mockReset();
    getById.mockReset();
    getById.mockResolvedValue(detailDto());

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
            getById,
            update: updateMock,
            changeSeverity,
            changeStatus,
            resolve,
            reopen,
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
            join: joinMock,
            leave: leaveMock,
            addUpdate: addUpdateMock,
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
        {
          provide: ServicesApi,
          useValue: {
            list: async () => ({
              items: [
                {
                  id: 's1',
                  name: 'Payment Processor',
                  description: '',
                  teamId: 't1',
                  teamName: 'Payments',
                  health: 'Outage',
                  createdAt: '2026-08-01T00:00:00Z',
                  updatedAt: '2026-08-01T00:00:00Z',
                  version: asRevisionString('1'),
                },
              ],
              page: 1,
              pageSize: 100,
              totalCount: 1,
              totalPages: 1,
            }),
          },
        },
        {
          provide: IdentityApi,
          useValue: {
            getCurrentUser: async () => ({
              userId: 'u1',
              organizationId: 'o1',
              displayName: 'Veyo R',
              role: 'IncidentManager',
              demo: true,
            }),
            getOrganization: async () => ({ id: 'o1', name: 'Acme' }),
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
  });

  it('saves details with expectedVersion from Query data', async () => {
    updateMock.mockResolvedValue(
      detailDto({ title: 'Updated', version: asRevisionString('3') }),
    );
    const fixture = TestBed.createComponent(IncidentDetailPage);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(fixture.nativeElement.textContent).toContain('Edit details'),
    );

    fixture.componentInstance.editForm.setValue({
      title: 'Updated',
      description: 'Payments failing',
      serviceId: 's1',
    });
    await fixture.componentInstance.saveDetails();

    expect(updateMock).toHaveBeenCalledWith('i1', {
      title: 'Updated',
      description: 'Payments failing',
      serviceId: 's1',
      expectedVersion: asRevisionString('2'),
    });
  });

  it('handles concurrency conflict without auto-resubmit', async () => {
    updateMock.mockRejectedValueOnce({
      type: 'urn:opsboard:problem:concurrency_conflict',
      title: 'Conflict',
      status: 409,
      detail: 'stale',
      code: 'concurrency_conflict',
    });
    getById
      .mockResolvedValueOnce(detailDto())
      .mockResolvedValue(
        detailDto({
          title: 'Server title',
          version: asRevisionString('9'),
        }),
      );

    const fixture = TestBed.createComponent(IncidentDetailPage);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(fixture.nativeElement.textContent).toContain('Edit details'),
    );

    fixture.componentInstance.editForm.setValue({
      title: 'Stale draft',
      description: 'Payments failing',
      serviceId: 's1',
    });
    await fixture.componentInstance.saveDetails();
    fixture.detectChanges();

    expect(fixture.componentInstance.conflictOpen()).toBe(true);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.editForm.value.title).toBe('Server title');

    await fixture.componentInstance.saveDetails();
    expect(updateMock).toHaveBeenCalledTimes(1);

    fixture.componentInstance.dismissConflict();
    updateMock.mockResolvedValue(
      detailDto({ title: 'Retry', version: asRevisionString('10') }),
    );
    fixture.componentInstance.editForm.setValue({
      title: 'Retry',
      description: 'Payments failing',
      serviceId: 's1',
    });
    await fixture.componentInstance.saveDetails();
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock.mock.calls[1]?.[1]?.expectedVersion).toEqual(
      asRevisionString('9'),
    );
  });

  it('applies severity with Query token and offers resolve while active', async () => {
    changeSeverity.mockResolvedValue(
      detailDto({ severity: 'High', version: asRevisionString('4') }),
    );
    const fixture = TestBed.createComponent(IncidentDetailPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Apply severity');
    });
    expect(fixture.nativeElement.textContent).toContain('Resolve…');
    expect(fixture.nativeElement.textContent).not.toContain('Reopen…');

    fixture.componentInstance.severityDraft.set('High');
    await fixture.componentInstance.applySeverity();
    expect(changeSeverity).toHaveBeenCalledWith('i1', {
      severity: 'High',
      expectedVersion: asRevisionString('2'),
    });
  });

  it('resolves with confirm path using expectedVersion and resets timeline page', async () => {
    resolve.mockResolvedValue(
      detailDto({ status: 'Resolved', version: asRevisionString('5') }),
    );
    const fixture = TestBed.createComponent(IncidentDetailPage);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(fixture.nativeElement.textContent).toContain('Resolve…'),
    );

    fixture.componentInstance.timelinePage.set(2);
    await fixture.componentInstance.resolveIncident();
    expect(resolve).toHaveBeenCalledWith('i1', {
      expectedVersion: asRevisionString('2'),
    });
    expect(fixture.componentInstance.timelinePage()).toBe(1);
  });

  it('shows reopen when Resolved and hides active-only controls', async () => {
    getById.mockResolvedValue(
      detailDto({ status: 'Resolved', severity: 'Medium' }),
    );
    const fixture = TestBed.createComponent(IncidentDetailPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Reopen…');
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Apply severity');
    expect(text).not.toContain('Apply status');
    expect(text).not.toContain('Resolve…');
    expect(text).not.toContain('Leave…');
    expect(text).not.toContain('Post update');
  });

  it('posts written update with lifecycle token and shows leave when member', async () => {
    addUpdateMock.mockResolvedValue({
      incidentId: 'i1',
      version: asRevisionString('2'),
      lifecycleVersion: asRevisionString('4'),
    });
    const fixture = TestBed.createComponent(IncidentDetailPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Leave…');
    });
    expect(fixture.nativeElement.textContent).toContain('Written update');
    expect(fixture.nativeElement.textContent).not.toContain('Join incident');

    fixture.componentInstance.updateBody.set('Checked payment path');
    fixture.componentInstance.timelinePage.set(3);
    await fixture.componentInstance.postWrittenUpdate();
    expect(addUpdateMock).toHaveBeenCalledWith('i1', {
      body: 'Checked payment path',
      expectedLifecycleVersion: asRevisionString('3'),
    });
    expect(fixture.componentInstance.updateBody()).toBe('');
    expect(fixture.componentInstance.timelinePage()).toBe(1);
  });

  it('joins when not already a responder using lifecycle token', async () => {
    // Remount with empty responders
    TestBed.resetTestingModule();
    joinMock.mockResolvedValue({
      incidentId: 'i1',
      version: asRevisionString('2'),
      lifecycleVersion: asRevisionString('5'),
    });
    getById.mockResolvedValue(detailDto());
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
            getById,
            update: updateMock,
            changeSeverity,
            changeStatus,
            resolve,
            reopen,
            join: joinMock,
            leave: leaveMock,
            addUpdate: addUpdateMock,
            listResponders: async () => ({ items: [], nextAfter: null }),
            listTimeline: async () => ({
              items: [],
              page: 1,
              pageSize: 25,
              totalCount: 0,
              totalPages: 0,
            }),
          },
        },
        {
          provide: ServicesApi,
          useValue: {
            list: async () => ({
              items: [],
              page: 1,
              pageSize: 100,
              totalCount: 0,
              totalPages: 0,
            }),
          },
        },
        {
          provide: IdentityApi,
          useValue: {
            getCurrentUser: async () => ({
              userId: 'u1',
              organizationId: 'o1',
              displayName: 'Veyo R',
              role: 'IncidentManager',
              demo: true,
            }),
            getOrganization: async () => ({ id: 'o1', name: 'Acme' }),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(IncidentDetailPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Join incident');
    });
    await fixture.componentInstance.joinIncident();
    expect(joinMock).toHaveBeenCalledWith('i1', {
      expectedLifecycleVersion: asRevisionString('3'),
    });
  });
});
