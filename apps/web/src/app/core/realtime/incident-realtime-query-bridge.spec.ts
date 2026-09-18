import { TestBed } from '@angular/core/testing';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { opsboardKeys } from '../../data-access';
import type {
  IncidentRealtimeFact,
  IncidentRealtimeFactKind,
} from './incident-realtime-fact';
import { IncidentRealtimeConnection } from './incident-realtime-connection';
import { IncidentRealtimeQueryBridge } from './incident-realtime-query-bridge';

const incidentId = '11111111-2222-3333-4444-555555555555';
type InvalidationScope = 'lists' | 'detail' | 'responders' | 'timeline';

const INVALIDATION_CASES: ReadonlyArray<
  readonly [IncidentRealtimeFactKind, readonly InvalidationScope[]]
> = [
  ['IncidentCreated', ['lists']],
  ['IncidentDetailsChanged', ['lists', 'detail']],
  ['IncidentSeverityChanged', ['lists', 'detail', 'timeline']],
  ['IncidentStatusChanged', ['lists', 'detail', 'timeline']],
  ['IncidentResolved', ['lists', 'detail', 'timeline']],
  ['IncidentReopened', ['lists', 'detail', 'timeline']],
  ['ResponderJoined', ['lists', 'detail', 'responders', 'timeline']],
  ['ResponderLeft', ['lists', 'detail', 'responders', 'timeline']],
  ['WrittenUpdateAdded', ['lists', 'detail', 'timeline']],
];

describe('IncidentRealtimeQueryBridge', () => {
  let facts: Subject<IncidentRealtimeFact>;
  let bridge: IncidentRealtimeQueryBridge;
  let queryClientSpy: ReturnType<typeof createQueryClientSpy>;

  beforeEach(() => {
    facts = new Subject<IncidentRealtimeFact>();
    queryClientSpy = createQueryClientSpy();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: IncidentRealtimeConnection,
          useValue: { facts$: facts.asObservable() },
        },
        { provide: QueryClient, useValue: queryClientSpy },
      ],
    });
    bridge = TestBed.inject(IncidentRealtimeQueryBridge);
  });

  afterEach(() => TestBed.resetTestingModule());

  for (const [kind, scopes] of INVALIDATION_CASES) {
    it(`invalidates the exact incident scopes for ${kind}`, () => {
      bridge.attach();
      facts.next(createFact(kind));

      expect(invalidatedKeys(queryClientSpy)).toEqual(
        scopes.map((scope) => keyFor(scope, incidentId)),
      );
    });
  }

  it('keeps service, identity, organization, and lookup keys untouched', () => {
    bridge.attach();
    facts.next(createFact('ResponderJoined'));

    expect(invalidatedKeys(queryClientSpy)).not.toContainEqual(
      opsboardKeys.services.all(),
    );
    expect(invalidatedKeys(queryClientSpy)).not.toContainEqual(
      opsboardKeys.currentUser(),
    );
    expect(invalidatedKeys(queryClientSpy)).not.toContainEqual(
      opsboardKeys.organization(),
    );
    expect(invalidatedKeys(queryClientSpy)).not.toContainEqual(
      opsboardKeys.lookups.all(),
    );
    expect(queryClientSpy.setQueryData).not.toHaveBeenCalled();
  });

  it('allows duplicate facts to repeat their safe invalidations', () => {
    bridge.attach();
    const fact = createFact('IncidentCreated');

    facts.next(fact);
    facts.next(fact);

    expect(invalidatedKeys(queryClientSpy)).toEqual([
      opsboardKeys.incidents.lists(),
      opsboardKeys.incidents.lists(),
    ]);
  });

  it('does not double-subscribe when attach is called repeatedly', () => {
    bridge.attach();
    bridge.attach();
    facts.next(createFact('IncidentCreated'));

    expect(invalidatedKeys(queryClientSpy)).toEqual([
      opsboardKeys.incidents.lists(),
    ]);
  });

  it('detaches cleanly and can attach again', () => {
    bridge.attach();
    bridge.detach();
    facts.next(createFact('IncidentCreated'));

    expect(invalidatedKeys(queryClientSpy)).toEqual([]);

    bridge.attach();
    facts.next(createFact('IncidentCreated'));

    expect(invalidatedKeys(queryClientSpy)).toEqual([
      opsboardKeys.incidents.lists(),
    ]);
  });
});

function createFact(kind: IncidentRealtimeFactKind): IncidentRealtimeFact {
  return {
    organizationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    incidentId,
    kind,
  };
}

function createQueryClientSpy() {
  return {
    invalidateQueries: vi.fn(
      (_filters: { queryKey: readonly unknown[] }): Promise<void> =>
        Promise.resolve(),
    ),
    setQueryData: vi.fn(),
  } as unknown as QueryClient & {
    invalidateQueries: ReturnType<typeof vi.fn>;
    setQueryData: ReturnType<typeof vi.fn>;
  };
}

function invalidatedKeys(
  queryClient: ReturnType<typeof createQueryClientSpy>,
): readonly unknown[][] {
  return queryClient.invalidateQueries.mock.calls.map(
    ([filters]) => filters.queryKey,
  );
}

function keyFor(scope: InvalidationScope, id: string): readonly unknown[] {
  switch (scope) {
    case 'lists':
      return opsboardKeys.incidents.lists();
    case 'detail':
      return opsboardKeys.incidents.detail(id);
    case 'responders':
      return [...opsboardKeys.incidents.detail(id), 'responders'];
    case 'timeline':
      return [...opsboardKeys.incidents.detail(id), 'timeline'];
  }
}
