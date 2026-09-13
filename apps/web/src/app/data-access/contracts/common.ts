/**
 * Branded decimal-string revision / sequence values from Phase 2.
 * Never coerce with Number(...) — large values must stay exact strings.
 */
export type RevisionString = string & { readonly __brand: 'RevisionString' };

const DECIMAL_REVISION = /^[1-9]\d*$/;

export function isRevisionString(value: unknown): value is RevisionString {
  return typeof value === 'string' && DECIMAL_REVISION.test(value);
}

export function asRevisionString(raw: string): RevisionString {
  if (!isRevisionString(raw)) {
    throw new Error('Revision must be a positive decimal string.');
  }
  return raw;
}

/** Page envelope — mirrors Application `PageResult<T>` camelCase JSON. */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/** Bounded continuation envelope — mirrors Application `Bounded<T>`. */
export interface Bounded<T> {
  items: T[];
  nextAfter: string | null;
}

export interface ContinuationQuery {
  limit?: number;
  after?: string | null;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
}
