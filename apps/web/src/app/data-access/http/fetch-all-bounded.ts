import type { Bounded } from '../contracts/common';

export class FetchAllBoundedExceededError extends Error {
  readonly maxPages: number;

  constructor(maxPages: number) {
    super(`fetchAllBounded exceeded maxPages=${maxPages}.`);
    this.name = 'FetchAllBoundedExceededError';
    this.maxPages = maxPages;
  }
}

export interface FetchAllBoundedOptions {
  limit?: number;
  maxPages?: number;
}

/**
 * Optional helper: follows Bounded.nextAfter until exhausted.
 * Not the default lookup/responder queryFn — primary API remains one page.
 */
export async function fetchAllBounded<T>(
  fetchPage: (args: {
    limit: number;
    after: string | null;
  }) => Promise<Bounded<T>>,
  options: FetchAllBoundedOptions = {},
): Promise<T[]> {
  const limit = options.limit ?? 100;
  const maxPages = options.maxPages ?? 20;
  const items: T[] = [];
  let after: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const result = await fetchPage({ limit, after });
    items.push(...result.items);
    if (result.nextAfter == null) {
      return items;
    }
    after = result.nextAfter;
  }

  throw new FetchAllBoundedExceededError(maxPages);
}
