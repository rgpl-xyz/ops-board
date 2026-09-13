/** Phase 2 string-enum member names (JsonStringEnumConverter, case-sensitive). */

export type IncidentStatus =
  | 'Investigating'
  | 'Identified'
  | 'Monitoring'
  | 'Resolved';

export type IncidentSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export type ServiceHealth = 'Operational' | 'Degraded' | 'Outage';

export type UserRole =
  | 'Viewer'
  | 'Responder'
  | 'IncidentManager'
  | 'Administrator';

export type TimelineEntryType =
  | 'IncidentCreated'
  | 'StatusChanged'
  | 'SeverityChanged'
  | 'ResponderJoined'
  | 'ResponderLeft'
  | 'Resolved'
  | 'Reopened'
  | 'WrittenUpdate';

export const INCIDENT_STATUSES = [
  'Investigating',
  'Identified',
  'Monitoring',
  'Resolved',
] as const satisfies readonly IncidentStatus[];

export const INCIDENT_SEVERITIES = [
  'Critical',
  'High',
  'Medium',
  'Low',
] as const satisfies readonly IncidentSeverity[];

export const SERVICE_HEALTHS = [
  'Operational',
  'Degraded',
  'Outage',
] as const satisfies readonly ServiceHealth[];

export const USER_ROLES = [
  'Viewer',
  'Responder',
  'IncidentManager',
  'Administrator',
] as const satisfies readonly UserRole[];

export const TIMELINE_ENTRY_TYPES = [
  'IncidentCreated',
  'StatusChanged',
  'SeverityChanged',
  'ResponderJoined',
  'ResponderLeft',
  'Resolved',
  'Reopened',
  'WrittenUpdate',
] as const satisfies readonly TimelineEntryType[];
