import { describe, expect, it } from 'vitest';

import { opsboardKeys, stableQueryPart } from './keys';

describe('stableQueryPart', () => {
  it('omits null/undefined and sorts keys', () => {
    expect(
      stableQueryPart({
        search: undefined,
        page: 1,
        teamId: null,
        sort: 'name',
      }),
    ).toEqual({ page: 1, sort: 'name' });
  });

  it('returns equal objects for equal inputs regardless of key order', () => {
    const a = stableQueryPart({ page: 1, pageSize: 25, sort: 'name' });
    const b = stableQueryPart({ sort: 'name', pageSize: 25, page: 1 });
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('rejects Date and nested objects', () => {
    expect(() => stableQueryPart({ created: new Date() } as never)).toThrow(
      /Date/,
    );
    expect(() =>
      stableQueryPart({ nested: { a: 1 } } as never),
    ).toThrow(/nested objects/);
  });
});

describe('opsboardKeys', () => {
  it('builds hierarchical shapes matching the documented key contract', () => {
    expect(opsboardKeys.currentUser()).toEqual(['opsboard', 'current-user']);
    expect(opsboardKeys.organization()).toEqual(['opsboard', 'organization']);
    expect(opsboardKeys.lookups.teams({ limit: 100 })).toEqual([
      'opsboard',
      'lookups',
      'teams',
      { limit: 100 },
    ]);
    expect(opsboardKeys.services.list({ page: 1, sort: 'name' })).toEqual([
      'opsboard',
      'services',
      'list',
      { page: 1, sort: 'name' },
    ]);
    expect(opsboardKeys.services.detail('s1')).toEqual([
      'opsboard',
      'services',
      'detail',
      's1',
    ]);
    expect(opsboardKeys.incidents.list({ status: 'Investigating' })).toEqual([
      'opsboard',
      'incidents',
      'list',
      { status: 'Investigating' },
    ]);
    expect(opsboardKeys.incidents.detail('i1')).toEqual([
      'opsboard',
      'incidents',
      'detail',
      'i1',
    ]);
    expect(opsboardKeys.incidents.responders('i1', { after: 'u1' })).toEqual([
      'opsboard',
      'incidents',
      'detail',
      'i1',
      'responders',
      { after: 'u1' },
    ]);
    expect(opsboardKeys.incidents.timeline('i1', { page: 2 })).toEqual([
      'opsboard',
      'incidents',
      'detail',
      'i1',
      'timeline',
      { page: 2 },
    ]);
  });

  it('produces equal keys for equal list/continuation inputs', () => {
    const left = opsboardKeys.incidents.list({
      page: 1,
      severity: 'High',
      search: undefined,
    });
    const right = opsboardKeys.incidents.list({
      severity: 'High',
      page: 1,
    });
    expect(left).toEqual(right);
  });
});
