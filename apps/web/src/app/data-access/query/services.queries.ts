import { inject } from '@angular/core';
import { queryOptions } from '@tanstack/angular-query-experimental';

import type { ServiceQuery } from '../contracts/services';
import type { OpsBoardProblem } from '../errors/problem';
import { ServicesApi } from '../http/services.api';
import { opsboardKeys } from './keys';

export function servicesQuery(query: ServiceQuery = {}) {
  const api = inject(ServicesApi);
  return queryOptions<
    Awaited<ReturnType<ServicesApi['list']>>,
    OpsBoardProblem
  >({
    queryKey: opsboardKeys.services.list(query),
    queryFn: () => api.list(query),
  });
}

export function serviceQuery(id: string) {
  const api = inject(ServicesApi);
  return queryOptions<
    Awaited<ReturnType<ServicesApi['getById']>>,
    OpsBoardProblem
  >({
    queryKey: opsboardKeys.services.detail(id),
    queryFn: () => api.getById(id),
  });
}
