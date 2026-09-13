# Phase 3 data-access contract alignment

Reference mapping of Angular data-access types/routes to closed Phase 2
contracts. Acceptance is automated tests; this file is review aid only.

Upstream:

- `src/OpsBoard.Api/Endpoints/DomainEndpoints.cs`
- Application DTOs under `src/OpsBoard.Application/`

## Routes ↔ client API

| Method | Path | Client |
| --- | --- | --- |
| GET | `/api/current-user` | `IdentityApi.getCurrentUser` → `CurrentUserDto` |
| GET | `/api/organization` | `IdentityApi.getOrganization` → `OrganizationDto` |
| GET | `/api/lookups/teams` | `LookupsApi.listTeams` → `Bounded<TeamDto>` |
| GET | `/api/lookups/users` | `LookupsApi.listUsers` → `Bounded<LookupUserDto>` |
| GET | `/api/services` | `ServicesApi.list` → `Page<ServiceDto>` |
| GET | `/api/services/{id}` | `ServicesApi.getById` → `ServiceDto` |
| POST | `/api/services` | `ServicesApi.create` → `ServiceDto` |
| PUT | `/api/services/{id}` | `ServicesApi.update` → `ServiceDto` |
| GET | `/api/incidents` | `IncidentsApi.list` → `Page<IncidentSummaryDto>` |
| GET | `/api/incidents/{id}` | `IncidentsApi.getById` → `IncidentDetailDto` |
| POST | `/api/incidents` | `IncidentsApi.create` → `IncidentDetailDto` |
| PUT | `/api/incidents/{id}` | `IncidentsApi.update` → `IncidentDetailDto` |
| PATCH | `/api/incidents/{id}/severity` | `IncidentsApi.changeSeverity` |
| PATCH | `/api/incidents/{id}/status` | `IncidentsApi.changeStatus` |
| POST | `/api/incidents/{id}/resolve` | `IncidentsApi.resolve` |
| POST | `/api/incidents/{id}/reopen` | `IncidentsApi.reopen` |
| GET | `/api/incidents/{id}/responders` | `IncidentsApi.listResponders` |
| POST | `/api/incidents/{id}/responders/join` | `IncidentsApi.join` → `ResponseMutationDto` |
| POST | `/api/incidents/{id}/responders/leave` | `IncidentsApi.leave` → `ResponseMutationDto` |
| POST | `/api/incidents/{id}/updates` | `IncidentsApi.addUpdate` → `ResponseMutationDto` |
| GET | `/api/incidents/{id}/timeline` | `IncidentsApi.listTimeline` → `Page<TimelineEntryDto>` |

Out of Phase 3 client boundary: `/api/health`, dashboard, postmortem, SignalR.

## Application DTO source files

| Client module | Application source |
| --- | --- |
| `contracts/common.ts` | `Common/Contracts.cs` (`PageResult`, `Bounded`, queries, revision wire format) |
| `contracts/enums.ts` | `Domain/Enums/*` (JsonStringEnumConverter member names) |
| `contracts/identity.ts` / `lookups.ts` | `Lookups/LookupDtos.cs` |
| `contracts/services.ts` | `Services/ServiceDtos.cs` |
| `contracts/incidents.ts` | `Incidents/IncidentDtos.cs` |

## Notes

- Revision fields remain decimal strings (`RevisionString`); never `Number(...)`.
- Demo identity: client sends no Authorization / org / user / role headers.
- Browser calls relative `/api/...` via `API_BASE_URL = ''` and `proxy.conf.json`
  → `https://localhost:7243` (`secure: false`; http `5233` fallback documented on
  the token).
