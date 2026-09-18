import { TestBed } from '@angular/core/testing';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { opsboardKeys } from '../../data-access';
import { HUB_URL } from './hub-url';
import {
  INCIDENT_HUB_CONNECTION_FACTORY,
  IncidentRealtimeConnection,
  type IncidentHubConnectionFactory,
} from './incident-realtime-connection';

type FactHandler = (...args: unknown[]) => void;

const RETRY_DELAYS_MS = [
  1_000, 2_000, 5_000, 5_000, 10_000, 10_000, 15_000,
] as const;

class FakeHubConnection {
  startCalls = 0;
  stopCalls = 0;
  startResult: (call: number) => Promise<void> = () => Promise.resolve();
  readonly handlers = new Map<string, FactHandler[]>();
  private readonly reconnectingCallbacks: Array<(error?: Error) => void> = [];
  private readonly reconnectedCallbacks: Array<(connectionId?: string) => void> = [];
  private readonly closeCallbacks: Array<(error?: Error) => void> = [];

  on(methodName: string, handler: FactHandler): void {
    this.handlers.set(methodName, [
      ...(this.handlers.get(methodName) ?? []),
      handler,
    ]);
  }

  off(methodName: string, handler?: FactHandler): void {
    if (handler === undefined) {
      this.handlers.set(methodName, []);
      return;
    }

    this.handlers.set(
      methodName,
      (this.handlers.get(methodName) ?? []).filter(
        (registered) => registered !== handler,
      ),
    );
  }

  onreconnecting(callback: (error?: Error) => void): void {
    this.reconnectingCallbacks.push(callback);
  }

  onreconnected(callback: (connectionId?: string) => void): void {
    this.reconnectedCallbacks.push(callback);
  }

  onclose(callback: (error?: Error) => void): void {
    this.closeCallbacks.push(callback);
  }

  start(): Promise<void> {
    this.startCalls += 1;
    return this.startResult(this.startCalls);
  }

  stop(): Promise<void> {
    this.stopCalls += 1;
    return Promise.resolve();
  }

  emitFact(value: unknown): void {
    for (const handler of this.handlers.get('incidentFact') ?? []) {
      handler(value);
    }
  }

  reconnecting(): void {
    for (const callback of this.reconnectingCallbacks) {
      callback();
    }
  }

  reconnected(): void {
    for (const callback of this.reconnectedCallbacks) {
      callback();
    }
  }

  close(): void {
    for (const callback of this.closeCallbacks) {
      callback();
    }
  }
}

const goldenFact = {
  organizationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  incidentId: '11111111-2222-3333-4444-555555555555',
  kind: 'IncidentCreated',
  occurredAtUtc: '2026-09-16T12:00:00Z',
};

