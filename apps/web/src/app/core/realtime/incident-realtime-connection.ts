import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { HubConnection, HubConnectionBuilder } from '@microsoft/signalr';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { Observable, Subject } from 'rxjs';

import { opsboardKeys } from '../../data-access';
import { HUB_URL } from './hub-url';
import type { IncidentRealtimeFact } from './incident-realtime-fact';
import { validateIncidentFact } from './incident-realtime-fact.guard';

type IncidentHubConnection = Pick<
  HubConnection,
  'on' | 'off' | 'onclose' | 'onreconnected' | 'onreconnecting' | 'start' | 'stop'
>;

const INITIAL_CONNECT_RETRY_DELAYS_MS = [
  1_000, 2_000, 5_000, 5_000, 10_000, 10_000, 15_000,
] as const;
const INITIAL_CONNECT_MAX_ATTEMPTS =
  INITIAL_CONNECT_RETRY_DELAYS_MS.length + 1;

export type RealtimeConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export type IncidentHubConnectionFactory = (
  hubUrl: string,
) => IncidentHubConnection;

export const INCIDENT_HUB_CONNECTION_FACTORY =
  new InjectionToken<IncidentHubConnectionFactory>(
    'INCIDENT_HUB_CONNECTION_FACTORY',
    {
      providedIn: 'root',
      factory: () => (hubUrl) =>
        new HubConnectionBuilder()
          .withUrl(hubUrl, { withCredentials: true })
          .withAutomaticReconnect([0, 2_000, 10_000, 30_000])
          .build(),
    },
  );

@Injectable({ providedIn: 'root' })
export class IncidentRealtimeConnection {
  private readonly hubUrl = inject(HUB_URL);
  private readonly createConnection = inject(INCIDENT_HUB_CONNECTION_FACTORY);
  private readonly queryClient = inject(QueryClient);
  private readonly connection = this.createConnection(this.hubUrl);
  private readonly factsSubject = new Subject<IncidentRealtimeFact>();
  private handlersBound = false;
  private loopActive = false;
  private stopped = true;
  private everConnected = false;
  private retryGeneration = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private resolveRetryDelay: (() => void) | undefined;

  readonly status = signal<RealtimeConnectionStatus>('disconnected');
  readonly facts$: Observable<IncidentRealtimeFact> =
    this.factsSubject.asObservable();

  constructor() {
    this.connection.onreconnecting(this.handleReconnecting);
    this.connection.onreconnected(this.handleReconnected);
    this.connection.onclose(this.handleClose);
  }

  begin(): void {
    if (
      this.loopActive ||
      this.status() === 'connected' ||
      this.status() === 'connecting' ||
      this.status() === 'reconnecting'
    ) {
      return;
    }

    this.stopped = false;
    this.bindHandlers();
    this.startConnectLoop(this.everConnected);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.retryGeneration += 1;
    this.loopActive = false;
    this.cancelRetryDelay();
    this.unbindHandlers();
    this.status.set('disconnected');

    try {
      await this.connection.stop();
    } catch (error) {
      console.warn('Unable to stop the incident realtime connection.', error);
    } finally {
      this.status.set('disconnected');
    }
  }

  private bindHandlers(): void {
    if (this.handlersBound) {
      return;
    }

    this.connection.on('incidentFact', this.handleIncidentFact);
    this.handlersBound = true;
  }

  private unbindHandlers(): void {
    if (!this.handlersBound) {
      return;
    }

    this.connection.off('incidentFact', this.handleIncidentFact);
    this.handlersBound = false;
  }

  private readonly handleIncidentFact = (value: unknown): void => {
    const fact = validateIncidentFact(value);

    if (fact === null) {
      console.warn('Ignoring malformed incident realtime fact.');
      return;
    }

    this.factsSubject.next(fact);
  };

  private readonly handleReconnecting = (): void => {
    if (!this.stopped && !this.loopActive) {
      this.status.set('reconnecting');
    }
  };

  private readonly handleReconnected = (): void => {
    if (this.stopped || this.loopActive) {
      return;
    }

    this.status.set('connected');
    this.invalidateIncidentScope();
  };

  private readonly handleClose = (): void => {
    if (this.stopped) {
      this.status.set('disconnected');
      return;
    }

    if (this.loopActive) {
      return;
    }

    this.status.set('disconnected');

    if (!this.everConnected) {
      return;
    }

    this.startConnectLoop(true);
  };

  private startConnectLoop(recovering: boolean): void {
    if (this.stopped || this.loopActive) {
      return;
    }

    this.loopActive = true;
    this.status.set('connecting');
    const generation = ++this.retryGeneration;
    void this.runConnectLoop(generation, recovering);
  }

  private async runConnectLoop(
    generation: number,
    recovering: boolean,
  ): Promise<void> {
    for (let attempt = 0; attempt < INITIAL_CONNECT_MAX_ATTEMPTS; attempt += 1) {
      if (!this.isCurrentLoop(generation)) {
        return;
      }

      try {
        await this.connection.start();

        if (!this.isCurrentLoop(generation)) {
          return;
        }

        this.loopActive = false;
        this.everConnected = true;
        this.status.set('connected');

        if (recovering) {
          this.invalidateIncidentScope();
        }

        return;
      } catch (error) {
        if (!this.isCurrentLoop(generation)) {
          return;
        }

        console.warn(
          `Incident realtime connection attempt ${attempt + 1} failed.`,
          error,
        );

        if (attempt === INITIAL_CONNECT_MAX_ATTEMPTS - 1) {
          this.loopActive = false;
          this.status.set('disconnected');
          return;
        }

        await this.waitForRetry(
          INITIAL_CONNECT_RETRY_DELAYS_MS[attempt],
          generation,
        );
      }
    }
  }

  private waitForRetry(delayMs: number, generation: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isCurrentLoop(generation)) {
        resolve();
        return;
      }

      this.resolveRetryDelay = resolve;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = undefined;
        this.resolveRetryDelay = undefined;
        resolve();
      }, delayMs);
    });
  }

  private cancelRetryDelay(): void {
    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }

    const resolve = this.resolveRetryDelay;
    this.resolveRetryDelay = undefined;
    resolve?.();
  }

  private isCurrentLoop(generation: number): boolean {
    return (
      !this.stopped &&
      this.loopActive &&
      this.retryGeneration === generation
    );
  }

  private invalidateIncidentScope(): void {
    void this.queryClient.invalidateQueries({
      queryKey: opsboardKeys.incidents.all(),
    });
  }
}
