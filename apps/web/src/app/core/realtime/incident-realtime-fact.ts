export const INCIDENT_REALTIME_FACT_KINDS = [
  'IncidentCreated',
  'IncidentDetailsChanged',
  'IncidentSeverityChanged',
  'IncidentStatusChanged',
  'IncidentResolved',
  'IncidentReopened',
  'ResponderJoined',
  'ResponderLeft',
  'WrittenUpdateAdded',
] as const;

export type IncidentRealtimeFactKind =
  (typeof INCIDENT_REALTIME_FACT_KINDS)[number];

export interface IncidentRealtimeFact {
  organizationId: string;
  incidentId: string;
  kind: IncidentRealtimeFactKind;
  version?: string | null;
  lifecycleVersion?: string | null;
  occurredAtUtc?: string;
}
