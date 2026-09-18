import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { HubConnection, HubConnectionBuilder } from '@microsoft/signalr';
import { Observable, Subject } from 'rxjs';

import { HUB_URL } from './hub-url';
import type { IncidentRealtimeFact } from './incident-realtime-fact';
import { validateIncidentFact } from './incident-realtime-fact.guard';

type IncidentHubConnection = Pick<
  HubConnection,
  'on' | 'off' | 'onclose' | 'onreconnected' | 'onreconnecting' | 'start' | 'stop'
>;

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
  private readonly connection = this.createConnection(this.hubUrl);
  private readonly factsSubject = new Subject<IncidentRealtimeFact>();
  private handlersBound = false;
  private starting = false;
  private stopped = true;

  readonly status = signal<RealtimeConnectionStatus>('disconnected');
  readonly facts$: Observable<IncidentRealtimeFact> =
    this.factsSubject.asObservable();

  constructor() {
    this.connection.onreconnecting(() => this.status.set('reconnecting'));
    this.connection.onreconnected(() => this.status.set('connected'));
    this.connection.onclose(() => this.status.set('disconnected'));
  }

  begin(): void {
    if (
      this.starting ||
      this.status() === 'connected' ||
      this.status() === 'connecting' ||
      this.status() === 'reconnecting'
    ) {
      return;
    }

    this.stopped = false;
    this.bindHandlers();
    this.starting = true;
    this.status.set('connecting');
    void this.startConnection();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.starting = false;
    this.unbindHandlers();

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

  private async startConnection(): Promise<void> {
    try {
      await this.connection.start();

      if (!this.stopped) {
        this.status.set('connected');
      }
    } catch (error) {
      if (!this.stopped) {
        this.status.set('disconnected');
        console.warn('Unable to start the incident realtime connection.', error);
      }
    } finally {
      this.starting = false;
    }
  }
}
