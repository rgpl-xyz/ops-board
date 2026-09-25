# ADR 0002: Client state ownership

Status: accepted

Scope: where state that belongs to the browser rather than the server lives, and the line between it and server data. It is the other half of [ADR 0001: server state ownership](0001-server-state-ownership.md).

## Context

The project brief assigned synchronous client and UI state, and values computed from it, to Angular Signals. It required typed reactive forms, and it required incident filters to be kept in the URL. Like TanStack Query in ADR 0001, **these tools were mandated, not chosen.**

That still leaves the questions that decide whether the boundary holds in practice. What exactly counts as client state? Where does a value that starts from server data, such as a severity the user is about to apply, belong? And how does an edit form relate to the cached record it was filled from?

## Decision

Client state is what the user is doing on the screen, and it has three owners:

| State | Owner | Examples |
| --- | --- | --- |
| Transient UI state and computed derivations | Signals | whether the command palette is open and what is typed in it, the highlighted result, whether a conflict notice is showing, the timeline page, the severity and status the user is about to apply, error messages for a section of the page |
| Values being edited | typed reactive forms | an incident's title, description and service; a service's name, description, team and health |
| Where the user is in a list | the URL | filters, sort, search and page |

The rule that makes this a boundary: **canonical server data is never copied into a Signal**, or into a form, beyond the moment the form is filled. Anything shown from server data is read from the query result or computed from it with `computed()`.

Three cases sit close to the line and are settled deliberately:

- **A draft seeded from server data is client state.** The severity draft starts at the incident's current severity, but it holds the user's pending choice, and it is re-seeded whenever the incident's revision changes.
- **An edit form owns its values until the user saves or recovers.** An untouched form adopts a newer version of the record when one arrives. A form the user has started editing does not.
- **An edit form keeps the revision it was loaded from.** That revision is stored with the form, as client state about the form, and it is sent with the save. It is not a second copy of the record: it records which version of the record the user's edit is based on.

## Alternatives

**Reading the revision from the cache at save time.** This was the original rule for the data layer: every write took its expected revision from query data, and no revision was stored anywhere else. It was revised because the cache and the form can legitimately diverge. When a refresh brings a newer version while the user is editing, the form correctly keeps the user's values. A save that then took the cache's revision would claim to be based on a version the user never saw, and the server's conflict check would pass when it should fail. Tying the revision to the form keeps the check honest.

**Rebinding an edit form on every server update.** This keeps the form and the cache identical, but it throws away what the user has typed whenever the record refreshes in the background. It was rejected in favour of rebinding only while the form is untouched, or when the user explicitly saves or recovers from a conflict.

**A Signals store for list pages or filters.** Keeping fetched pages, or the filters that produce them, in Signals would give a second, unlinkable description of what the user is looking at. The brief placed filters in the URL, and fetched pages belong to Query under ADR 0001, so this was excluded rather than evaluated.

**Handling a conflict silently, or merging it.** Two options were considered for what the screen should do when a save conflicts: refetch and carry on quietly, or offer a merge of both versions. Silent refetching was rejected because it hides a lost decision from the user. A merge editor was rejected as new product scope. The screen instead shows an explicit conflict notice, which is a Signal, and loads the current record into the form.

## Consequences

- There is never a question of which copy of a record is current. The query cache holds it, and client state only describes what the user is doing with it.
- Unsaved edits survive background refreshes, and a save still conflicts correctly if the record changed since the form was filled. This holds for both the incident and the service edit forms.
- Each edit form needs a little code of its own: it records its baseline revision, skips passive rebinds while dirty, and rebinds deliberately after a save or a conflict. That rule is simple, but it is enforced per form rather than by a framework, and component tests guard it.
- List views can be bookmarked, shared and restored with the back button, because their state is in the URL rather than in memory.
- Signals stay small and local to the component that owns them, and none of them needs to be kept in step with the server.
