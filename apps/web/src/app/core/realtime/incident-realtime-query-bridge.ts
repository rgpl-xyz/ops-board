import { inject, Injectable } from '@angular/core';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { Subscription } from 'rxjs';

import {
  invalidateIncidentLists,
  invalidateIncidentRespondersPrefix,
  invalidateIncidentTimelinePrefix,
  opsboardKeys,
} from '../../data-access';
import type { IncidentRealtimeFact } from './incident-realtime-fact';
import { IncidentRealtimeConnection } from './incident-realtime-connection';

@Injectable({ providedIn: 'root' })
export class IncidentRealtimeQueryBridge {
  private readonly connection = inject(IncidentRealtimeConnection);
  private readonly queryClient = inject(QueryClient);
  private subscription: Subscription | undefined;

  attach(): void {
    if (this.subscription !== undefined) {
      return;
    }

    this.subscription = this.connection.facts$.subscribe((fact) =>
      this.invalidateForFact(fact),
    );
  }

  detach(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
  }

  private invalidateForFact(fact: IncidentRealtimeFact): void {
    invalidateIncidentLists(this.queryClient);

    if (fact.kind === 'IncidentCreated') {
      return;
    }

    void this.queryClient.invalidateQueries({
      queryKey: opsboardKeys.incidents.detail(fact.incidentId),
    });

    if (
      fact.kind === 'ResponderJoined' ||
      fact.kind === 'ResponderLeft'
    ) {
      invalidateIncidentRespondersPrefix(this.queryClient, fact.incidentId);
    }

    if (
      fact.kind === 'IncidentSeverityChanged' ||
      fact.kind === 'IncidentStatusChanged' ||
      fact.kind === 'IncidentResolved' ||
      fact.kind === 'IncidentReopened' ||
      fact.kind === 'ResponderJoined' ||
      fact.kind === 'ResponderLeft' ||
      fact.kind === 'WrittenUpdateAdded'
    ) {
      invalidateIncidentTimelinePrefix(this.queryClient, fact.incidentId);
    }
  }
}
