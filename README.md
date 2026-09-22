# OpsBoard

Real-time incident and service operations management platform. Portfolio application demonstrating senior Angular frontend engineering, ASP.NET Core API design, EF Core/PostgreSQL persistence, SignalR, testing, accessibility, and Docker-based local development.

> Status: **Phases 1–7 complete** (scaffold, domain/persistence + APIs, Angular data-access, core incidents/services UI, SignalR realtime with Query cache sync, the command palette with keyboard/focus accessibility work, and a four-tier test suite covering unit, integration, browser journeys and automated accessibility). Next: Phase 8 CI and documentation.

## Screenshots

_Placeholder — add dashboard / incident detail captures._

## Live demo

_Placeholder — deploy URL TBD._

## Technology stack

| Layer | Choice |
| --- | --- |
| Frontend | Angular 22, TypeScript (strict), Signals, TanStack Query, RxJS, SCSS |
| Backend | ASP.NET Core 10, EF Core, FluentValidation, SignalR, OpenAPI |
| Data | PostgreSQL 17 |
| Tooling | Docker Compose, mise (Node + .NET SDK pins), xUnit, Vitest |

## Repository structure

```text
OpsBoard/
├── apps/web/                 # Angular SPA (feature-oriented)
│   └── src/app/
│       ├── core/             # API, auth, config, errors (realtime TBD)
│       ├── data-access/      # HTTP clients, Query keys/options, mappers
│       ├── features/         # incidents, services (+ stubs for later features)
│       ├── layout/           # shell, nav, demo banner
│       └── shared/           # accessible UI primitives, URL sync, permissions
├── src/
│   ├── OpsBoard.Api/         # HTTP host, domain endpoints
│   ├── OpsBoard.Application/ # DTOs, use cases, validation
│   ├── OpsBoard.Domain/      # Entities + enums + lifecycle rules
│   └── OpsBoard.Infrastructure/ # EF Core, migrations, demo seed
├── tests/
│   ├── OpsBoard.UnitTests/
│   └── OpsBoard.IntegrationTests/
├── docs/                     # Architecture + ADRs (Phase 8)
├── docker-compose.yml        # PostgreSQL for local dev
├── mise.toml                 # Node 24.21 + .NET 10.0.401
└── OpsBoard.sln
```

## Architecture overview

- **Signals**: local UI / client state
- **TanStack Query**: all server state (fetch, cache, mutations, invalidation)
- **RxJS**: async streams; SignalR orchestration arrives in Phase 5
- **PostgreSQL**: system of record

Full diagrams land in `docs/architecture.md` during Phase 8.

## What works today

- **Demo identity + Acme seed**: organization, teams, users, services, historical and active incidents
- **Services API + UI**: paged/filtered list, detail, create/update with concurrency recovery
- **Incidents API + UI**: paged/filtered list (URL-backed filters), create, detail, edit, severity/status/resolve/reopen, join/leave, written updates, timeline
- **Shared UI**: severity/status/health badges (text cues), pagination, callouts, confirm dialog with focus management
- **Shell**: demo environment banner, Incidents/Services navigation, identity chrome

Not yet: dashboard summary UI, teams/users/postmortems screens, SignalR realtime, command palette, CI, and public architecture docs.

## Local setup

### Prerequisites

- [mise](https://mise.jdx.dev/) (or install Node 24.21+ and .NET 10 SDK manually)
- Docker / Docker Compose
- Git

```bash
cd ~/Workspace/OpsBoard
mise trust && mise install
cp .env.example .env
docker compose up -d postgres
```

### Database

Migrations are not applied on API startup. Apply them, then seed once:

```bash
dotnet ef database update \
  --project src/OpsBoard.Infrastructure \
  --startup-project src/OpsBoard.Api

ASPNETCORE_ENVIRONMENT=Development \
  dotnet run --project src/OpsBoard.Api --no-launch-profile -- --seed-demo
```

Re-running `--seed-demo` is a no-op when the Acme marker is present.

### Backend

```bash
dotnet restore OpsBoard.sln
dotnet build OpsBoard.sln
dotnet run --project src/OpsBoard.Api --launch-profile http
# Health: GET http://localhost:5233/api/health
```

### Frontend

Requires **Node ≥ 24.15** (pinned in `mise.toml`) and **npm ≥ 11**. Dev proxy targets the local API.

```bash
cd apps/web
npm install   # approve install scripts if npm prompts (esbuild, etc.)
npm start
# http://localhost:4200
```

If `ng` reports an unsupported Node version while mise is installed, ensure mise’s Node is first on `PATH` (`hash -r` after `mise activate`, or open a fresh shell in the repo root). Cursor Agent’s bundled Node can otherwise shadow the project SDK.

## Testing commands

```bash
# Backend unit + integration
dotnet test OpsBoard.sln

# Frontend unit tests (Vitest via Angular)
cd apps/web && npm test

# Browser journeys + accessibility checks (Playwright, Chromium)
cd apps/web && npm run test:e2e

# Coverage, reported rather than gated
dotnet test OpsBoard.sln --collect:"XPlat Code Coverage"
cd apps/web && npm test -- --coverage
```

**Backend.** The integration tests create a uniquely named database per run, apply migrations, and drop it afterwards. They use `OpsBoardTests__AdminConnection` or `ConnectionStrings__OpsBoard` when either is set, and otherwise start `postgres:17-alpine` themselves for the run, so a clean checkout needs no manual step. With neither a connection nor a container runtime available they fail immediately and name both remedies.

**Frontend.** Component and service specs run in jsdom and collect only from `apps/web/src`.

**Browser.** The tier lives in `apps/web/e2e` and needs a one-off `npx playwright install chromium`. Its setup brings up the database container, applies migrations and runs the demo seed, then starts the API and the dev server, reusing either if it is already running. The journeys create the records they change, so they can be run repeatedly. Any accepted accessibility violation is listed with its reason in `apps/web/e2e/a11y-accepted.json`, which is currently empty.

## Docker commands

```bash
docker compose up -d postgres
docker compose ps
docker compose down
```

Compose currently provides PostgreSQL only. API and frontend run locally as above; container images arrive in later phases.

## Notable engineering decisions

1. **Pragmatic layered backend** (`Api` / `Application` / `Domain` / `Infrastructure`) without MediatR/CQRS ceremony.
2. **Classic `.sln`** instead of .NET 10’s default `.slnx` for broader tooling compatibility.
3. **TanStack Query owns server state**; Signals stay on client/UI state — no mirroring Query data into Signals stores.
4. **Optimistic concurrency** via incident `Version` / `LifecycleVersion` with conflict recovery in the UI.
5. **URL-backed list filters** for incidents and services (shareable, refresh-safe).
6. **Deterministic Acme demo seed** behind a Development-only `--seed-demo` command (not a public reset endpoint).
7. **Tool versions pinned in `mise.toml`** so recruiter/local clones use the same Node/.NET pair.

## Roadmap

| Phase | Focus | Status |
| --- | --- | --- |
| 1 | Architecture / scaffold | Done |
| 2 | Domain, EF Core, migrations, seed, service/incident APIs | Done |
| 3 | Angular API client, Query factories, mutations | Done |
| 4 | Shell, incidents/services lists & details, forms, baseline a11y | Done |
| 5 | SignalR realtime + Query cache synchronization | Done |
| 6 | Command palette, deeper keyboard/a11y polish | Done |
| 7 | Frontend/backend/integration/E2E/a11y test hardening | Done |
| 8 | GitHub Actions, Docker API support, architecture docs / ADRs | Next |

## License

Private portfolio project — all rights reserved unless otherwise stated.
