import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HUB_URL } from './hub-url';
import {
  INCIDENT_HUB_CONNECTION_FACTORY,
  IncidentRealtimeConnection,
  type IncidentHubConnectionFactory,
} from './incident-realtime-connection';
import { IncidentRealtimeQueryBridge } from './incident-realtime-query-bridge';
import { provideIncidentRealtime } from './provide-incident-realtime';

type HubHandler = (...args: unknown[]) => void;

class RejectingHubConnection {
  startCalls = 0;

  on(_methodName: string, _handler: HubHandler): void {}

  off(_methodName: string, _handler?: HubHandler): void {}

  onreconnecting(_callback: (error?: Error) => void): void {}

  onreconnected(_callback: (connectionId?: string) => void): void {}

  onclose(_callback: (error?: Error) => void): void {}

  start(): Promise<void> {
    this.startCalls += 1;
    return Promise.reject(new Error('hub unavailable'));
  }

  stop(): Promise<void> {
    return Promise.resolve();
  }
}

describe('provideIncidentRealtime', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('attaches the bridge and begins the connection synchronously once', async () => {
    const bridge = { attach: vi.fn() };
    const connection = { begin: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideIncidentRealtime(),
        { provide: IncidentRealtimeQueryBridge, useValue: bridge },
        { provide: IncidentRealtimeConnection, useValue: connection },
      ],
    });

    const initializer = TestBed.inject(ApplicationInitStatus);

    expect(initializer.done).toBe(true);
    await expect(initializer.donePromise).resolves.toBeUndefined();
    expect(bridge.attach).toHaveBeenCalledTimes(1);
    expect(connection.begin).toHaveBeenCalledTimes(1);
  });

  it('does not block application initialization when the first hub start rejects', async () => {
    vi.useFakeTimers();
    const hub = new RejectingHubConnection();
    TestBed.configureTestingModule({
      providers: [
        provideIncidentRealtime(),
        { provide: HUB_URL, useValue: '/test-hub' },
        {
          provide: INCIDENT_HUB_CONNECTION_FACTORY,
          useValue: (() => hub) as IncidentHubConnectionFactory,
        },
        {
          provide: QueryClient,
          useValue: { invalidateQueries: vi.fn(() => Promise.resolve()) },
        },
      ],
    });

    const initializer = TestBed.inject(ApplicationInitStatus);

    expect(initializer.done).toBe(true);
    await expect(initializer.donePromise).resolves.toBeUndefined();
    await flushPromises();
    expect(hub.startCalls).toBe(1);

    await TestBed.inject(IncidentRealtimeConnection).stop();
  });
});

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
