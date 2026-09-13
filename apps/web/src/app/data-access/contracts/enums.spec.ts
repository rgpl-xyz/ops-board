import { describe, expect, it } from 'vitest';

import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  SERVICE_HEALTHS,
  TIMELINE_ENTRY_TYPES,
  USER_ROLES,
} from './enums';

describe('Phase 2 enum member strings', () => {
  it('matches IncidentStatus members exactly', () => {
    expect([...INCIDENT_STATUSES]).toEqual([
      'Investigating',
      'Identified',
      'Monitoring',
      'Resolved',
    ]);
  });

  it('matches IncidentSeverity members exactly', () => {
    expect([...INCIDENT_SEVERITIES]).toEqual([
      'Critical',
      'High',
      'Medium',
      'Low',
    ]);
  });

  it('matches ServiceHealth members exactly', () => {
    expect([...SERVICE_HEALTHS]).toEqual([
      'Operational',
      'Degraded',
      'Outage',
    ]);
  });

  it('matches UserRole members exactly', () => {
    expect([...USER_ROLES]).toEqual([
      'Viewer',
      'Responder',
      'IncidentManager',
      'Administrator',
    ]);
  });

  it('matches TimelineEntryType members exactly', () => {
    expect([...TIMELINE_ENTRY_TYPES]).toEqual([
      'IncidentCreated',
      'StatusChanged',
      'SeverityChanged',
      'ResponderJoined',
      'ResponderLeft',
      'Resolved',
      'Reopened',
      'WrittenUpdate',
    ]);
  });
});
