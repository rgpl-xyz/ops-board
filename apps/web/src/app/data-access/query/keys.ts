import type { ContinuationQuery, PageQuery } from '../contracts/common';
import type { IncidentQuery } from '../contracts/incidents';
import type { ServiceQuery } from '../contracts/services';

type StablePrimitive = string | number | boolean;

/**
 * Deterministic Query key segment for list/continuation inputs.
 * Omits null/undefined; sorts object keys; rejects Date/nested objects.
 */
export function stableQueryPart(
  value: StablePrimitive | object,
): StablePrimitive | Record<string, StablePrimitive> {
  if (value === null || value === undefined) {
    throw new Error('stableQueryPart does not accept null/undefined roots.');
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Object.prototype.toString.call(value) === '[object Date]') {
    throw new Error('stableQueryPart rejects Date values.');
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('stableQueryPart rejects arrays and non-plain objects.');
  }

  const result: Record<string, StablePrimitive> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const entry = (value as Record<string, unknown>)[key];
    if (entry === null || entry === undefined) {
      continue;
    }
    if (Object.prototype.toString.call(entry) === '[object Date]') {
      throw new Error('stableQueryPart rejects Date values.');
    }
    if (typeof entry === 'object') {
      throw new Error('stableQueryPart rejects nested objects.');
    }
    if (
      typeof entry === 'string' ||
      typeof entry === 'number' ||
      typeof entry === 'boolean'
    ) {
      result[key] = entry;
    } else {
      throw new Error('stableQueryPart rejects unsupported value types.');
    }
  }
  return result;
}

export const opsboardKeys = {
  all: ['opsboard'] as const,
  currentUser: () => [...opsboardKeys.all, 'current-user'] as const,
  organization: () => [...opsboardKeys.all, 'organization'] as const,
  lookups: {
    all: () => [...opsboardKeys.all, 'lookups'] as const,
    teams: (q: ContinuationQuery) =>
      [...opsboardKeys.lookups.all(), 'teams', stableQueryPart(q)] as const,
    users: (q: ContinuationQuery) =>
      [...opsboardKeys.lookups.all(), 'users', stableQueryPart(q)] as const,
  },
  services: {
    all: () => [...opsboardKeys.all, 'services'] as const,
    lists: () => [...opsboardKeys.services.all(), 'list'] as const,
    list: (q: ServiceQuery) =>
      [...opsboardKeys.services.lists(), stableQueryPart(q)] as const,
    detail: (id: string) =>
      [...opsboardKeys.services.all(), 'detail', id] as const,
  },
  incidents: {
    all: () => [...opsboardKeys.all, 'incidents'] as const,
    lists: () => [...opsboardKeys.incidents.all(), 'list'] as const,
    list: (q: IncidentQuery) =>
      [...opsboardKeys.incidents.lists(), stableQueryPart(q)] as const,
    detail: (id: string) =>
      [...opsboardKeys.incidents.all(), 'detail', id] as const,
    responders: (id: string, q: ContinuationQuery) =>
      [
        ...opsboardKeys.incidents.detail(id),
        'responders',
        stableQueryPart(q),
      ] as const,
    timeline: (id: string, q: PageQuery) =>
      [
        ...opsboardKeys.incidents.detail(id),
        'timeline',
        stableQueryPart(q),
      ] as const,
  },
};
