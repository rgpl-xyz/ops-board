import { inject } from '@angular/core';
import { queryOptions } from '@tanstack/angular-query-experimental';

import type { OpsBoardProblem } from '../errors/problem';
import { IdentityApi } from '../http/identity.api';
import { opsboardKeys } from './keys';

export function currentUserQuery() {
  const api = inject(IdentityApi);
  return queryOptions<
    Awaited<ReturnType<IdentityApi['getCurrentUser']>>,
    OpsBoardProblem
  >({
    queryKey: opsboardKeys.currentUser(),
    queryFn: () => api.getCurrentUser(),
  });
}

export function organizationQuery() {
  const api = inject(IdentityApi);
  return queryOptions<
    Awaited<ReturnType<IdentityApi['getOrganization']>>,
    OpsBoardProblem
  >({
    queryKey: opsboardKeys.organization(),
    queryFn: () => api.getOrganization(),
  });
}
