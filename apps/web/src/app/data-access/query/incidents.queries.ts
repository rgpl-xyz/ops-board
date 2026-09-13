import { inject } from '@angular/core';
import { queryOptions } from '@tanstack/angular-query-experimental';

import type { ContinuationQuery, PageQuery } from '../contracts/common';
import type { IncidentQuery } from '../contracts/incidents';
import type { OpsBoardProblem } from '../errors/problem';
import { IncidentsApi } from '../http/incidents.api';
import { opsboardKeys } from './keys';

export function incidentsQuery(query: IncidentQuery = {}) {
  const api = inject(IncidentsApi);
  return queryOptions<
    Awaited<ReturnType<IncidentsApi['list']>>,
    OpsBoardProblem
  >({
    queryKey: opsboardKeys.incidents.list(query),
    queryFn: () => api.list(query),
  });
}

export function incidentQuery(id: string) {
  const api = inject(IncidentsApi);
  return queryOptions<
    Awaited<ReturnType<IncidentsApi['getById']>>,
    OpsBoardProblem
  >({
    queryKey: opsboardKeys.incidents.detail(id),
    queryFn: () => api.getById(id),
  });
}

export function incidentRespondersQuery(
  id: string,
  query: ContinuationQuery = {},
) {
  const api = inject(IncidentsApi);
  return queryOptions<
    Awaited<ReturnType<IncidentsApi['listResponders']>>,
    OpsBoardProblem
  >({
    queryKey: opsboardKeys.incidents.responders(id, query),
    queryFn: () => api.listResponders(id, query),
  });
}

export function incidentTimelineQuery(id: string, query: PageQuery = {}) {
  const api = inject(IncidentsApi);
  return queryOptions<
    Awaited<ReturnType<IncidentsApi['listTimeline']>>,
    OpsBoardProblem
  >({
    queryKey: opsboardKeys.incidents.timeline(id, query),
    queryFn: () => api.listTimeline(id, query),
  });
}
