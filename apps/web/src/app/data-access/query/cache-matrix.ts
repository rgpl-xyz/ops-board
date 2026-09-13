import type { QueryClient } from '@tanstack/angular-query-experimental';

import type { RevisionString } from '../contracts/common';
import type {
  IncidentDetailDto,
  ResponseMutationDto,
} from '../contracts/incidents';
import type { ServiceDto } from '../contracts/services';
import { opsboardKeys } from './keys';

export function applyServiceWriteSuccess(
  client: QueryClient,
  service: ServiceDto,
): void {
  client.setQueryData(opsboardKeys.services.detail(service.id), service);
  void client.invalidateQueries({ queryKey: opsboardKeys.services.lists() });
}

export function invalidateServiceConcurrency(
  client: QueryClient,
  id: string,
): void {
  void client.invalidateQueries({ queryKey: opsboardKeys.services.detail(id) });
  void client.invalidateQueries({ queryKey: opsboardKeys.services.lists() });
}

export function applyIncidentDetailWriteSuccess(
  client: QueryClient,
  detail: IncidentDetailDto,
  options: { invalidateTimeline?: boolean } = {},
): void {
  client.setQueryData(opsboardKeys.incidents.detail(detail.id), detail);
  void client.invalidateQueries({ queryKey: opsboardKeys.incidents.lists() });
  if (options.invalidateTimeline) {
    invalidateIncidentTimelinePrefix(client, detail.id);
  }
}

export function patchIncidentRevisionsIfCached(
  client: QueryClient,
  mutation: Pick<
    ResponseMutationDto,
    'incidentId' | 'version' | 'lifecycleVersion'
  >,
): void {
  const key = opsboardKeys.incidents.detail(mutation.incidentId);
  const existing = client.getQueryData<IncidentDetailDto>(key);
  if (!existing) {
    return;
  }
  client.setQueryData(key, {
    ...existing,
    version: mutation.version as RevisionString,
    lifecycleVersion: mutation.lifecycleVersion as RevisionString,
  });
}

export function invalidateIncidentLists(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: opsboardKeys.incidents.lists() });
}

export function invalidateIncidentRespondersPrefix(
  client: QueryClient,
  id: string,
): void {
  void client.invalidateQueries({
    queryKey: [...opsboardKeys.incidents.detail(id), 'responders'],
  });
}

export function invalidateIncidentTimelinePrefix(
  client: QueryClient,
  id: string,
): void {
  void client.invalidateQueries({
    queryKey: [...opsboardKeys.incidents.detail(id), 'timeline'],
  });
}

export function invalidateIncidentConcurrency(
  client: QueryClient,
  id: string,
): void {
  void client.invalidateQueries({ queryKey: opsboardKeys.incidents.detail(id) });
  invalidateIncidentLists(client);
  invalidateIncidentRespondersPrefix(client, id);
  invalidateIncidentTimelinePrefix(client, id);
}
