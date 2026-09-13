import { isOpsBoardProblem } from '../errors/is-problem';

/**
 * Query retry policy: skip retries for 4xx OpsBoardProblem; otherwise allow
 * up to one failure (scaffold `retry: 1` semantics via boolean/failureCount).
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isOpsBoardProblem(error) && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}
