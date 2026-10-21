import { inject } from '@angular/core';
import {
  mutationOptions,
  queryOptions,
} from '@tanstack/angular-query-experimental';

import type { OpsBoardProblem } from '../errors/problem';
import { AssistantApi } from '../http/assistant.api';
import { opsboardKeys } from './keys';

/** Whether AI assistance is on. It is server configuration, so it rarely changes. */
export function assistantStatusQuery() {
  const api = inject(AssistantApi);
  return queryOptions<
    Awaited<ReturnType<AssistantApi['getStatus']>>,
    OpsBoardProblem
  >({
    queryKey: opsboardKeys.assistant.status(),
    queryFn: () => api.getStatus(),
    staleTime: 5 * 60_000,
  });
}

export interface IncidentBriefVariables {
  incidentId: string;
  signal?: AbortSignal;
}

export interface IncidentQuestionVariables {
  incidentId: string;
  question: string;
  signal?: AbortSignal;
}

/** Like a brief, a question spends provider allowance, so it runs only when asked. */
export function incidentQuestionMutation() {
  const api = inject(AssistantApi);
  return mutationOptions<
    Awaited<ReturnType<AssistantApi['askQuestion']>>,
    OpsBoardProblem,
    IncidentQuestionVariables
  >({
    mutationFn: ({ incidentId, question, signal }) => api.askQuestion(incidentId, question, signal),
    retry: false,
  });
}

/**
 * A brief is a mutation, not a query: each one spends provider allowance, so
 * it runs only when a person asks, never on focus, mount or reconnect. It
 * changes no cached server state.
 */
export function incidentBriefMutation() {
  const api = inject(AssistantApi);
  return mutationOptions<
    Awaited<ReturnType<AssistantApi['generateBrief']>>,
    OpsBoardProblem,
    IncidentBriefVariables
  >({
    mutationFn: ({ incidentId, signal }) => api.generateBrief(incidentId, signal),
    retry: false,
  });
}
