import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  type IncidentSeverity,
  type IncidentStatus,
} from '../contracts/enums';
import type { IncidentQuery } from '../contracts/incidents';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_SORT = 'createdAt';
const DEFAULT_DIRECTION = 'desc';
const ALLOWED_SORT = new Set(['createdAt', 'severity', 'status']);
const ALLOWED_DIRECTION = new Set(['asc', 'desc']);
const ALLOWED_SEVERITY = new Set<string>(INCIDENT_SEVERITIES);
const ALLOWED_STATUS = new Set<string>(INCIDENT_STATUSES);

export type ParamsRecord = Record<string, string>;

export function incidentQueryToParams(query: IncidentQuery): ParamsRecord {
  const params: ParamsRecord = {};
  const page = query.page ?? DEFAULT_PAGE;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const sort = normalizeSort(query.sort);
  const direction = normalizeDirection(query.direction);

  if (page !== DEFAULT_PAGE) {
    params['page'] = String(page);
  }
  if (pageSize !== DEFAULT_PAGE_SIZE) {
    params['pageSize'] = String(pageSize);
  }
  if (query.serviceId) {
    params['serviceId'] = query.serviceId;
  }
  if (query.teamId) {
    params['teamId'] = query.teamId;
  }
  if (query.severity) {
    params['severity'] = query.severity;
  }
  if (query.status) {
    params['status'] = query.status;
  }
  if (query.search) {
    params['search'] = query.search;
  }
  if (sort !== DEFAULT_SORT) {
    params['sort'] = sort;
  }
  if (direction !== DEFAULT_DIRECTION) {
    params['direction'] = direction;
  }
  return params;
}

export function incidentQueryFromParams(params: ParamsRecord): IncidentQuery {
  const query: IncidentQuery = {};
  const page = parsePositiveInt(params['page']);
  const pageSize = parsePositiveInt(params['pageSize']);
  if (page !== undefined) {
    query.page = page;
  }
  if (pageSize !== undefined) {
    query.pageSize = pageSize;
  }
  if (params['serviceId']) {
    query.serviceId = params['serviceId'];
  }
  if (params['teamId']) {
    query.teamId = params['teamId'];
  }
  if (params['severity'] && ALLOWED_SEVERITY.has(params['severity'])) {
    query.severity = params['severity'] as IncidentSeverity;
  }
  if (params['status'] && ALLOWED_STATUS.has(params['status'])) {
    query.status = params['status'] as IncidentStatus;
  }
  if (params['search']) {
    query.search = params['search'];
  }
  const sort = normalizeSort(params['sort']);
  const direction = normalizeDirection(params['direction']);
  if (sort !== DEFAULT_SORT) {
    query.sort = sort;
  }
  if (direction !== DEFAULT_DIRECTION) {
    query.direction = direction;
  }
  return query;
}

function normalizeSort(value: string | undefined): string {
  return value && ALLOWED_SORT.has(value) ? value : DEFAULT_SORT;
}

function normalizeDirection(value: string | undefined): string {
  return value && ALLOWED_DIRECTION.has(value) ? value : DEFAULT_DIRECTION;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return undefined;
  }
  return parsed;
}
