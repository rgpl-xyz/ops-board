export type OpsBoardProblemCode =
  | 'identity_unavailable'
  | 'forbidden'
  | 'unavailable'
  | 'validation_failed'
  | 'lifecycle_conflict'
  | 'responder_conflict'
  | 'concurrency_conflict'
  | 'persistence_failure'
  | 'persistence_unavailable';

export const OPSBOARD_PROBLEM_CODES = [
  'identity_unavailable',
  'forbidden',
  'unavailable',
  'validation_failed',
  'lifecycle_conflict',
  'responder_conflict',
  'concurrency_conflict',
  'persistence_failure',
  'persistence_unavailable',
] as const satisfies readonly OpsBoardProblemCode[];

export interface OpsBoardProblem {
  status: number;
  code: OpsBoardProblemCode | 'unknown';
  title: string;
  detail: string;
  instance?: string;
  type?: string;
  traceId?: string;
  errors?: Record<string, string[]>;
}

export function isKnownProblemCode(value: string): value is OpsBoardProblemCode {
  return (OPSBOARD_PROBLEM_CODES as readonly string[]).includes(value);
}
