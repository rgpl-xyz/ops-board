import {
  INCIDENT_REALTIME_FACT_KINDS,
  type IncidentRealtimeFact,
  type IncidentRealtimeFactKind,
} from './incident-realtime-fact';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateIncidentFact(value: unknown): IncidentRealtimeFact | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    !isUuid(candidate['organizationId']) ||
    !isUuid(candidate['incidentId']) ||
    !isIncidentRealtimeFactKind(candidate['kind']) ||
    !isOptionalString(candidate['version']) ||
    !isOptionalString(candidate['lifecycleVersion']) ||
    !isOptionalOccurredAtUtc(candidate['occurredAtUtc'])
  ) {
    return null;
  }

  return {
    organizationId: candidate['organizationId'],
    incidentId: candidate['incidentId'],
    kind: candidate['kind'],
    ...(candidate['version'] !== undefined ? { version: candidate['version'] } : {}),
    ...(candidate['lifecycleVersion'] !== undefined
      ? { lifecycleVersion: candidate['lifecycleVersion'] }
      : {}),
    ...(candidate['occurredAtUtc'] !== undefined
      ? { occurredAtUtc: candidate['occurredAtUtc'] }
      : {}),
  };
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isIncidentRealtimeFactKind(
  value: unknown,
): value is IncidentRealtimeFactKind {
  return (
    typeof value === 'string' &&
    (INCIDENT_REALTIME_FACT_KINDS as readonly string[]).includes(value)
  );
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function isOptionalOccurredAtUtc(value: unknown): value is string | undefined {
  return (
    value === undefined ||
    (typeof value === 'string' && !Number.isNaN(Date.parse(value)))
  );
}
