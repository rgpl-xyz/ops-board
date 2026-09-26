import type { ServiceHealth } from '../contracts/enums';
import type { ServiceQuery } from '../contracts/services';
import { SERVICE_HEALTHS } from '../contracts/enums';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_SORT = 'name';
const DEFAULT_DIRECTION = 'asc';
const ALLOWED_SORT = new Set(['name', 'health', 'updatedAt']);
const ALLOWED_DIRECTION = new Set(['asc', 'desc']);
const ALLOWED_HEALTH = new Set<string>(SERVICE_HEALTHS);

export type ParamsRecord = Record<string, string>;

export function serviceQueryToParams(query: ServiceQuery): ParamsRecord {
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
  if (query.teamId) {
    params['teamId'] = query.teamId;
  }
  if (query.health) {
    params['health'] = query.health;
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

export function serviceQueryFromParams(params: ParamsRecord): ServiceQuery {
  const query: ServiceQuery = {};
  const page = parsePositiveInt(params['page']);
  const pageSize = parsePositiveInt(params['pageSize']);
  if (page !== undefined) {
    query.page = page;
  }
  if (pageSize !== undefined) {
    query.pageSize = pageSize;
  }
  if (params['teamId']) {
    query.teamId = params['teamId'];
  }
  if (params['health'] && ALLOWED_HEALTH.has(params['health'])) {
    query.health = params['health'] as ServiceHealth;
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
