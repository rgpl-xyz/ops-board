# API design

Scope: the shape and conventions of OpsBoard's HTTP API: its resources, how lists are paged, filtered and sorted, how errors are reported, and how concurrent changes are detected. Setup and commands live in the [README](../README.md). How the API fits into the running system, and how changes reach other browsers, is in the [architecture document](architecture.md).

## Resources

Every application endpoint lives under `/api` and exchanges JSON. The web application is served from the same origin as the API, through a proxy in development and in the container stack, and calls it with origin-relative paths.

| Surface | Endpoints | Purpose |
| --- | --- | --- |
| Identity | `GET /api/current-user`, `GET /api/organization` | Who the caller is, their role, and their organization |
| Lookups | `GET /api/lookups/teams`, `GET /api/lookups/users` | Small reference lists for pickers and filters |
| Services | `GET`, `POST /api/services`; `GET`, `PUT /api/services/{id}` | List, create, read and update services |
| Incidents | `GET`, `POST /api/incidents`; `GET`, `PUT /api/incidents/{id}` | List, raise, read and edit incidents |
| Incident lifecycle | `PATCH /api/incidents/{id}/severity`, `PATCH /api/incidents/{id}/status`, `POST /api/incidents/{id}/resolve`, `POST /api/incidents/{id}/reopen` | Change severity and active status; resolve and reopen |
| Responders | `GET /api/incidents/{id}/responders`, `POST …/responders/join`, `POST …/responders/leave` | Who is working an incident; the caller joining or leaving |
| Timeline | `GET /api/incidents/{id}/timeline`, `POST /api/incidents/{id}/updates` | The incident's history; posting a written update |

`GET /api/health` sits outside this model. It reports that the process is up, with no identity and no database access, so it is suitable for a liveness probe. It says nothing about whether application requests will succeed.

Lifecycle changes are explicit commands rather than generic edits. `PUT` on an incident changes only its title, description and service. Severity and status have their own endpoints, and resolving and reopening are separate actions, because each has its own rules and its own timeline entry. A status change accepts only the active states (`Investigating`, `Identified`, `Monitoring`). Moving to `Resolved`, or back out of it, goes through resolve and reopen. Joining and leaving always act on the caller, never on another user.

## Conventions

- **Status codes.** Reads and updates answer `200`. Creating a service, an incident or a written update answers `201` with a `Location` header: the new resource, or for a written update the incident's timeline. Every failure answers with a problem response, described below.
- **Enumerations** are exchanged by name (`Critical`, `Degraded`, `Resolved`), in responses, request bodies and query parameters. Numeric values are rejected everywhere. Query parameters must use the exact name; request bodies match names without regard to case.
- **Identifiers** are GUIDs. A path segment that is not a GUID does not match a route.
- **Revisions** (`version`, `lifecycleVersion`) travel as positive decimal strings, so that clients never round them.
- **Text limits** are counted in user-perceived characters rather than bytes or UTF-16 units. For example, an incident title allows 200 and a written update 4,000. Required text must contain more than whitespace.

## Identity and organization

The caller never states who they are or which organization they belong to. The server resolves the current user on every request and derives the organization from that user, and every read and write is scoped to it. A record in another organization is indistinguishable from one that does not exist: both answer `404 unavailable`. A list filter naming another organization's service or team is treated the same way.

Permissions are checked on the server for each operation, from the caller's role:

| Role | Can |
| --- | --- |
| Viewer | read everything in the organization |
| Responder | also join and leave incidents and post written updates |
| IncidentManager, Administrator | also create and edit incidents and services, and change severity, status, resolution |

Today the identity is a seeded demonstration user named by configuration. There is no sign-in and no token. If that user cannot be resolved, requests answer `401 identity_unavailable` instead of being served. The identity is resolved behind a single interface, so a real identity provider can replace it without changing any endpoint or permission rule.

## Paging

Two paging styles are used, chosen by what the list is for.

**Numbered pages** serve the lists a person browses: services, incidents and an incident's timeline. The request takes `page` (from 1, default 1) and `pageSize` (1 to 100, default 25). The response carries:

| Field | Meaning |
| --- | --- |
| `items` | the rows on this page |
| `page`, `pageSize` | the page actually served |
| `totalCount` | rows matching the filters across all pages |
| `totalPages` | `totalCount` divided by `pageSize`, rounded up; `0` when nothing matches |

**Continuation** serves the lists a client usually reads whole: teams, users and an incident's responders. The request takes `limit` (1 to 100, default 100) and optionally `after`, the identifier from the previous response. The response carries `items` and `nextAfter`, which is `null` when there is nothing more. These lists are ordered by identifier, so continuing from `nextAfter` neither skips nor repeats a row.

Out-of-range paging values are validation failures, not silently clamped.

## Filtering, search and sorting

Filtering, searching and sorting happen in the database, before paging. Pages are therefore consistent with `totalCount`, and no full table is ever loaded to serve a page.

