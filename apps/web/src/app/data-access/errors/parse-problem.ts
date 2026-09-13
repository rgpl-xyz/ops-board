import {
  isKnownProblemCode,
  type OpsBoardProblem,
  type OpsBoardProblemCode,
} from './problem';

const TYPE_PREFIX = 'urn:opsboard:problem:';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readStatus(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readErrors(value: unknown): Record<string, string[]> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const errors: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(value)) {
    if (
      Array.isArray(messages) &&
      messages.every((message) => typeof message === 'string')
    ) {
      errors[key] = messages;
    }
  }
  return Object.keys(errors).length > 0 ? errors : undefined;
}

function codeFromType(type: string | undefined): OpsBoardProblemCode | 'unknown' {
  if (!type?.startsWith(TYPE_PREFIX)) {
    return 'unknown';
  }
  const suffix = type.slice(TYPE_PREFIX.length);
  return isKnownProblemCode(suffix) ? suffix : 'unknown';
}

function resolveCode(
  body: Record<string, unknown>,
): OpsBoardProblemCode | 'unknown' {
  const rawCode = readString(body['code']);
  if (rawCode && isKnownProblemCode(rawCode)) {
    return rawCode;
  }
  return codeFromType(readString(body['type']));
}

/**
 * Normalize an HTTP failure into OpsBoardProblem.
 * Does not log bodies, tokens, or user-authored text.
 */
export function parseProblem(input: unknown, fallbackStatus = 0): OpsBoardProblem {
  let status = fallbackStatus;
  let body: unknown = input;

  if (isRecord(input) && 'status' in input && 'error' in input) {
    status = readStatus(input['status'], fallbackStatus);
    body = input['error'];
  }

  if (!isRecord(body)) {
    return {
      status,
      code: 'unknown',
      title: 'Request failed',
      detail: 'The API request failed.',
    };
  }

  const resolvedStatus = readStatus(body['status'], status);
  return {
    status: resolvedStatus,
    code: resolveCode(body),
    title: readString(body['title']) ?? 'Request failed',
    detail: readString(body['detail']) ?? 'The API request failed.',
    instance: readString(body['instance']),
    type: readString(body['type']),
    traceId: readString(body['traceId']),
    errors: readErrors(body['errors']),
  };
}
