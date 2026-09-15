import { convertToParamMap } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import {
  incidentListQueryFromParamMap,
  navigateIncidentListQuery,
  paramMapToRecord,
  withPageResetOnFilterChange,
  withServicePageResetOnFilterChange,
} from './list-query.sync';

describe('list-query.sync', () => {
  it('maps ParamMap to a plain record for Phase 3 mappers', () => {
    const map = convertToParamMap({
      status: 'Investigating',
      page: '2',
      ignoredEmpty: null,
    });
    expect(paramMapToRecord(map)).toEqual({
      status: 'Investigating',
      page: '2',
    });
  });

  it('parses incident list query from ParamMap via Phase 3 fromParams', () => {
    const map = convertToParamMap({
      status: 'Investigating',
      severity: 'Critical',
      page: '2',
    });
    expect(incidentListQueryFromParamMap(map)).toEqual({
      status: 'Investigating',
      severity: 'Critical',
      page: 2,
    });
  });

  it('resets page when committed filters/search/sort/pageSize change', () => {
    const previous = { page: 3, status: 'Investigating' as const };
    const next = { page: 3, status: 'Resolved' as const };
    expect(withPageResetOnFilterChange(previous, next)).toEqual({
      status: 'Resolved',
    });
  });

  it('keeps page when only page changes', () => {
    const previous = { page: 1, status: 'Investigating' as const };
    const next = { page: 2, status: 'Investigating' as const };
    expect(withPageResetOnFilterChange(previous, next)).toEqual(next);
  });

  it('resets service list page on health/search changes', () => {
    const previous = { page: 4, health: 'Operational' as const };
    const next = { page: 4, health: 'Outage' as const };
    expect(withServicePageResetOnFilterChange(previous, next)).toEqual({
      health: 'Outage',
    });
  });

  it('navigates incidents with mapper queryParams and empty handling', async () => {
    const navigate = vi.fn().mockResolvedValue(true);
    const router = { navigate } as never;
    await navigateIncidentListQuery(router, {
      status: 'Investigating',
      page: 1,
    });
    expect(navigate).toHaveBeenCalledWith(['/incidents'], {
      queryParams: { status: 'Investigating' },
      queryParamsHandling: '',
    });
  });
});
