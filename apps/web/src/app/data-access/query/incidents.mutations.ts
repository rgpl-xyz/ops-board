import { inject } from '@angular/core';
import {
  mutationOptions,
  QueryClient,
} from '@tanstack/angular-query-experimental';

import type {
  CreateIncidentRequest,
  SeverityRequest,
  StatusRequest,
  UpdateIncidentRequest,
  VersionRequest,
} from '../contracts/incidents';
import { isConcurrencyConflict } from '../errors/is-problem';
import type { OpsBoardProblem } from '../errors/problem';
import { IncidentsApi } from '../http/incidents.api';
import {
  applyIncidentDetailWriteSuccess,
  invalidateIncidentConcurrency,
} from './cache-matrix';

export function createIncidentMutation() {
  const api = inject(IncidentsApi);
  const queryClient = inject(QueryClient);
  return mutationOptions<
    Awaited<ReturnType<IncidentsApi['create']>>,
    OpsBoardProblem,
    CreateIncidentRequest
  >({
    mutationFn: (body) => api.create(body),
    retry: false,
    onSuccess: (created) => {
      applyIncidentDetailWriteSuccess(queryClient, created);
    },
  });
}

export function updateIncidentMutation() {
  const api = inject(IncidentsApi);
  const queryClient = inject(QueryClient);
  return mutationOptions<
    Awaited<ReturnType<IncidentsApi['update']>>,
    OpsBoardProblem,
    { id: string; body: UpdateIncidentRequest }
  >({
    mutationFn: ({ id, body }) => api.update(id, body),
    retry: false,
    onSuccess: (detail) => {
      applyIncidentDetailWriteSuccess(queryClient, detail);
    },
    onError: (error, variables) => {
      if (isConcurrencyConflict(error)) {
        invalidateIncidentConcurrency(queryClient, variables.id);
      }
    },
  });
}

export function changeSeverityMutation() {
  const api = inject(IncidentsApi);
  const queryClient = inject(QueryClient);
  return mutationOptions<
    Awaited<ReturnType<IncidentsApi['changeSeverity']>>,
    OpsBoardProblem,
    { id: string; body: SeverityRequest }
  >({
    mutationFn: ({ id, body }) => api.changeSeverity(id, body),
    retry: false,
    onSuccess: (detail) => {
      applyIncidentDetailWriteSuccess(queryClient, detail, {
        invalidateTimeline: true,
      });
    },
    onError: (error, variables) => {
      if (isConcurrencyConflict(error)) {
        invalidateIncidentConcurrency(queryClient, variables.id);
      }
    },
  });
}

export function changeStatusMutation() {
  const api = inject(IncidentsApi);
  const queryClient = inject(QueryClient);
  return mutationOptions<
    Awaited<ReturnType<IncidentsApi['changeStatus']>>,
    OpsBoardProblem,
    { id: string; body: StatusRequest }
  >({
    mutationFn: ({ id, body }) => api.changeStatus(id, body),
    retry: false,
    onSuccess: (detail) => {
      applyIncidentDetailWriteSuccess(queryClient, detail, {
        invalidateTimeline: true,
      });
    },
    onError: (error, variables) => {
      if (isConcurrencyConflict(error)) {
        invalidateIncidentConcurrency(queryClient, variables.id);
      }
    },
  });
}

export function resolveIncidentMutation() {
  const api = inject(IncidentsApi);
  const queryClient = inject(QueryClient);
  return mutationOptions<
    Awaited<ReturnType<IncidentsApi['resolve']>>,
    OpsBoardProblem,
    { id: string; body: VersionRequest }
  >({
    mutationFn: ({ id, body }) => api.resolve(id, body),
    retry: false,
    onSuccess: (detail) => {
      applyIncidentDetailWriteSuccess(queryClient, detail, {
        invalidateTimeline: true,
      });
    },
    onError: (error, variables) => {
      if (isConcurrencyConflict(error)) {
        invalidateIncidentConcurrency(queryClient, variables.id);
      }
    },
  });
}

export function reopenIncidentMutation() {
  const api = inject(IncidentsApi);
  const queryClient = inject(QueryClient);
  return mutationOptions<
    Awaited<ReturnType<IncidentsApi['reopen']>>,
    OpsBoardProblem,
    { id: string; body: VersionRequest }
  >({
    mutationFn: ({ id, body }) => api.reopen(id, body),
    retry: false,
    onSuccess: (detail) => {
      applyIncidentDetailWriteSuccess(queryClient, detail, {
        invalidateTimeline: true,
      });
    },
    onError: (error, variables) => {
      if (isConcurrencyConflict(error)) {
        invalidateIncidentConcurrency(queryClient, variables.id);
      }
    },
  });
}