describe('IncidentRealtimeConnection', () => {
  let hub: FakeHubConnection;
  let connection: IncidentRealtimeConnection;
  let invalidateQueries: ReturnType<typeof vi.fn>;

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  function createConnection(): void {
    hub = new FakeHubConnection();
    invalidateQueries = vi.fn(
      (_filters: { queryKey: readonly unknown[] }): Promise<void> =>
        Promise.resolve(),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: HUB_URL, useValue: '/test-hub' },
        {
          provide: INCIDENT_HUB_CONNECTION_FACTORY,
          useValue: (() => hub) as IncidentHubConnectionFactory,
        },
        { provide: QueryClient, useValue: { invalidateQueries } },
      ],
    });
    connection = TestBed.inject(IncidentRealtimeConnection);
  }

  it('connects on the first attempt without invalidating incident queries', async () => {
    createConnection();

    expect(connection.status()).toBe('disconnected');
    expect(connection.begin()).toBeUndefined();
    expect(connection.status()).toBe('connecting');

    await flushPromises();

    expect(hub.startCalls).toBe(1);
    expect(connection.status()).toBe('connected');
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('waits 1 second after the first failure, then connects without invalidation', async () => {
    vi.useFakeTimers();
    createConnection();
    hub.startResult = (call) =>
      call === 1 ? Promise.reject(new Error('offline')) : Promise.resolve();

    connection.begin();
    await flushPromises();

    expect(hub.startCalls).toBe(1);
    expect(connection.status()).toBe('connecting');

    await vi.advanceTimersByTimeAsync(999);
    expect(hub.startCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(hub.startCalls).toBe(2);
    expect(connection.status()).toBe('connected');
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('uses the exact delay sequence and stops after 8 failed attempts', async () => {
    vi.useFakeTimers();
    createConnection();
    hub.startResult = () => Promise.reject(new Error('offline'));

    connection.begin();
    await flushPromises();

    for (let index = 0; index < RETRY_DELAYS_MS.length; index += 1) {
      const delay = RETRY_DELAYS_MS[index];
      expect(hub.startCalls).toBe(index + 1);

      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(hub.startCalls).toBe(index + 1);

      await vi.advanceTimersByTimeAsync(1);
      expect(hub.startCalls).toBe(index + 2);
    }

    await flushPromises();

    expect(hub.startCalls).toBe(8);
    expect(connection.status()).toBe('disconnected');
    expect(vi.getTimerCount()).toBe(0);
    expect(invalidateQueries).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(hub.startCalls).toBe(8);
  });

  it('does not create overlapping loops while the first start is pending', async () => {
    createConnection();
    let resolveStart!: () => void;
    hub.startResult = () =>
      new Promise<void>((resolve) => {
        resolveStart = resolve;
      });

    connection.begin();
    connection.begin();

    expect(hub.startCalls).toBe(1);
    expect(hub.handlers.get('incidentFact')).toHaveLength(1);

    resolveStart();
    await flushPromises();

    expect(connection.status()).toBe('connected');
  });

  it('does not add a loop or timer when begin repeats during a retry delay', async () => {
    vi.useFakeTimers();
    createConnection();
    hub.startResult = () => Promise.reject(new Error('offline'));

    connection.begin();
    await flushPromises();
    connection.begin();

    expect(hub.startCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(hub.startCalls).toBe(2);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('cancels retry work on stop and begins one clean later lifecycle', async () => {
    vi.useFakeTimers();
    createConnection();
    hub.startResult = () => Promise.reject(new Error('offline'));

    connection.begin();
    await flushPromises();
    expect(vi.getTimerCount()).toBe(1);

    await connection.stop();

    expect(connection.status()).toBe('disconnected');
    expect(vi.getTimerCount()).toBe(0);
    expect(hub.handlers.get('incidentFact')).toEqual([]);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(hub.startCalls).toBe(1);

    hub.startResult = () => Promise.resolve();
    connection.begin();
    connection.begin();
    await flushPromises();

    expect(hub.startCalls).toBe(2);
    expect(connection.status()).toBe('connected');
    expect(hub.handlers.get('incidentFact')).toHaveLength(1);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('preserves ever-connected history across stop and later begin', async () => {
    createConnection();
    connection.begin();
    await flushPromises();

    await connection.stop();
    connection.begin();
    await flushPromises();

    expect(hub.startCalls).toBe(2);
    expect(invalidatedKeys()).toEqual([opsboardKeys.incidents.all()]);
  });

  it('emits a valid incident fact exactly once', () => {
    createConnection();
    const received: unknown[] = [];
    connection.facts$.subscribe((fact) => received.push(fact));

    connection.begin();
    hub.emitFact(goldenFact);

    expect(received).toEqual([goldenFact]);
  });

  it.each([
    ['malformed payload', { ...goldenFact, incidentId: 'not-a-uuid' }],
    ['unknown kind', { ...goldenFact, kind: 'ServiceHealthChanged' }],
  ])('drops a %s', (_description, value) => {
    createConnection();
    const received: unknown[] = [];
    connection.facts$.subscribe((fact) => received.push(fact));

    connection.begin();
    hub.emitFact(value);

    expect(received).toEqual([]);
  });

  it('removes the fact handler on stop and rebinds it once on begin', async () => {
    createConnection();
    const received: unknown[] = [];
    connection.facts$.subscribe((fact) => received.push(fact));

    connection.begin();
    await connection.stop();
    hub.emitFact(goldenFact);

    expect(hub.stopCalls).toBe(1);
    expect(hub.handlers.get('incidentFact')).toEqual([]);
    expect(received).toEqual([]);

    connection.begin();
    hub.emitFact(goldenFact);

    expect(hub.handlers.get('incidentFact')).toHaveLength(1);
    expect(received).toEqual([goldenFact]);
  });

  it('updates reconnect status and invalidates only incidents after automatic reconnect', async () => {
    createConnection();
    connection.begin();
    await flushPromises();

    hub.reconnecting();
    expect(connection.status()).toBe('reconnecting');
    expect(invalidateQueries).not.toHaveBeenCalled();

    hub.reconnected();

    expect(connection.status()).toBe('connected');
    expect(invalidatedKeys()).toEqual([opsboardKeys.incidents.all()]);
  });

  it('runs one bounded recovery after repeated onclose and invalidates once', async () => {
    vi.useFakeTimers();
    createConnection();
    connection.begin();
    await flushPromises();

    hub.startResult = (call) =>
      call === 2 ? Promise.reject(new Error('recovery offline')) : Promise.resolve();

    hub.close();
    hub.close();
    await flushPromises();

    expect(connection.status()).toBe('connecting');
    expect(hub.startCalls).toBe(2);
    expect(vi.getTimerCount()).toBe(1);
    expect(hub.handlers.get('incidentFact')).toHaveLength(1);

    hub.close();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(hub.startCalls).toBe(3);
    expect(connection.status()).toBe('connected');
    expect(vi.getTimerCount()).toBe(0);
    expect(invalidatedKeys()).toEqual([opsboardKeys.incidents.all()]);
  });

  function invalidatedKeys(): readonly unknown[][] {
    return invalidateQueries.mock.calls.map(([filters]) => filters.queryKey);
  }
});

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
