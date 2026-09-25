# ADR 0001: Server state ownership

Status: accepted

Scope: where data fetched from the API lives in the web application, and the rules around it. How the application keeps this cache in step with the server is described in the [frontend architecture](../frontend-architecture.md#state-ownership).

## Context

The project brief fixed the frontend stack, including TanStack Query as the owner of all fetched server state: caching, mutations, retries, staleness and invalidation. It also ruled out copying that data into Signals or into an RxJS store, and excluded NgRx unless a concrete need appeared. **Using TanStack Query was therefore mandated, not chosen.** This record does not pretend that Query won a comparison against other libraries, because no such comparison took place.

What was open was everything around it: how components reach the API, how cache entries are named, what a write does to the cache, and how strictly the "one owner" rule is kept once pages, forms and realtime updates all touch the same data.

## Decision

TanStack Query is the single owner of everything the API returns, and the application is arranged so that nothing else can become a second owner:

- **HTTP stays in the data-access layer.** Thin clients, one per API area, perform requests and return typed data or a parsed problem response. Components never use `HttpClient`.
- **Components use Query directly.** Query and mutation factories in the data-access layer hand pages ordinary Query options. Nothing wraps Query in a service that hides its caching, loading or error semantics.
- **Keys are hierarchical and built in one place.** One factory produces every key, from `opsboard` through area and list or detail to normalised filters, so a write or a notification can invalidate exactly the affected entries.
- **Writes are confirmed before the cache changes.** A successful mutation puts the record the server returned into the cache and invalidates the lists it may have changed. Nothing is written to the cache before the server answers.
- **Canonical data is never copied elsewhere.** It is not copied into Signals, not into an RxJS subject, and not into component fields. Values that only derive from it are computed each time from the query result.

## Alternatives

**An RxJS store or NgRx.** A store would hold server entities in application-defined state and update it from effects. The brief excluded both the store and NgRx, and this record keeps that exclusion. The cost it avoids is real: a store duplicates what Query already does (caching, deduplication, staleness, retries and invalidation), and it creates a second copy of the data that must be kept in step with the first.

**A Signals-based server cache.** Signals could hold fetched entities, with services refreshing them. The brief excluded this as well. It would split responsibility between Query, which fetches, and Signals, which hold the data, so every refetch, invalidation and realtime update would need a matching hand-written copy step.

**Repository services that hide Query.** This was considered while designing the data layer: a familiar Angular pattern in which services expose methods or observables and use Query internally. It was rejected because it hides Query's caching and error semantics from the pages that need them, and because a service that returns data invites callers to store that data.

**Optimistic cache updates before the server answers.** These were considered for mutations and rejected. They need rollback logic, and they would be wrong precisely when it matters: when the server refuses a write as a conflict. Invalidating everything and never writing to the cache was also considered. It was rejected as needlessly slow for detail pages, because the server's response already contains the new record.

**Flat or ad-hoc query keys.** These were rejected in favour of the hierarchical factory, because invalidating a family of related entries needs a shared prefix.

## Consequences

- There is one answer to "what does the server say about this record?": the query cache. Every component reading a record updates together when it changes.
- Mutations, realtime notifications and reconnects all act on the cache the same way, by writing a confirmed record or invalidating. None of them needs a parallel update path.
- Pages must use Query's own loading, error and success states. That is intended, and it keeps failure handling visible where the data is used.
- Nothing appears on screen that the server has not confirmed. The cost is a short wait after a save instead of an instant optimistic change.
- Form state has to be kept separate from the cache on purpose. A form holds the user's pending edit and the revision it was loaded from, not a copy of the record.
- Adding a new API area means adding a client, keys and factories in the data-access layer, not a store.
