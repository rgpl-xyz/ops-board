# OpsBoard

Real-time incident and service operations management platform. Portfolio application demonstrating senior Angular frontend engineering, ASP.NET Core API design, EF Core/PostgreSQL persistence, SignalR, testing, accessibility, and Docker-based local development.

> Status: **Phase 1 scaffold complete** (solution + Angular app compile). Domain features start in Phase 2.

## Screenshots

_Placeholder — add dashboard / incident detail captures after Phase 4._

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
├── src/
│   ├── OpsBoard.Api/         # HTTP + SignalR host
│   ├── OpsBoard.Application/ # DTOs, use cases, validation
│   ├── OpsBoard.Domain/      # Entities + enums
│   └── OpsBoard.Infrastructure/ # EF Core, persistence
├── tests/
│   ├── OpsBoard.UnitTests/
│   └── OpsBoard.IntegrationTests/
├── docs/                     # Architecture + ADRs (Phase 8)
├── docker-compose.yml        # PostgreSQL for local dev
├── mise.toml                 # Node 24.21 + .NET 10.0.401
└── OpsBoard.sln
```

## Architecture overview (planned)

- **Signals**: local UI / client state
- **TanStack Query**: all server state (fetch, cache, mutations)
- **RxJS**: SignalR streams and other async event orchestration
- **PostgreSQL**: system of record

Full diagrams land in `docs/architecture.md` during Phase 8.

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

### Backend

```bash
dotnet restore OpsBoard.sln
dotnet build OpsBoard.sln
dotnet run --project src/OpsBoard.Api --launch-profile http
# Health: GET http://localhost:5233/api/health
```

### Frontend

Requires **Node ≥ 24.15** (pinned in `mise.toml`) and **npm ≥ 11**.

```bash
cd apps/web
npm install   # approve install scripts if npm prompts (esbuild, etc.)
npm start
# http://localhost:4200
```

If `ng` reports an unsupported Node version while mise is installed, ensure mise’s Node is first on `PATH` (`hash -r` after `mise activate`, or open a fresh shell in the repo root). Cursor Agent’s bundled Node can otherwise shadow the project SDK.

## Testing commands

```bash
# Backend
dotnet test OpsBoard.sln

# Frontend unit tests (Vitest via Angular)
cd apps/web && npm test
```

## Docker commands

```bash
docker compose up -d postgres
docker compose ps
docker compose down
```

API and frontend container images are intentionally deferred until later phases. Phase 1 keeps Compose focused on PostgreSQL.

## Notable engineering decisions (Phase 1)

1. **Pragmatic layered backend** (`Api` / `Application` / `Domain` / `Infrastructure`) without MediatR/CQRS ceremony.
2. **Classic `.sln`** instead of .NET 10’s default `.slnx` for broader tooling compatibility.
3. **TanStack Query wired at bootstrap** (`provideTanStackQuery`) so server-state ownership is established before feature work.
4. **Demo banner** present from day one; auth abstraction + seed identity arrive with domain work.
5. **Tool versions pinned in `mise.toml`** so recruiter/local clones use the same Node/.NET pair.

## Future roadmap

1. Phase 2 — domain, EF Core, migrations, seed data, basic APIs  
2. Phase 3 — Angular API client + query factories  
3. Phase 4 — shell, dashboard, incidents, services UI  
4. Phase 5 — SignalR realtime + cache sync  
5. Phase 6 — command palette, a11y polish  
6. Phase 7 — unit / integration / E2E tests  
7. Phase 8 — GitHub Actions + architecture docs / ADRs  

## License

Private portfolio project — all rights reserved unless otherwise stated.
