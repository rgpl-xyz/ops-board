import type { ParamMap } from '@angular/router';
import type { Router } from '@angular/router';

import type { IncidentQuery, ServiceQuery } from '../../data-access';
import {
  incidentQueryFromParams,
  incidentQueryToParams,
  serviceQueryFromParams,
  serviceQueryToParams,
} from '../../data-access';
import type { ParamsRecord } from '../../data-access/mappers/incident-query.params';

/**
 * Convert Angular ParamMap to the plain record Phase 3 mappers expect.
 * List Query inputs must bind a *reactive* queryParamMap (e.g. toSignal) —
 * never ActivatedRoute.snapshot.queryParamMap.
 */
export function paramMapToRecord(map: ParamMap): ParamsRecord {
  const record: ParamsRecord = {};
  for (const key of map.keys) {
    const value = map.get(key);
    if (value !== null) {
      record[key] = value;
    }
  }
  return record;
}

export function incidentListQueryFromParamMap(map: ParamMap): IncidentQuery {
  return incidentQueryFromParams(paramMapToRecord(map));
}

export function serviceListQueryFromParamMap(map: ParamMap): ServiceQuery {
  return serviceQueryFromParams(paramMapToRecord(map));
}

/** Fields that reset page to 1 when they change in a committed navigate. */
const INCIDENT_PAGE_RESET_KEYS = [
  'status',
  'severity',
  'serviceId',
  'teamId',
  'search',
  'sort',
  'direction',
  'pageSize',
] as const;

const SERVICE_PAGE_RESET_KEYS = [
  'teamId',
  'health',
  'search',
  'sort',
  'direction',
  'pageSize',
] as const;

export function withPageResetOnFilterChange(
  previous: IncidentQuery,
  next: IncidentQuery,
): IncidentQuery {
  if (shouldResetIncidentPage(previous, next)) {
    const { page: _ignored, ...rest } = next;
    return rest;
  }
  return next;
}

export function withServicePageResetOnFilterChange(
  previous: ServiceQuery,
  next: ServiceQuery,
): ServiceQuery {
  if (shouldResetServicePage(previous, next)) {
    const { page: _ignored, ...rest } = next;
    return rest;
  }
  return next;
}

function shouldResetIncidentPage(
  previous: IncidentQuery,
  next: IncidentQuery,
): boolean {
  for (const key of INCIDENT_PAGE_RESET_KEYS) {
    if ((previous[key] ?? undefined) !== (next[key] ?? undefined)) {
      return true;
    }
  }
  return false;
}

function shouldResetServicePage(
  previous: ServiceQuery,
  next: ServiceQuery,
): boolean {
  for (const key of SERVICE_PAGE_RESET_KEYS) {
    if ((previous[key] ?? undefined) !== (next[key] ?? undefined)) {
      return true;
    }
  }
  return false;
}

export function navigateIncidentListQuery(
  router: Router,
  query: IncidentQuery,
): Promise<boolean> {
  return router.navigate(['/incidents'], {
    queryParams: incidentQueryToParams(query),
    queryParamsHandling: '',
  });
}

export function navigateServiceListQuery(
  router: Router,
  query: ServiceQuery,
): Promise<boolean> {
  return router.navigate(['/services'], {
    queryParams: serviceQueryToParams(query),
    queryParamsHandling: '',
  });
}
