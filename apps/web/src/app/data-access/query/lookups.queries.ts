import { inject } from '@angular/core';
import { queryOptions } from '@tanstack/angular-query-experimental';

import type { ContinuationQuery } from '../contracts/common';
import type { OpsBoardProblem } from '../errors/problem';
import { LookupsApi } from '../http/lookups.api';
import { opsboardKeys } from './keys';

export function teamsQuery(query: ContinuationQuery = {}) {
  const api = inject(LookupsApi);
  return queryOptions<
    Awaited<ReturnType<LookupsApi['listTeams']>>,
    OpsBoardProblem
  >({
    queryKey: opsboardKeys.lookups.teams(query),
    queryFn: () => api.listTeams(query),
  });
}

export function usersQuery(query: ContinuationQuery = {}) {
  const api = inject(LookupsApi);
  return queryOptions<
    Awaited<ReturnType<LookupsApi['listUsers']>>,
    OpsBoardProblem
  >({
    queryKey: opsboardKeys.lookups.users(query),
    queryFn: () => api.listUsers(query),
  });
}
