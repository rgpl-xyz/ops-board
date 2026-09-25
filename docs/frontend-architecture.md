# Frontend architecture

Scope: how the Angular application in `apps/web` is organised, which mechanism owns which kind of state, how server changes reach the screen, and how the incident and service forms behave when a save is rejected or conflicts with someone else's change. Setup and commands live in the [README](../README.md). The system-wide picture is in the [architecture document](architecture.md).

## Application structure

The application is built entirely from standalone components. There are no NgModules, dependencies come from `inject()` rather than constructor parameters, and inputs, outputs and view queries use the signal APIs. Every component below the root uses `OnPush` change detection.

The code is split by responsibility:

- **Data access** is the only code that talks to the API. It holds the typed contracts, the HTTP clients, the problem-response parser, the query key factory, and the query and mutation factories. Those factories decide what each write invalidates. Components never touch `HttpClient`.
- **Features** hold the routed pages: the incident list, detail and create pages, and the service list and detail pages. A page composes queries and mutations from data access and owns only its own screen state.
- **Layout** holds the shell, which carries navigation, the demo banner, the realtime connection status and the command palette.
- **Shared** holds accessible building blocks used across features: severity, status and health badges that always carry a text label, pagination, callouts, a confirmation dialog, focus helpers and the mapping between list queries and the URL.
- **Core** holds the few application-wide services: the realtime connection and its bridge into the query cache, and focus handling on navigation.

Each feature is lazy-loaded behind its own route file. The shell is the only eager route, and it loads the incident or service pages on first navigation.

## State ownership

Each kind of state has one owner, and the owners do not overlap.

| State | Owner | Examples |
| --- | --- | --- |
| Anything the API returns | TanStack Query | incident lists and details, timelines, responders, services, the current user, palette search results |
| What the user is doing on this screen | Signals | whether the palette is open and what is typed in it, the highlighted result, the timeline page, whether a conflict notice is showing, severity and status drafts |
| Where the user is | The URL | list filters, sort, search and page |
| Things that arrive over time | RxJS | realtime facts, debounced search input, navigation events |
| Notice that the server changed | SignalR | a committed-change fact for one incident |

**Server data is never copied into Signals.** A page reads the query's own result and derives what it shows with `computed()`. Query options are themselves computed from route parameters and signals, so changing a filter or a page changes the query key and TanStack Query does the fetching, caching and deduplication. A signal that starts from a server value, such as the severity a user is about to apply, holds the user's pending choice, not a second copy of the incident.

The boundary exists so there is exactly one answer to "what does the server say about this incident?": the query cache. Anything that changes server state, whether a mutation, a realtime fact or a reconnect, acts on that cache, and every component reading it updates together. No component holds a copy that can drift out of date.

**Query keys are hierarchical.** One factory builds every key (`opsboard` → `incidents` → `list` → filters, for example), and filter objects are normalised so that equal filters always produce equal keys. That lets a write or a realtime fact invalidate exactly what it affects, such as every incident list, one incident's detail, or one incident's timeline, without clearing unrelated data.

**Writes wait for the server.** Mutations do not update the cache optimistically. When a write succeeds, the record the server returned goes into the cache and the affected lists are invalidated. When it fails, the cache is left alone, or refreshed if the failure shows it is out of date. Queries stay fresh for 30 seconds and are not retried on a client error. Mutations are never retried automatically.

## URL-backed list state

List pages keep their filters, sort, search and page in query parameters. The page parses its query from the URL and writes changes back through the router, so a filtered view can be bookmarked, shared or restored with the back button. Changing a filter, the sort or the page size returns the list to its first page. Search input is debounced with RxJS before it reaches the URL, so typing does not trigger a request per keystroke.

## Realtime data flow

A realtime message is a notification that something was committed. It is not a copy of the new data. The frontend side works like this:

1. One SignalR connection is opened when the application starts and shared by every page.
2. Each incoming fact is checked against the expected shape. Malformed facts are dropped with a warning.
3. Valid facts are published on an RxJS stream.
4. A bridge maps each fact to targeted query invalidations: incident lists always, plus that incident's detail, timeline or responders as the kind of fact requires.
5. TanStack Query refetches whichever of those queries are currently in use, over the ordinary REST endpoints, and components render what the server returned.

Delivery is best effort. There is no replay of facts missed while disconnected. After a reconnection, the client invalidates every incident query, which catches up on anything missed regardless of which facts it was. Because a fact only ever causes a refetch, a duplicated or late fact cannot put data on screen that the API did not serve. The end-to-end flow, including the server side, is in the [architecture document](architecture.md#realtime-flow).

## Forms and server state

The incident edit form holds the user's unsaved values, and the query cache holds the canonical incident. They are kept apart on purpose.

When the form is filled from the server, it records the **revision it was based on**. From then on:

- A passive refresh, whether from a realtime fact or a refetch, updates the canonical incident in the cache. If the form is untouched, it adopts the new values and the new revision. If the user has started typing, the form keeps their values **and keeps its original revision**.
- Saving sends the revision the form was based on, not whatever revision is newest in the cache.
- If another person changed the incident in the meantime, the server rejects the save with a conflict. An edit can never silently overwrite a change the user had not seen.
- After a successful save, the form is rebound to the incident the server returned, and its revision moves forward with it.

## When a save is rejected

Errors arrive as the API's problem responses. The client recognises them by shape (`status`, `code`, `title`, `detail`) rather than by header. Server validation is authoritative, and client-side validators exist to give earlier feedback.

In the incident create, incident edit and service edit forms, a `validation_failed` response with field errors shows each message next to its field, leaves the entered values in place and moves focus to the first affected field. A validation failure that names no field, and any other unexpected error, appears as a summary above the form, which then receives focus. None of these paths clears what the user typed.

## When a save conflicts

Concurrent edits are detected by optimistic concurrency: each incident and service edit carries the revision it was based on, and the server answers `concurrency_conflict` when that revision is no longer current.

On a conflict, the incident and service detail pages:

- fetch the current record and load it into the form;
- show a single alert saying the record changed since it was loaded;
- move focus to the alert's *Dismiss and continue editing* action;
- block further saves until the alert is dismissed.

The user sees the other person's change before deciding what to re-apply. Nothing is merged automatically, and neither side's change is overwritten without notice. Lifecycle actions on an incident, such as changing severity or status, resolving and reopening, handle a conflict the same way.

## Command palette

The command palette (Ctrl+K or Cmd+K) shows the boundary at small scale. Whether it is open, the typed text and the highlighted result are local signals, and the element that opened it is remembered locally so focus can return there. The typed text is debounced through RxJS, and the settled term becomes part of ordinary incident and service queries. Their results stay in TanStack Query, and the palette computes its result list from them on each change instead of storing entities of its own. Closing the palette returns focus to whatever opened it. Choosing a result navigates instead, and navigation focus takes over.

## Focus

Focus handling is part of the architecture because several mechanisms move content without a page load:

- **Navigation.** A root service watches completed navigations. When the path changes, it moves focus to the destination's designated target: the page heading, or on a detail page a labelled region for whichever state is showing (loaded, loading or failed). If that target renders after the navigation, the service retries briefly. A change that stays on the same path, such as a filter or page change, leaves focus where it is.
- **Dialogs.** The command palette and the confirmation dialog are native `<dialog>` elements opened modally, so the browser contains focus. Each restores focus to a defined element when it closes.
- **Forms.** As described above, rejected saves move focus to the first affected field or the summary, and conflicts move it to the recovery action.
- **Realtime.** Passive updates are quiet: they do not move focus and are not announced. Only a change in the connection itself is announced, through the shell's status region.
