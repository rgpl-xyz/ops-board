import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  type ParamMap,
  provideRouter,
} from '@angular/router';
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { asRevisionString, opsboardKeys } from '../../../data-access';
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
  let params$: BehaviorSubject<ParamMap>;

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

    params$ = new BehaviorSubject(convertToParamMap({ id: 'i1' }));

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

  async function mountEditable() {
    const fixture = TestBed.createComponent(IncidentDetailPage);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Edit details');
    });
    return fixture;
  }

  /** Mirrors a realtime/refetch cache write, which is the passive path. */
  function passiveDetail(overrides: Record<string, unknown>) {
    TestBed.inject(QueryClient).setQueryData(
      opsboardKeys.incidents.detail('i1'),
      detailDto(overrides),
    );
  }

  it('adopts fresh server values while the edit form is pristine', async () => {
    const fixture = await mountEditable();
    expect(fixture.componentInstance.editForm.getRawValue().title).toBe(
      'Checkout timeouts',
    );

    passiveDetail({
      title: 'Server retitled',
      version: asRevisionString('5'),
    });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.componentInstance.editForm.getRawValue().title).toBe(
        'Server retitled',
      );
    });

    expect(fixture.componentInstance.editForm.pristine).toBe(true);

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('keeps dirty edit values, controls, and focus across a passive change', async () => {
    const fixture = await mountEditable();

    const title = fixture.nativeElement.querySelector(
      '#edit-title',
    ) as HTMLInputElement;
    title.focus();
    title.value = 'Half typed title';
    title.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.componentInstance.editForm.dirty).toBe(true);

    passiveDetail({
      title: 'Server retitled',
      description: 'Server description',
      version: asRevisionString('7'),
    });
    // The passive change really did land: the page summary shows it.
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Server retitled');
    });

    expect(fixture.componentInstance.editForm.getRawValue()).toEqual({
      title: 'Half typed title',
      description: 'Payments failing',
      serviceId: 's1',
    });
    expect(title.value).toBe('Half typed title');
    expect(document.activeElement).toBe(title);
    expect(fixture.componentInstance.conflictOpen()).toBe(false);
    expect(
      fixture.nativeElement.querySelector('[role="alert"]'),
    ).toBeNull();

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('focuses one conflict recovery surface and returns focus on dismiss', async () => {
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
        detailDto({ title: 'Server title', version: asRevisionString('9') }),
      );

    const fixture = await mountEditable();
    fixture.componentInstance.editForm.setValue({
      title: 'Stale draft',
      description: 'Payments failing',
      serviceId: 's1',
    });

    await fixture.componentInstance.saveDetails();
    await TestBed.tick();
    fixture.detectChanges();

    const alerts = fixture.nativeElement.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);

    const recovery = alerts[0].querySelector('button') as HTMLButtonElement;
    expect(recovery.textContent).toContain('Dismiss and continue editing');
    expect(document.activeElement).toBe(recovery);
    expect(fixture.nativeElement.textContent).toContain(
      'before applying lifecycle changes',
    );

    recovery.click();
    await TestBed.tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.conflictOpen()).toBe(false);
    expect(document.activeElement).toBe(
      fixture.nativeElement.querySelector('#edit-title'),
    );

    fixture.destroy();
    fixture.nativeElement.remove();
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
    expect(text).toContain('System · Incident created');
  });

  it('marks its loading branch as a named route-focus context', () => {
    const fixture = TestBed.createComponent(IncidentDetailPage);
    fixture.detectChanges();

    const target = fixture.nativeElement.querySelector(
      '[data-ob-route-focus]',
    ) as HTMLElement;
    expect(target.getAttribute('tabindex')).toBe('-1');
    expect(target.getAttribute('aria-label')).toBe(
      'Loading incident details',
    );
  });

  it('saves details with the version the form was loaded from', async () => {
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

  it('keeps the loaded version as the save baseline across a passive change', async () => {
    updateMock.mockResolvedValue(detailDto({ version: asRevisionString('8') }));
    const fixture = await mountEditable();
    const title = fixture.nativeElement.querySelector(
      '#edit-title',
    ) as HTMLInputElement;
    title.value = 'Half typed title';
    title.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    passiveDetail({
      description: 'Changed by someone else',
      version: asRevisionString('7'),
    });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Changed by someone else');
    });
    expect(fixture.componentInstance.editForm.getRawValue().title).toBe(
      'Half typed title',
    );

    await fixture.componentInstance.saveDetails();

    // The form was loaded at 2; the server must be able to reject it as stale.
    expect(updateMock).toHaveBeenCalledWith('i1', {
      title: 'Half typed title',
      description: 'Payments failing',
      serviceId: 's1',
      expectedVersion: asRevisionString('2'),
    });

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('advances the save baseline when a pristine form adopts a newer version', async () => {
    updateMock.mockResolvedValue(detailDto({ version: asRevisionString('6') }));
    const fixture = await mountEditable();

    passiveDetail({ title: 'Server retitled', version: asRevisionString('5') });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.componentInstance.editForm.getRawValue().title).toBe(
        'Server retitled',
      );
    });

    fixture.componentInstance.editForm.controls.title.setValue('Edited after refresh');
    await fixture.componentInstance.saveDetails();

    expect(updateMock.mock.calls[0]?.[1]?.expectedVersion).toEqual(
      asRevisionString('5'),
    );

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('bases the next save on the version a successful save returned', async () => {
    updateMock
      .mockResolvedValueOnce(
        detailDto({ title: 'First edit', version: asRevisionString('3') }),
      )
      .mockResolvedValueOnce(
        detailDto({ title: 'Second edit', version: asRevisionString('4') }),
      );
    const fixture = await mountEditable();

    fixture.componentInstance.editForm.controls.title.setValue('First edit');
    fixture.componentInstance.editForm.markAsDirty();
    await fixture.componentInstance.saveDetails();
    fixture.detectChanges();

    fixture.componentInstance.editForm.controls.title.setValue('Second edit');
    fixture.componentInstance.editForm.markAsDirty();
    await fixture.componentInstance.saveDetails();

    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock.mock.calls[0]?.[1]?.expectedVersion).toEqual(
      asRevisionString('2'),
    );
    expect(updateMock.mock.calls[1]?.[1]?.expectedVersion).toEqual(
      asRevisionString('3'),
    );

    fixture.destroy();
    fixture.nativeElement.remove();
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

  it('shows the loaded severity and status in the lifecycle controls', async () => {
    // Not the first option of either list, so a select that fell back to its
    // first option would show Critical / Investigating instead.
    getById.mockResolvedValue(
      detailDto({ severity: 'Medium', status: 'Monitoring' }),
    );
    changeSeverity.mockResolvedValue(
      detailDto({ severity: 'Low', status: 'Monitoring' }),
    );
    const fixture = await mountEditable();
    const severity = fixture.nativeElement.querySelector(
      '#life-sev',
    ) as HTMLSelectElement;
    const status = fixture.nativeElement.querySelector(
      '#life-st',
    ) as HTMLSelectElement;

    expect(severity.value).toBe('Medium');
    expect(status.value).toBe('Monitoring');

    // What the control shows is what Apply sends.
    severity.value = 'Low';
    severity.dispatchEvent(new Event('change'));
    await fixture.componentInstance.applySeverity();
    expect(changeSeverity).toHaveBeenCalledWith('i1', {
      severity: 'Low',
      expectedVersion: asRevisionString('2'),
    });

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('rebinds its controls when the route moves to another incident at the same version', async () => {
    getById.mockImplementation(async (id: string) =>
      id === 'i2'
        ? detailDto({
            id: 'i2',
            title: 'Queue backlog',
            description: 'Consumers lagging',
            severity: 'Low',
            status: 'Identified',
          })
        : detailDto(),
    );
    const fixture = await mountEditable();
    expect(fixture.componentInstance.editForm.getRawValue().title).toBe(
      'Checkout timeouts',
    );

    // The router reuses the page; both incidents are at version 2.
    params$.next(convertToParamMap({ id: 'i2' }));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Queue backlog');
    });

    expect(fixture.componentInstance.editForm.getRawValue()).toEqual({
      title: 'Queue backlog',
      description: 'Consumers lagging',
      serviceId: 's1',
    });
    expect(
      (fixture.nativeElement.querySelector('#life-sev') as HTMLSelectElement)
        .value,
    ).toBe('Low');
    expect(
      (fixture.nativeElement.querySelector('#life-st') as HTMLSelectElement)
        .value,
    ).toBe('Identified');

    fixture.destroy();
    fixture.nativeElement.remove();
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

  it('focuses the first invalid edit control and keeps typed values', async () => {
    const fixture = await mountEditable();
    const title = fixture.nativeElement.querySelector(
      '#edit-title',
    ) as HTMLInputElement;
    title.value = '';
    title.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    await fixture.componentInstance.saveDetails();
    await TestBed.tick();
    fixture.detectChanges();

    expect(updateMock).not.toHaveBeenCalled();
    expect(title.getAttribute('aria-describedby')).toBe('edit-title-error');
    expect(
      (
        fixture.nativeElement.querySelector('#edit-title-error') as HTMLElement
      ).textContent,
    ).toContain('Title is required.');
    expect(document.activeElement).toBe(title);

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('maps a server field error on the edit form without an alert summary', async () => {
    updateMock.mockRejectedValueOnce({
      type: 'urn:opsboard:problem:validation_failed',
      title: 'Validation failed',
      status: 400,
      detail: 'One or more fields are invalid.',
      code: 'validation_failed',
      errors: { title: ['Title is already used.'] },
    });

    const fixture = await mountEditable();
    fixture.componentInstance.editForm.setValue({
      title: 'Duplicate title',
      description: 'Payments failing',
      serviceId: 's1',
    });

    await fixture.componentInstance.saveDetails();
    await TestBed.tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.editForm.getRawValue().title).toBe(
      'Duplicate title',
    );
    expect(
      (
        fixture.nativeElement.querySelector('#edit-title-error') as HTMLElement
      ).textContent,
    ).toContain('Title is already used.');
    expect(document.activeElement).toBe(
      fixture.nativeElement.querySelector('#edit-title'),
    );
    expect(
      fixture.nativeElement.querySelectorAll('[role="alert"]'),
    ).toHaveLength(0);

    fixture.destroy();
    fixture.nativeElement.remove();
  });
});
