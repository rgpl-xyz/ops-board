import type { APIRequestContext } from '@playwright/test';

export interface ProvisionedIncident {
  readonly id: string;
  readonly title: string;
  readonly serviceId: string;
}

/**
 * Creates an incident the run owns, through the API rather than the UI, so a
 * journey can mutate it and still give the same result when run again. The
 * requests go through the dev proxy, which fronts the API's development
 * certificate.
 */
export async function provisionIncident(
  request: APIRequestContext,
  title: string,
): Promise<ProvisionedIncident> {
  const services = await request.get('/api/services?pageSize=1&sort=name');
  if (!services.ok()) {
    throw new Error(`Could not read services: ${services.status()}`);
  }
  const serviceId = (await services.json()).items[0].id as string;

  const created = await request.post('/api/incidents', {
    data: {
      title,
      description: 'Provisioned for a browser journey.',
      serviceId,
      severity: 'High',
    },
  });
  if (!created.ok()) {
    throw new Error(
      `Could not create an incident: ${created.status()} ${await created.text()}`,
    );
  }

  return { id: (await created.json()).id as string, title, serviceId };
}

/** The first seeded team, needed to create a service through the UI. */
export async function firstTeamName(request: APIRequestContext): Promise<string> {
  const teams = await request.get('/api/lookups/teams');
  if (!teams.ok()) {
    throw new Error(`Could not read teams: ${teams.status()}`);
  }
  return (await teams.json()).items[0].name as string;
}
