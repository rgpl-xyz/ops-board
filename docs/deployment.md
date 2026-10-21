# Deployment

Scope: what changes when OpsBoard runs somewhere real instead of on the demonstration stack, and what would still need deciding. It prescribes no host, provider or orchestrator. How to run the demonstration stack is in the [README](../README.md#docker-commands), and how the parts fit together is in the [architecture document](architecture.md).

The container images are the unit of deployment: an API image that also contains the schema migration bundle, a web image that serves the frontend and proxies to the API, and a PostgreSQL database. Everything below is about how those are configured and operated, not about where they run.

## Environment

Run the API outside the `Development` environment. The API image defaults to `Production` when nothing is set, and that is the intended setting. Outside Development:

- the demo seed refuses to run;
- the OpenAPI document is not served;
- logging stays at the default information level instead of debug.

The demonstration stack sets `Development` on its one-shot seed step only, because the seed requires it. Nothing in a real deployment should.

## The demo seed has no place in a real deployment

The seed creates a fictional organization, its teams, users, services and incidents. It exists to make a demonstration look lived-in. Do not run it against a database that holds real data, and do not run it to prepare a new one. It is guarded to run only in Development and only when the demo is enabled, and a real deployment should satisfy neither condition.

## Schema changes are a release step

The API never changes the database schema on startup. The API image contains a migration bundle, running on the same .NET runtime as the API, that applies any pending migrations, and it reads the database connection from the same `ConnectionStrings__OpsBoard` setting as the API.

Run it deliberately, as its own step in a release, before starting the API version that needs the new schema. Treat it like any other change to production data: it should be run once, observed, and able to fail without leaving a half-started API behind. The demonstration stack runs it automatically on every start, which is convenient for a demo and is exactly what a real deployment should not do implicitly.

## Configuration and secrets

Every setting the API needs can be supplied as an environment variable, so values come from the hosting platform's configuration and secret store rather than a file:

| Setting | Purpose |
| --- | --- |
| `ConnectionStrings__OpsBoard` | the PostgreSQL connection, used by the API and by the migration bundle |
| `ASPNETCORE_ENVIRONMENT` | leave unset or `Production` |
| `Cors__Origins__0` (and further indexes) | only if the frontend is served from a different origin; see below |
| `Assistant__Enabled` | `true` turns on [AI assistance](ai-assistance.md); off when unset |
| `Assistant__Provider__Kind` | required when enabled: `OpenAiCompatible`, or `Fake` for a simulated brief with no model |
| `Assistant__Provider__BaseUrl`, `__Model`, `__Name` | the provider's OpenAI-compatible root (https), the model, and the name shown beside its text |
| `Assistant__Provider__ApiKey` | the provider key, a secret; required for any provider not on loopback |
| `Assistant__Provider__SupportsStrictSchema`, `__ReasoningEffort`, `__TimeoutSeconds` | provider capabilities and per-call timeout (default 20 s) |
| `Assistant__DailyRequestLimit`, `__MaxConcurrentRequests`, `__RequestTimeoutSeconds` | limits; defaults 50 a day, 2 at once, 30 s |
| `Assistant__VisitorRequestLimit`, `__VisitorWindowMinutes` | new briefs one visitor may start in a window; default 5 in 10 minutes |
| `Assistant__Questions__Enabled` | `true` also lets people type questions about an incident; off when unset |
| `Assistant__Questions__DailyLimit`, `__VisitorLimit` | questions a day, and per visitor in the same window; defaults 50 and 5 |
| `Assistant__Provider__InputUsdPerMillionTokens`, `__OutputUsdPerMillionTokens` | prices for the estimated-cost metric; default 0 |
| `ForwardedHeaders__KnownNetworks` | comma-separated networks of the proxies in front of the API, such as `172.16.0.0/12`; see [client addresses](#client-addresses) |
| `ForwardedHeaders__ForwardLimit` | how many proxies stand in front of the API; default 1 |

The `.env` file and the credentials in `.env.example` exist for local development and the demonstration stack. Real credentials never belong in either, and the images are built without any environment file inside them. If the database is reached over a network the platform does not already protect, configure encryption in the connection string. The demonstration stack's connection string also disables GSS encryption, which only avoids a harmless probe in the runtime image.

## TLS and HTTPS

Terminate TLS at the edge, in front of the web container, and enforce HTTPS there, including the redirect from plain HTTP.

The API itself should not be relied on for HTTPS. It contains a redirection middleware, but it does not read the forwarded scheme. Behind a TLS-terminating proxy it therefore sees every request as plain HTTP and cannot tell that the visitor used HTTPS. Leave the API without an HTTPS port configured, so that the redirection stays inert: it logs a warning and redirects nothing. Configuring an HTTPS port there would make it redirect every proxied request. The API does read the forwarded client address, as described below; trusting the forwarded scheme as well would be a separate decision.

## Client addresses

The API tells visitors apart by network address, to limit how many new AI briefs one visitor starts. An IPv6 visitor counts as their whole /64. Behind proxies, the address comes from `X-Forwarded-For`, which the API believes only from loopback and the networks in `ForwardedHeaders__KnownNetworks`, for at most `ForwardedHeaders__ForwardLimit` hops, so a visitor cannot choose their own address by sending the header.

Set the networks to those the proxies connect from, such as the container network, and the limit to the number of proxies: 1 for the demonstration stack, where the web container's nginx is the only one, and 2 when a server's own nginx sits in front of the web container. Each proxy must append to the header with `$proxy_add_x_forwarded_for`, as the web container does. If the settings do not match the proxies, every visitor appears as the nearest proxy and all share one allowance: the limit still holds, but for everyone together. Outside Development, the API logs a warning at startup when AI assistance is on and no proxy network is set. It cannot tell when the number of proxies is wrong, so check that by hand.

## Turning on AI assistance

AI assistance stays off until configured. A public deployment needs all of the following. The API refuses to start when the provider settings are incomplete, but mistakes in the last two only show in use:

1. `Assistant__Enabled=true`, `Assistant__Provider__Kind=OpenAiCompatible`, and the provider's `BaseUrl`, `Model` and `Name`.
2. `Assistant__Provider__ApiKey` from the platform's secret store, never from a file in the repository or an image.
3. `Assistant__DailyRequestLimit` sized to the provider's allowance, with room for your own use.
4. `Assistant__Provider__SupportsStrictSchema=true` where the provider enforces schemas, and for a reasoning model `Assistant__Provider__ReasoningEffort=low`, so its reasoning leaves room for the brief within the output limit. Otherwise more briefs are refused.
5. `ForwardedHeaders__KnownNetworks` and `ForwardedHeaders__ForwardLimit` for the proxies in front of the API, as described under [client addresses](#client-addresses). Otherwise all visitors share one per-visitor allowance.

Typed questions stay off until `Assistant__Questions__Enabled=true` as well. Each question can take two provider calls, so size `Assistant__Questions__DailyLimit` with the brief limit against the provider's allowance.

Afterwards, ask for one brief and check that its label names the expected model and provider.

## Origins and CORS

The web container serves the application and the API from one origin, so the browser makes no cross-origin requests and CORS plays no part. If the frontend is ever served from a different origin than the API, set `Cors:Origins` to that exact origin. The policy allows credentials, so a wildcard is not an option.

## Proxying and realtime

Whatever sits in front of the API has to carry the realtime connection as well as ordinary requests:

- pass WebSocket upgrades on `/hubs/`;
- do not buffer that path;
- allow connections to stay open well beyond the hub's 15-second keep-alive interval.

The web image already does all of this. It proxies to a host named `api` on port 8080, resolved on each request, so the platform must provide that name, or the configuration in the web image must change to match.

## Health and readiness

`/api/health` reports that the API process is up and which commit its image was built from (`dev` when built without `GIT_SHA`). It touches neither the identity nor the database, so it suits a liveness probe and says nothing about whether the application works. A meaningful readiness check has to make an authenticated application request. The repository's stack check shows the shape: health through the proxy, the current user, and the application shell. It takes a base URL, so the same check can be pointed at any deployment.

## What would still need deciding

The application is ready to be packaged and configured as described above. These are the decisions that remain before it could serve real users:

- **Identity.** The only identity implementation is the demonstration user named by configuration. The demo identity is enabled by default when not configured, and without the seed the configured user does not exist, so requests would answer `401`. Serving real people needs a real identity provider behind the existing current-user interface. Until then, a deployment can only ever be a demonstration. The "Demo Environment" banner is part of the frontend, not configuration, and would need the same decision.
- **More than one API instance.** Realtime groups live in the memory of each API instance. With two or more instances, a change handled by one would not reach clients connected to another. Running more than one would need a SignalR backplane, which is not configured.
- **The database.** Hosting, backups, restore testing and who may run migrations are operational choices this repository does not make.
- **Logs.** The API logs to standard output and leaves collection, retention and alerting to the platform.
