import { describe, expect, it, vi } from 'vitest';

import {
  FetchAllBoundedExceededError,
  fetchAllBounded,
} from './fetch-all-bounded';

describe('fetchAllBounded', () => {
  it('concatenates pages in order and stops when nextAfter is absent', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ id: 'a' }, { id: 'b' }],
        nextAfter: 'cursor-1',
      })
      .mockResolvedValueOnce({
        items: [{ id: 'c' }],
        nextAfter: null,
      });

    await expect(
      fetchAllBounded(fetchPage, { limit: 2, maxPages: 20 }),
    ).resolves.toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, { limit: 2, after: null });
    expect(fetchPage).toHaveBeenNthCalledWith(2, {
      limit: 2,
      after: 'cursor-1',
    });
  });

  it('throws when maxPages is exceeded', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      items: [{ id: 'x' }],
      nextAfter: 'more',
    });

    await expect(
      fetchAllBounded(fetchPage, { limit: 1, maxPages: 2 }),
    ).rejects.toBeInstanceOf(FetchAllBoundedExceededError);

    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
