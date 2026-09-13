import { inject } from '@angular/core';
import {
  mutationOptions,
  QueryClient,
} from '@tanstack/angular-query-experimental';

import type {
  CreateServiceRequest,
  UpdateServiceRequest,
} from '../contracts/services';
import { isConcurrencyConflict } from '../errors/is-problem';
import type { OpsBoardProblem } from '../errors/problem';
import { ServicesApi } from '../http/services.api';
import {
  applyServiceWriteSuccess,
  invalidateServiceConcurrency,
} from './cache-matrix';

export function createServiceMutation() {
  const api = inject(ServicesApi);
  const queryClient = inject(QueryClient);
  return mutationOptions<
    Awaited<ReturnType<ServicesApi['create']>>,
    OpsBoardProblem,
    CreateServiceRequest
  >({
    mutationFn: (body) => api.create(body),
    retry: false,
    onSuccess: (created) => {
      applyServiceWriteSuccess(queryClient, created);
    },
  });
}

export function updateServiceMutation() {
  const api = inject(ServicesApi);
  const queryClient = inject(QueryClient);
  return mutationOptions<
    Awaited<ReturnType<ServicesApi['update']>>,
    OpsBoardProblem,
    { id: string; body: UpdateServiceRequest }
  >({
    mutationFn: ({ id, body }) => api.update(id, body),
    retry: false,
    onSuccess: (updated) => {
      applyServiceWriteSuccess(queryClient, updated);
    },
    onError: (error, variables) => {
      if (isConcurrencyConflict(error)) {
        invalidateServiceConcurrency(queryClient, variables.id);
      }
    },
  });
}
