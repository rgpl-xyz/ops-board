import { describe, expect, it } from 'vitest';

import { asRevisionString } from './common';
import type { CurrentUserDto, OrganizationDto } from './identity';
import type {
  IncidentDetailDto,
  ResponseMutationDto,
  TimelineEntryDto,
} from './incidents';
import type { TeamDto, LookupUserDto } from './lookups';
import type { ServiceDto } from './services';

describe('Phase 2-aligned DTO fixtures', () => {
  it('keeps identity and lookup fields camelCase with string ids', () => {
    const user: CurrentUserDto = {
      userId: '10000000-0000-4000-8000-000300000001',
      organizationId: '10000000-0000-4000-8000-000100000001',
      displayName: 'Demo User',
      role: 'Responder',
      demo: true,
    };
    const org: OrganizationDto = {
      id: user.organizationId,
      name: 'Acme Cloud',
    };
    const team: TeamDto = {
      id: '10000000-0000-4000-8000-000200000001',
      name: 'Platform',
    };
    const lookupUser: LookupUserDto = {
      id: user.userId,
      displayName: user.displayName,
      teamId: team.id,
    };

    expect(user.demo).toBe(true);
    expect(org.name).toBe('Acme Cloud');
    expect(lookupUser.teamId).toBe(team.id);
  });

  it('types service and incident revision fields as RevisionString', () => {
    const serviceJson = JSON.parse(
      '{"id":"s1","name":"API","description":"d","teamId":"t1","teamName":"Platform","health":"Operational","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z","version":"1"}',
    ) as Omit<ServiceDto, 'version'> & { version: string };

    const service: ServiceDto = {
      ...serviceJson,
      version: asRevisionString(serviceJson.version),
    };
    expect(typeof service.version).toBe('string');
    expect(service.version).toBe('1');

    const incidentJson = JSON.parse(
      '{"id":"i1","title":"Outage","description":"d","serviceId":"s1","serviceName":"API","teamId":"t1","teamName":"Platform","createdByUserId":"u1","severity":"High","status":"Investigating","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z","resolvedAt":null,"version":"3","lifecycleVersion":"2"}',
    ) as Omit<IncidentDetailDto, 'version' | 'lifecycleVersion'> & {
      version: string;
      lifecycleVersion: string;
    };

    const detail: IncidentDetailDto = {
      ...incidentJson,
      version: asRevisionString(incidentJson.version),
      lifecycleVersion: asRevisionString(incidentJson.lifecycleVersion),
    };
    expect(detail.version).toBe('3');
    expect(detail.lifecycleVersion).toBe('2');
  });

  it('shapes ResponseMutationDto without coercing sequence', () => {
    const entry: TimelineEntryDto = {
      id: 'e1',
      sequence: asRevisionString('10'),
      occurredAt: '2026-01-01T00:00:00Z',
      actorUserId: 'u1',
      actorDisplayName: 'Demo',
      type: 'WrittenUpdate',
      kind: 'writtenUpdate',
      body: 'note',
      fromStatus: null,
      toStatus: null,
      fromSeverity: null,
      toSeverity: null,
    };
    const mutation: ResponseMutationDto = {
      incidentId: 'i1',
      version: asRevisionString('4'),
      lifecycleVersion: asRevisionString('5'),
      entry,
      responder: null,
    };

    expect(mutation.entry.kind).toBe('writtenUpdate');
    expect(typeof mutation.entry.sequence).toBe('string');
    expect(mutation.responder).toBeNull();
  });
});
