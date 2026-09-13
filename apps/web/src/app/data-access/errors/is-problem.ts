import type { OpsBoardProblem, OpsBoardProblemCode } from './problem';

export function isOpsBoardProblem(value: unknown): value is OpsBoardProblem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const problem = value as Partial<OpsBoardProblem>;
  return (
    typeof problem.status === 'number' &&
    typeof problem.code === 'string' &&
    typeof problem.title === 'string' &&
    typeof problem.detail === 'string'
  );
}

export function isProblemCode(
  value: unknown,
  code: OpsBoardProblemCode,
): value is OpsBoardProblem {
  return isOpsBoardProblem(value) && value.code === code;
}

export function isConcurrencyConflict(value: unknown): value is OpsBoardProblem {
  return isProblemCode(value, 'concurrency_conflict');
}

export function isLifecycleConflict(value: unknown): value is OpsBoardProblem {
  return isProblemCode(value, 'lifecycle_conflict');
}

export function isResponderConflict(value: unknown): value is OpsBoardProblem {
  return isProblemCode(value, 'responder_conflict');
}

export function isValidationFailed(value: unknown): value is OpsBoardProblem {
  return isProblemCode(value, 'validation_failed');
}

export function isForbidden(value: unknown): value is OpsBoardProblem {
  return isProblemCode(value, 'forbidden');
}

export function isUnavailable(value: unknown): value is OpsBoardProblem {
  return isProblemCode(value, 'unavailable');
}

export function isIdentityUnavailable(value: unknown): value is OpsBoardProblem {
  return isProblemCode(value, 'identity_unavailable');
}