| List | Filters | Search | Sort | Default |
| --- | --- | --- | --- | --- |
| Incidents | `serviceId`, `teamId`, `severity`, `status` | title and description | `createdAt`, `severity`, `status` | `createdAt`, `desc` |
| Services | `teamId`, `health` | name and description | `name` | `name`, `asc` |

- `direction` is `asc` or `desc`.
- `search` is trimmed, matched case-insensitively as a substring, and limited to 200 characters. A blank search is ignored.
- Filters combine with *and*.
- Sorting by severity or status follows the domain's order, not the alphabet. For severity, `desc` puts `Critical` first. For status, `desc` runs from `Investigating` to `Resolved`.
- Every sort ends with the record identifier as a tie-breaker, so rows with equal keys keep a stable order across pages.
- The timeline is always in the order things happened.

An unsupported sort field or direction, an unknown enum value, or a value that cannot be read, such as `page=notanumber`, is rejected with `400 validation_failed`, in every environment.

## Errors

Every error the application produces is a problem response in the RFC 9457 style, served as `application/problem+json`:

```json
{
  "type": "urn:opsboard:problem:validation_failed",
  "title": "Validation failed",
  "status": 400,
  "detail": "One or more validation errors occurred.",
  "instance": "/api/incidents",
  "code": "validation_failed",
  "traceId": "00-…",
  "errors": { "title": ["Title is required."] }
}
```

`type`, `title`, `status`, `detail`, `instance`, `code` and `traceId` are always present. `code` is the stable, machine-readable identifier a client should branch on, and `type` is the same code as a URN. `errors` appears only on validation failures, mapping each field to its messages. `traceId` correlates the response with the server's logs.

| Status | `code` | Meaning |
| --- | --- | --- |
| 400 | `validation_failed` | The request is malformed or breaks a rule: an unreadable value, an unreadable body, an unsupported sort, an out-of-range page, a missing or overlong field |
| 401 | `identity_unavailable` | The server could not establish who the caller is |
| 403 | `forbidden` | The caller's role does not allow this operation |
| 404 | `unavailable` | The record does not exist, or is not in the caller's organization |
| 409 | `lifecycle_conflict` | The operation does not fit the incident's current state, such as changing the status of a resolved incident or reopening one that is active |
| 409 | `responder_conflict` | Joining an incident the caller already works, or leaving one they do not |
| 409 | `concurrency_conflict` | The record changed after the caller read it; see below |
| 500 | `persistence_failure` | An unexpected server-side failure. Details stay in the logs and are never returned |

The four kinds of failure call for different client responses:

- **Malformed or invalid input** (`400`): the request itself must change.
- **Identity and authorization** (`401`, `403`): retrying will not help.
- **State conflicts** (`409`): `lifecycle_conflict` and `responder_conflict` mean the action no longer fits the record. `concurrency_conflict` means the caller's copy is stale.
- **Server failure** (`500`): the request may be fine, and trying again later can succeed.

A request that matches no endpoint at all, such as an unknown path, a path whose identifier is not a GUID, or an unsupported method, receives the framework's standard problem response for `404` or `405`. It is still `application/problem+json`, but it carries no `code`, because no application operation ran.

## Optimistic concurrency

Concurrent changes are detected with optimistic concurrency. Every service and incident carries a revision that the server advances on each change, and every write names the revision it was based on:

1. A client reads a record and keeps its revision.
2. The write sends that revision back as `expectedVersion` (or `expectedLifecycleVersion`, below).
3. The server compares it with the stored revision inside the same transaction as the write.
4. If they differ, nothing is written and the server answers `409 concurrency_conflict`.
5. The client fetches the current record, and a person decides what to re-apply.

This is neither last-write-wins nor locking. Nothing is locked while a person reads or edits, and the server never merges two changes: a stale write is simply refused. Each successful write returns the record with its new revision, ready for the next write.

Incidents carry two revisions, because not every operation needs to conflict with every other:

| Revision | Advances when | Sent by |
| --- | --- | --- |
| `version` | anything about the incident itself changes: details, severity, status, resolution, reopening | editing details, changing severity or status, resolving, reopening |
| `lifecycleVersion` | the incident is resolved or reopened | joining, leaving, posting a written update |

So a written update, a join or a leave is not refused just because someone edited the incident's details, severity or status after the caller last read it. It is refused if the incident was resolved or reopened in that time. Responder and update operations return both revisions, so a client can continue from the current state.

The API owns detection and the conflict response. What a client does next is its own concern; the web application's recovery behaviour is described in [the frontend architecture](frontend-architecture.md#when-a-save-conflicts).

## Persistence and notification

PostgreSQL is the system of record. A write, its revision check and its timeline entry commit together, and only after the commit does the API send a realtime notification to other clients in the organization. A notification always describes something that is already stored, and a failure to send one never fails the request that caused it. The full flow is in the [architecture document](architecture.md#realtime-flow).
