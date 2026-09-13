import type { RevisionString } from './common';
import type {
  IncidentSeverity,
  IncidentStatus,
  TimelineEntryType,
} from './enums';

export interface CreateIncidentRequest {
  title: string;
  description: string;
  serviceId: string;
  severity: IncidentSeverity;
}

export interface UpdateIncidentRequest {
  title: string;
  description: string;
  serviceId: string;
  expectedVersion: RevisionString;
}

export interface SeverityRequest {
  severity: IncidentSeverity;
  expectedVersion: RevisionString;
}

export interface StatusRequest {
  status: IncidentStatus;
  expectedVersion: RevisionString;
}

export interface VersionRequest {
  expectedVersion: RevisionString;
}

export interface LifecycleVersionRequest {
  expectedLifecycleVersion: RevisionString;
}

export interface WrittenUpdateRequest {
  body: string;
  expectedLifecycleVersion: RevisionString;
}

export interface IncidentSummaryDto {
  id: string;
  title: string;
  serviceId: string;
  serviceName: string;
  teamId: string;
  teamName: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  version: RevisionString;
  lifecycleVersion: RevisionString;
}

export interface IncidentDetailDto {
  id: string;
  title: string;
  description: string;
  serviceId: string;
  serviceName: string;
  teamId: string;
  teamName: string;
  createdByUserId: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  version: RevisionString;
  lifecycleVersion: RevisionString;
}

export interface ResponderDto {
  userId: string;
  displayName: string;
  joinedAt: string;
}

/** Phase 2 derived kind: WrittenUpdate → writtenUpdate; all others → system. */
export type TimelineEntryKind = 'writtenUpdate' | 'system';

export interface TimelineEntryDto {
  id: string;
  sequence: RevisionString;
  occurredAt: string;
  actorUserId: string;
  actorDisplayName: string;
  type: TimelineEntryType;
  kind: TimelineEntryKind;
  body: string | null;
  fromStatus: IncidentStatus | null;
  toStatus: IncidentStatus | null;
  fromSeverity: IncidentSeverity | null;
  toSeverity: IncidentSeverity | null;
}

export interface ResponseMutationDto {
  incidentId: string;
  version: RevisionString;
  lifecycleVersion: RevisionString;
  entry: TimelineEntryDto;
  responder: ResponderDto | null;
}

export interface IncidentQuery {
  page?: number;
  pageSize?: number;
  serviceId?: string | null;
  teamId?: string | null;
  severity?: IncidentSeverity | null;
  status?: IncidentStatus | null;
  search?: string | null;
  sort?: string;
  direction?: string;
}
