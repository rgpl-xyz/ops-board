import { TestBed } from '@angular/core/testing';
import { describe, expect, it, afterEach } from 'vitest';

import { HUB_URL } from './hub-url';
import {
  INCIDENT_HUB_CONNECTION_FACTORY,
  IncidentRealtimeConnection,
  type IncidentHubConnectionFactory,
} from './incident-realtime-connection';

type FactHandler = (...args: unknown[]) => void;

class FakeHubConnection {
  startCalls = 0;
  stopCalls = 0;
  startResult: () => Promise<void> = () => Promise.resolve();
  readonly handlers = new Map<string, FactHandler[]>();
  private readonly reconnectingCallbacks: Array<(error?: Error) => void> = [];
  private readonly reconnectedCallbacks: Array<(connectionId?: string) => void> = [];
  private readonly closeCallbacks: Array<(error?: Error) => void> = [];

  on(methodName: string, handler: FactHandler): void {
    this.handlers.set(methodName, [...(this.handlers.get(methodName) ?? []), handler]);
  }

  off(methodName: string, handler?: FactHandler): void {
    if (handler === undefined) {
      this.handlers.set(methodName, []);
      return;
    }

    this.handlers.set(
      methodName,
      (this.handlers.get(methodName) ?? []).filter((registered) => registered !== handler),
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
    return this.startResult();
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

  afterEach(() => TestBed.resetTestingModule());

  function createConnection(): void {
    hub = new FakeHubConnection();
    TestBed.configureTestingModule({
      providers: [
        { provide: HUB_URL, useValue: '/test-hub' },
        {
          provide: INCIDENT_HUB_CONNECTION_FACTORY,
          useValue: (() => hub) as IncidentHubConnectionFactory,
        },
      ],
    });
    connection = TestBed.inject(IncidentRealtimeConnection);
  }

  it('starts disconnected and transitions through connecting to connected', async () => {
    createConnection();
    let resolveStart!: () => void;
    hub.startResult = () => new Promise<void>((resolve) => (resolveStart = resolve));

    expect(connection.status()).toBe('disconnected');
    expect(connection.begin()).toBeUndefined();
    expect(connection.status()).toBe('connecting');

    resolveStart();
    await flushPromises();

    expect(hub.startCalls).toBe(1);
    expect(connection.status()).toBe('connected');
  });

  it('catches an initial start rejection and returns to disconnected', async () => {
    createConnection();
    hub.startResult = () => Promise.reject(new Error('offline'));

    expect(connection.begin()).toBeUndefined();
    await flushPromises();

    expect(connection.status()).toBe('disconnected');
    expect(hub.startCalls).toBe(1);
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

  it('does not duplicate handlers or start attempts when begin repeats', () => {
    createConnection();

    connection.begin();
    connection.begin();

    expect(hub.startCalls).toBe(1);
    expect(hub.handlers.get('incidentFact')).toHaveLength(1);
  });

  it('stops cleanly, removes the fact handler, and can begin again', async () => {
    createConnection();
    const received: unknown[] = [];
    connection.facts$.subscribe((fact) => received.push(fact));

    connection.begin();
    await connection.stop();
    hub.emitFact(goldenFact);

    expect(hub.stopCalls).toBe(1);
    expect(hub.handlers.get('incidentFact')).toEqual([]);
    expect(connection.status()).toBe('disconnected');
    expect(received).toEqual([]);

    connection.begin();
    hub.emitFact(goldenFact);

    expect(hub.startCalls).toBe(2);
    expect(hub.handlers.get('incidentFact')).toHaveLength(1);
    expect(received).toEqual([goldenFact]);
  });

  it('updates only local transport status from SignalR lifecycle callbacks', () => {
    createConnection();

    hub.reconnecting();
    expect(connection.status()).toBe('reconnecting');

    hub.reconnected();
    expect(connection.status()).toBe('connected');

    hub.close();
    expect(connection.status()).toBe('disconnected');
  });
});

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
