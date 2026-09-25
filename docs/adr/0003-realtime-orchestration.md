# ADR 0003: Realtime orchestration

Status: accepted

Scope: how a change made by one user reaches other open browsers, and what that path does and does not guarantee. It builds on [ADR 0001: server state ownership](0001-server-state-ownership.md) and [ADR 0002: client state ownership](0002-client-state-ownership.md). The end-to-end flow is drawn in the [architecture document](../architecture.md#realtime-flow).

## Context

The project brief specified the path: a persisted API change is published over SignalR, received by an Angular realtime service, orchestrated with RxJS, and applied to the TanStack Query cache. It also required reconnects to be handled and failures logged. **SignalR, RxJS and Query were mandated, and so was the overall direction of the flow.** Polling, for example, was never evaluated as a replacement transport.

The decisions left open were: what a message carries; where and when the server sends it; what the client does with it; and how the system behaves when messages are duplicated, delayed or missed. ADR 0001 already makes the query cache the only owner of server data, so the realtime path has to work through that cache rather than beside it.

## Decision

- **Messages are thin facts, not data.** A fact names its kind (for example `IncidentStatusChanged` or `ResponderJoined`), the organization, the incident, its new revisions and when the change happened. It never carries the record itself. One hub method carries every fact, and the `kind` field tells the client what changed.
- **The server publishes after commit, from the application service.** Each use case publishes its fact once its transaction has committed, through a small publisher interface that the API implements with SignalR. A change that fails publishes nothing. A failure to publish is logged and never turns a committed change into an error.
- **Facts go only to the caller's organization.** Each connection joins its organization's group, and every fact is sent to that group.
- **The client invalidates; it does not apply.** One connection per application, started at bootstrap, validates each incoming fact and drops malformed ones. It publishes valid facts on an RxJS stream. A single bridge maps each kind to query invalidations: incident lists always, plus that incident's detail, timeline or responders as the kind requires. TanStack Query then refetches whatever is on screen over the ordinary REST endpoints.
- **Echoes are harmless.** The browser that made a change also receives its fact and simply invalidates again. There is no mechanism for suppressing a client's own facts.
- **Reconnection assumes something was missed.** When the connection returns, the client invalidates every incident query rather than trying to work out which facts it lost.

## Alternatives

**Writing hub payloads straight into the cache.** Facts could carry full records and be written into the cache with no refetch, or the client could insert, remove and reorder rows in cached lists itself. This was rejected. List pages are filtered, sorted and paged on the server, so local surgery would drift from what the server would return. Full payloads would also make the hub a second source of record shapes. Invalidation costs a refetch, but the screen only ever shows what the API served.

**One broad "incident changed" message, or one hub method per action.** A single opaque message could not target invalidations and would tempt payloads to grow. A method per action would multiply the wire contract. Category facts with a `kind` sit between the two and were adopted.

**Publishing from the endpoints, or from a persistence interceptor or domain-event bus.** Publishing from each endpoint would be easy to miss on a new path and would duplicate code. An interceptor or event bus would publish automatically, but it adds a general mechanism that is harder to reason about than one explicit call after each commit. The application-service publisher was adopted.

**An event store, a durable outbox, or replay by sequence number.** Any of these would allow guaranteed or replayable delivery. They were rejected as out of proportion to the need: because every fact only triggers a refetch, invalidating on reconnect already recovers correct state without replaying individual events.

**Suppressing a client's own echoes.** Correlation identifiers or "my last mutation" heuristics could skip the redundant refetch. They were rejected as added complexity and fragility, with no correctness benefit.

## Consequences

What the path guarantees:

- The screen always shows server-confirmed data. A fact cannot put a value on screen the API did not return.
- Duplicate facts cause a duplicate refetch, nothing worse. A late fact that arrives after newer data causes a refetch of the newer data.
- A connected client learns about committed incident changes in its organization shortly after they happen, without reloading the page.

What it does not guarantee, stated plainly:

- **Delivery is best effort.** A fact is sent at most once and can be lost: if sending fails after commit, it is logged and not retried. There is no exactly-once or at-least-once delivery, no durable queue and no replay.
- **Missed facts are recovered, not replayed.** While a client is disconnected, it misses whatever happens. On reconnection it catches up by refetching every incident query. It does not learn which individual changes it missed.
- **Reconnection gives up eventually.** After SignalR's automatic reconnect and a further bounded series of attempts, the client stops trying and the shell shows it is disconnected. The application keeps working over HTTP, but other users' changes arrive only through the user's own requests until the page is reloaded.
- **There is no ordering guarantee between facts.** None is needed, because each fact only invalidates and the refetch returns current state.
- **Only incidents are realtime.** Services have no facts, and a service page is only as fresh as its last fetch.
- **Unsaved edits are not overwritten by a refresh.** Protecting a form's unsaved values, and keeping the revision its save is checked against, is the job of the forms, as described in ADR 0002. A fact alone does not change a form.
