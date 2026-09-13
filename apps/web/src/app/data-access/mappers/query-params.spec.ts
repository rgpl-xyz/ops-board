import { describe, expect, it } from 'vitest';

import { stableQueryPart } from '../query/keys';
import {
  incidentQueryFromParams,
  incidentQueryToParams,
} from './incident-query.params';
import {
  serviceQueryFromParams,
  serviceQueryToParams,
} from './service-query.params';

describe('service query param mappers', () => {
  it('omits Phase 2 defaults and never emits unknown keys', () => {
    expect(serviceQueryToParams({})).toEqual({});
    expect(
      serviceQueryToParams({
        page: 1,
        pageSize: 25,
        sort: 'name',
        direction: 'asc',
      }),
    ).toEqual({});
    expect(
      serviceQueryToParams({
        page: 2,
        teamId: 't1',
        health: 'Degraded',
        search: 'api',
        direction: 'desc',
      }),
    ).toEqual({
      page: '2',
      teamId: 't1',
      health: 'Degraded',
      search: 'api',
      direction: 'desc',
    });
  });

  it('ignores unknown keys and invalid allowlist values on parse', () => {
    expect(
      serviceQueryFromParams({
        page: '3',
        health: 'Nope',
        sort: 'nope',
        direction: 'sideways',
        unknown: 'x',
      }),
    ).toEqual({ page: 3 });
  });

  it('round-trips stably under stableQueryPart', () => {
    const original = {
      page: 2,
      pageSize: 10,
      teamId: 't1',
      health: 'Outage' as const,
      search: 'pay',
      direction: 'desc',
    };
    const roundTrip = serviceQueryFromParams(serviceQueryToParams(original));
    expect(stableQueryPart(roundTrip)).toEqual(stableQueryPart(original));
  });
});

describe('incident query param mappers', () => {
  it('omits defaults and allowlists enums', () => {
    expect(incidentQueryToParams({})).toEqual({});
    expect(
      incidentQueryToParams({
        page: 1,
        pageSize: 25,
        sort: 'createdAt',
        direction: 'desc',
      }),
    ).toEqual({});
    expect(
      incidentQueryToParams({
        severity: 'Critical',
        status: 'Monitoring',
        serviceId: 's1',
        sort: 'severity',
        direction: 'asc',
      }),
    ).toEqual({
      severity: 'Critical',
      status: 'Monitoring',
      serviceId: 's1',
      sort: 'severity',
      direction: 'asc',
    });
  });

  it('ignores unknown keys and invalid enums on parse', () => {
    expect(
      incidentQueryFromParams({
        status: 'Nope',
        severity: 'Nope',
        foo: 'bar',
        page: '2',
      }),
    ).toEqual({ page: 2 });
  });

  it('round-trips stably under stableQueryPart', () => {
    const original = {
      page: 4,
      teamId: 't1',
      severity: 'High' as const,
      status: 'Investigating' as const,
      search: 'db',
      sort: 'severity',
      direction: 'asc',
    };
    const roundTrip = incidentQueryFromParams(incidentQueryToParams(original));
    expect(stableQueryPart(roundTrip)).toEqual(stableQueryPart(original));
  });
});
