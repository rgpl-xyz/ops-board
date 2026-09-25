# Testing strategy

Scope: why OpsBoard has four automated test tiers, what each one is responsible for, where their boundaries lie, and what "coverage" means in this repository. How to run each tier is in the [README](../README.md#testing-commands).

## Four tiers, four kinds of question

| Tier | Lives in | Answers |
| --- | --- | --- |
| Backend unit | `tests/OpsBoard.UnitTests` | Is this rule right? |
| Backend integration | `tests/OpsBoard.IntegrationTests` | Does the backend keep its contract against a real database and real HTTP request handling? |
| Frontend unit and component | `apps/web/src/**/*.spec.ts` | Does this piece of UI hold its state and interaction rules? |
| Browser journeys | `apps/web/e2e` | Can a person actually do the important things, in a browser, against the running application? |

Each tier exists because it can prove something the others cannot, or can prove it far more cheaply and precisely. None is a substitute for another.

## Backend unit tests

This tier owns rules that can be judged without infrastructure: the incident lifecycle and which transitions it allows, request validation, the role permissions, which timeline entry each operation produces, and when a realtime notification is and is not published. Application services run against an in-memory harness, so a test can state a single decision, such as "resolving appends a resolved entry and no status change" or "an unchanged severity publishes nothing", and fail with a precise message when that decision changes.

What it cannot prove: that a query runs correctly on PostgreSQL, that a transaction is atomic, that two requests racing each other behave, or that an endpoint is wired and serialises as documented. Those belong to the next tier.

## Backend integration tests

This tier runs the real API host in memory against a **real PostgreSQL database**. Nothing about persistence is mocked.

The fixture provisions its own database. It uses a server when one is supplied through configuration, and otherwise starts a PostgreSQL container for the run. Either way it creates a uniquely named database, applies the migrations, and drops the database afterwards. A clean checkout therefore needs no manual database step, and the hosted run uses exactly the same path rather than a database mode of its own. If neither a server nor a container runtime is available, the tier fails immediately and names both remedies instead of skipping.

It owns the behaviour that only exists once the pieces are joined:

- **HTTP contracts:** status codes, the problem-response shape and its media type, validation of unreadable input in both the development and production configurations, and query bounds, including edge cases such as literal wildcards in search and empty result envelopes.
- **Authorization and isolation:** every role against every class of operation, roles taken from the server rather than the request, and records in another organization indistinguishable from missing ones.
- **Persistence behaviour:** database-side sorting with stable tie-breaking across pages, mappings that round-trip, and a change and its timeline entry committing together, proven by injecting a failure before the commit.
- **Concurrency:** genuinely concurrent writes against the same revision, where one wins and one conflicts, duplicate joins racing, and lifecycle changes arriving between a read and a write.
- **Realtime publication:** a successful change publishes its fact to the right organization, a failed one publishes nothing, and a failure to publish never turns a committed change into an error.

## Frontend unit and component tests

This tier runs Angular components and services in a simulated DOM. HTTP clients are tested against Angular's HTTP testing backend, and pages run against stubbed clients. It owns the rules that make the interface trustworthy, and exercises them deterministically:

- **State ownership:** query keys and their hierarchy, what each mutation writes to or invalidates in the cache, how realtime facts are validated and mapped to invalidations, and how the connection recovers.
- **Request contracts:** the HTTP clients send the method, path, parameters and body the API expects, and problem responses are recognised by shape.
- **Form state:** a passive server refresh never replaces a form the user has started editing; an untouched form adopts fresh data; a save carries the revision its form was loaded from; and a successful save or an explicit conflict recovery rebinds the form deliberately.
- **Failure handling:** field errors are mapped from the server, typed values are kept, and focus moves to the first affected field or the summary.
- **Interaction and focus:** the command palette's local state, debounced search and focus return; route focus after navigation; the confirmation dialog's focus handling; and components that must stay silent or announce, such as quiet loading and explicit conflict alerts.
- **Semantic cues:** severity, status and health always render as text.

What it cannot prove: real layout, real browser focus and keyboard behaviour, a real server response, or the pieces working together.

## Browser journeys

This tier runs the Angular application in Chromium against the real API and a real, seeded PostgreSQL database. Its setup applies the migrations and the demo seed, and starts the API and the development server. The journeys create the records they change, so they can run repeatedly without resetting anything.

It is deliberately selective. It covers the flows that matter most and the behaviour only a real browser shows, rather than repeating every lower-level case:

- **Core flows:** the seeded list renders through the real stack; an incident is raised through the interface and appears in the list; a responder filters to an incident, records an update and resolves it.
- **Failure paths:** a rejected save explains itself and keeps what was typed; a conflicting save offers recovery. One journey makes a real concurrent change through the API while the user is editing, lets the realtime refresh reach the page, and requires the server to reject the stale save and the other change to survive, with nothing stubbed.
- **Focus in a real browser:** navigation focuses its destination while in-page changes do not; the confirmation dialog contains focus and cancels on Escape; keyboard focus is visible on the controls a keyboard user reaches.
- **Accessibility checks:** automated axe-core rule checks on the incident list, detail and create form, the service list and detail, and the command palette with and without results.

The journeys drive the development-style application: the dev server in front of the API. The production container stack is verified separately, as described below.

## The container stack check

`scripts/check-stack.sh` is not a fifth test tier. It is a readiness check for the composed application, run against a stack that is already up. In the automated run it follows building the images and starting the stack from an empty database. It proves that the web proxy reaches the API, that the application shell is served, and that the API answers as the seeded demo user.

The identity assertion is deliberate. A health endpoint proves only that a process is alive, and a stack whose configured identity pointed at a missing user would pass that while refusing every real request. The check requires the current-user endpoint to return the seeded user, so that failure mode cannot pass.

## Accessibility coverage

Accessibility is checked at two levels. Component tests assert what is deterministic in a simulated DOM: text cues, labels, live-region choices and focus movement. Browser journeys assert real focus behaviour and run automated rule checks on each main screen. Any accepted rule violation must be listed with its reason in a reviewed file, which is currently empty, so nothing can be silenced invisibly.

Automated checks find a useful class of problems. They do not establish conformance with any accessibility standard, and none is claimed.

## What coverage means here

Coverage here means that each important contract is guarded at the level where it can actually break:

- domain rules at the unit level;
- persistence, transactions and concurrency against real PostgreSQL;
- HTTP and error contracts through real request handling;
- frontend state ownership and form behaviour in components;
- the most important user journeys, recovery paths and focus behaviour in a browser;
- the composed stack's readiness through the stack check.

It does not mean that every branch is executed, and no such claim is made.

## Why there is no percentage gate

The repository does not fail a build on a code-coverage percentage. Coverage can be reported locally, and the README shows how, but it is not gated.

A percentage measures which lines and branches ran. The concern here is whether the right contracts are guarded at the right level, and the two can diverge. A suite could reach a high percentage while missing a query that behaves differently on PostgreSQL, a wrong media type, a focus transition that breaks in a real browser, an edit that silently overwrites someone else's change, or a container that cannot reach the API. Equally, tests written to move a number rather than to guard a behaviour are not a goal.

Coverage reports remain useful for finding code nothing exercises. They are one input to judgement, not the definition of done.

## The automated run

Every push and pull request runs all four tiers in order, followed by the container stack check. Each tier is a separately named step, so a failure identifies its tier from the step name alone. Each tier runs the same test projects, configuration and database provisioning a developer uses, with no tier given a separate path for automation.
