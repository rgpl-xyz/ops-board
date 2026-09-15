/** Phase 4-facing public surface for OpsBoard data-access. */

export { API_BASE_URL } from './http/api-base';
export {
  FetchAllBoundedExceededError,
  fetchAllBounded,
} from './http/fetch-all-bounded';
export { IdentityApi } from './http/identity.api';
export { IncidentsApi } from './http/incidents.api';
export { LookupsApi } from './http/lookups.api';
export { ServicesApi } from './http/services.api';

export type {
  Bounded,
  ContinuationQuery,
  Page,
  PageQuery,
  RevisionString,
} from './contracts/common';
export { asRevisionString, isRevisionString } from './contracts/common';
export type {
  IncidentSeverity,
  IncidentStatus,
  ServiceHealth,
  TimelineEntryType,
  UserRole,
} from './contracts/enums';
export {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  SERVICE_HEALTHS,
} from './contracts/enums';
export type { CurrentUserDto, OrganizationDto } from './contracts/identity';
export type {
  CreateIncidentRequest,
  IncidentDetailDto,
  IncidentQuery,
  IncidentSummaryDto,
  LifecycleVersionRequest,
  ResponderDto,
  ResponseMutationDto,
  SeverityRequest,
  StatusRequest,
  TimelineEntryDto,
  TimelineEntryKind,
  UpdateIncidentRequest,
  VersionRequest,
  WrittenUpdateRequest,
} from './contracts/incidents';
export type { LookupUserDto, TeamDto } from './contracts/lookups';
export type {
  CreateServiceRequest,
  ServiceDto,
  ServiceQuery,
  UpdateServiceRequest,
} from './contracts/services';

export type { OpsBoardProblem, OpsBoardProblemCode } from './errors/problem';
export {
  isConcurrencyConflict,
  isForbidden,
  isIdentityUnavailable,
  isLifecycleConflict,
  isOpsBoardProblem,
  isResponderConflict,
  isUnavailable,
  isValidationFailed,
} from './errors/is-problem';
export { parseProblem } from './errors/parse-problem';

export {
  incidentQueryFromParams,
  incidentQueryToParams,
} from './mappers/incident-query.params';
export {
  serviceQueryFromParams,
  serviceQueryToParams,
} from './mappers/service-query.params';

export { opsboardKeys, stableQueryPart } from './query/keys';
export { currentUserQuery, organizationQuery } from './query/identity.queries';
export { teamsQuery, usersQuery } from './query/lookups.queries';
export { serviceQuery, servicesQuery } from './query/services.queries';
export {
  incidentQuery,
  incidentRespondersQuery,
  incidentsQuery,
  incidentTimelineQuery,
} from './query/incidents.queries';
export {
  createServiceMutation,
  updateServiceMutation,
} from './query/services.mutations';
export {
  addIncidentUpdateMutation,
  changeSeverityMutation,
  changeStatusMutation,
  createIncidentMutation,
  joinIncidentMutation,
  leaveIncidentMutation,
  reopenIncidentMutation,
  resolveIncidentMutation,
  updateIncidentMutation,
} from './query/incidents.mutations';
export { shouldRetryQuery } from './query/query-retry';
