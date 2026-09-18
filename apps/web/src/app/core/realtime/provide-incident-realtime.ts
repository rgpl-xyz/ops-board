import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';

import { IncidentRealtimeConnection } from './incident-realtime-connection';
import { IncidentRealtimeQueryBridge } from './incident-realtime-query-bridge';

export function provideIncidentRealtime(): EnvironmentProviders {
  return makeEnvironmentProviders([
    IncidentRealtimeQueryBridge,
    provideAppInitializer(() => {
      const connection = inject(IncidentRealtimeConnection);
      const bridge = inject(IncidentRealtimeQueryBridge);

      bridge.attach();
      connection.begin();
    }),
  ]);
}
