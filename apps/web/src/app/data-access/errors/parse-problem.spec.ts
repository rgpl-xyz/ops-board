import { describe, expect, it } from 'vitest';

import {
  isConcurrencyConflict,
  isForbidden,
  isIdentityUnavailable,
  isLifecycleConflict,
  isOpsBoardProblem,
  isResponderConflict,
  isUnavailable,
  isValidationFailed,
} from './is-problem';
import { parseProblem } from './parse-problem';
import { OPSBOARD_PROBLEM_CODES } from './problem';

const CODE_FIXTURES: Record<
  (typeof OPSBOARD_PROBLEM_CODES)[number],
  { status: number; title: string; detail: string }
> = {
  identity_unavailable: {
    status: 401,
    title: 'Identity unavailable',
    detail: 'Current user context is unavailable.',
  },
  forbidden: {
    status: 403,
    title: 'Forbidden',
    detail: 'You are not allowed to perform this action.',
  },
  unavailable: {
    status: 404,
    title: 'Unavailable',
    detail: 'The requested resource is unavailable.',
  },
  validation_failed: {
    status: 400,
    title: 'Validation failed',
    detail: 'One or more validation errors occurred.',
  },
  lifecycle_conflict: {
    status: 409,
    title: 'Lifecycle conflict',
    detail: 'The requested lifecycle action is not allowed.',
  },
  responder_conflict: {
    status: 409,
    title: 'Responder conflict',
    detail: 'Responder membership conflict.',
  },
  concurrency_conflict: {
    status: 409,
    title: 'Concurrency conflict',
    detail: 'The incident changed. Reload it and reconsider this action.',
  },
  persistence_failure: {
    status: 500,
    title: 'Persistence failure',
    detail: 'The operation could not be completed.',
  },
  persistence_unavailable: {
    status: 503,
    title: 'Persistence unavailable',
    detail: 'The data store is temporarily unavailable.',
  },
};

function goldenProblem(
  code: (typeof OPSBOARD_PROBLEM_CODES)[number],
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  const fixture = CODE_FIXTURES[code];
  return {
    type: `urn:opsboard:problem:${code}`,
    title: fixture.title,
    status: fixture.status,
    detail: fixture.detail,
    instance: '/api/example',
    code,
    traceId: '00-trace-example',
    ...extras,
  };
}

describe('parseProblem', () => {
  it.each(OPSBOARD_PROBLEM_CODES)(
    'preserves Phase 2 code %s from extension field',
    (code) => {
      const body = goldenProblem(code);
      const problem = parseProblem(body);
      expect(problem.code).toBe(code);
      expect(problem.status).toBe(CODE_FIXTURES[code].status);
      expect(problem.title).toBe(CODE_FIXTURES[code].title);
      expect(problem.detail).toBe(CODE_FIXTURES[code].detail);
      expect(problem.traceId).toBe('00-trace-example');
      expect(problem.instance).toBe('/api/example');
      expect(problem.type).toBe(`urn:opsboard:problem:${code}`);
    },
  );

  it('parses validation errors extension', () => {
    const body = goldenProblem('validation_failed', {
      errors: {
        expectedVersion: ['Version is required.'],
        title: ['Title is required.'],
      },
    });
    const problem = parseProblem(body);
    expect(problem.code).toBe('validation_failed');
    expect(problem.errors).toEqual({
      expectedVersion: ['Version is required.'],
      title: ['Title is required.'],
    });
  });

  it('derives code from type suffix when code extension is absent', () => {
    const body = {
      type: 'urn:opsboard:problem:concurrency_conflict',
      title: 'Concurrency conflict',
      status: 409,
      detail: 'conflict',
    };
    expect(parseProblem(body).code).toBe('concurrency_conflict');
  });

  it('falls back to unknown for unrecognized bodies', () => {
    expect(parseProblem(null, 502).code).toBe('unknown');
    expect(parseProblem({ status: 500, title: 'x', detail: 'y' }).code).toBe(
      'unknown',
    );
  });

  it('reads HttpErrorResponse-shaped input', () => {
    const problem = parseProblem({
      status: 409,
      error: goldenProblem('concurrency_conflict'),
    });
    expect(problem.status).toBe(409);
    expect(problem.code).toBe('concurrency_conflict');
  });
});

describe('is-problem guards', () => {
  it('discriminates known conflict and client codes', () => {
    const concurrency = parseProblem(goldenProblem('concurrency_conflict'));
    expect(isOpsBoardProblem(concurrency)).toBe(true);
    expect(isConcurrencyConflict(concurrency)).toBe(true);
    expect(isLifecycleConflict(parseProblem(goldenProblem('lifecycle_conflict')))).toBe(
      true,
    );
    expect(isResponderConflict(parseProblem(goldenProblem('responder_conflict')))).toBe(
      true,
    );
    expect(isValidationFailed(parseProblem(goldenProblem('validation_failed')))).toBe(
      true,
    );
    expect(isForbidden(parseProblem(goldenProblem('forbidden')))).toBe(true);
    expect(isUnavailable(parseProblem(goldenProblem('unavailable')))).toBe(true);
    expect(
      isIdentityUnavailable(parseProblem(goldenProblem('identity_unavailable'))),
    ).toBe(true);
  });
});
