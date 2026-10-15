# AI assistance

Scope: the incident brief, OpsBoard's first AI feature: what it does, what keeps it grounded and safe, its limits, and how to configure it. The endpoints and error codes are listed in the [API design](api-design.md), and the settings in [Deployment](deployment.md#configuration-and-secrets).

## What it does

An incident's detail page has a **Summarize with AI** button in its header and an **AI brief** tab beside the timeline. On request, a large language model (LLM) from a provider you configure writes a short brief of that incident in four parts: what happened, the current state, open questions, and suggested next checks. Every statement in the first two parts cites the records it relies on: `I` for the incident record, and `T1`, `T2` and so on for timeline entries. Each citation opens a card describing that record. The brief is labelled with the model and provider that wrote it, says when the incident has changed since it was written, and can be copied as plain text with its sources.

The feature is off unless configuration turns it on. With it off, the page shows the timeline exactly as before.

## How a brief is made

1. The server checks the caller's identity and read access, then reads the incident and its newest timeline entries through the same organization-scoped queries as the rest of the API.
2. It turns them into a bounded data document. Long text is shortened and older entries are left out to stay within about 13,000 characters (roughly 4,000 tokens with the instructions). The document says what was left out.
3. It sends fixed instructions, the data as a separate message, and a JSON schema to one provider call. The schema lists the only valid citations and the most statements each part may have.
4. It checks the reply: exactly the four sections, plain statements of bounded length, facts that cite at least one source, and only citations it actually sent. A reply that breaks any rule is refused, not repaired.
5. It completes the citations. When a fact repeats a number, clock time or person's name that none of its cited records holds, but exactly one record it was sent does, that record is added to the fact's sources. The text is never changed.
6. It describes each cited record itself, from stored data, and returns the brief.

There is no tool calling, no free-form question, and no conversation in this version: the person can only ask for a brief of the incident on screen.

## Safety model

The design assumes an attacker can control every word the model writes, for example through instructions hidden in an incident description or a timeline update. It does not rely on the model obeying its instructions. What it relies on instead:

- **The model can only see what the server sends**: one incident the caller may already read, chosen by the route and the caller's identity. The request body is ignored, so nothing in it can change the incident, the organization, the instructions or the model.
- **The model can do nothing.** It has no tools and the server has no code path that acts on its reply, other than showing checked text. A brief changes no data.
- **Its reply is checked against a fixed contract** and against the citations actually sent, so it cannot point to records the caller was not given.
- **Its text is shown as text.** The page renders statements by interpolation, never as HTML or Markdown, and builds no links from model output. Source cards come from stored data, not from the model.
- **The instructions contain nothing secret**, so a model repeating them discloses nothing. The provider key is server configuration and never reaches the browser or the model.
- **Use is bounded**: a request timeout, a cap on concurrent provider calls, a limit on new briefs per visitor, and a daily limit across the whole deployment, since the demonstration has one shared identity.

The worst a fully hostile reply can do is be refused, or give a poor brief from data the caller could already read.

Data sent to the provider: the incident's title, description, service and team names, severity, status, times, and the newest timeline entries with their authors' display names. Choose a provider whose data handling suits that, and turn on zero data retention where the provider offers it.

## Limits and failures

| Limit | Default | When reached |
| --- | --- | --- |
| Provider calls per UTC day | 50 | `429 assistant_daily_limit`, with `Retry-After` until midnight UTC |
| Concurrent provider calls | 2 | `429 assistant_busy`, with `Retry-After` |
| New briefs per visitor | 5 in 10 minutes | `429 assistant_visitor_limit`, with `Retry-After` until the oldest leaves the window |
| Whole request | 30 s | `503 assistant_provider_unavailable` |
| Provider call | 20 s, one retry on a server error | `503 assistant_provider_unavailable` |

A provider's own rate limit also answers `assistant_busy` and is never retried. A reply that fails the checks, or that the provider itself rejects against the schema, answers `502 assistant_unverified_response`. The page explains each failure and offers to try again only where that can help.

Visitors are told apart by network address, read from forwarded headers only when they come from a trusted proxy ([client addresses](deployment.md#client-addresses)), so no one visitor can spend the shared daily limit. A refused request spends neither allowance.

A brief is cached per incident and reused while everything the model would see is unchanged, so asking again costs nothing and counts against neither limit. Cached briefs are still subject to the access check on every request.

## Providers

The server talks to any OpenAI-compatible chat completions endpoint, such as Groq, Cloudflare Workers AI or OpenRouter, and never sends tools. Where the provider enforces JSON schemas (`SupportsStrictSchema`), it is asked to; otherwise it is asked for a JSON object and the server's checks are the only enforcement. Free tiers allow a few dozen briefs a day, which is why caching and the daily limit matter.

In Development the API uses an offline **fake provider** that writes a plain brief from the data without any model. Its briefs go through the same checks and are never called AI: `GET /api/assistant` reports `simulated`, the tab reads **Brief (simulated)** and the header button **Summarize (simulated)**, the panel says no AI model is connected, and each brief is labelled as simulated. It lets the page, the tests and local work run without a key.

## Observability

Each request records `opsboard.assistant.requests` by outcome, plus provider tokens, estimated cost (from configured per-million-token prices) and duration, on the `OpsBoard.Assistant` meter. Logs carry the outcome, provider, model, token counts and the reason a reply was refused, never the prompt, the data or the reply.

## Tests

Backend unit tests play the model with scripted replies, including replies that follow injected instructions, and assert what the server refuses, what reaches the model, and how limits behave. Integration tests drive the endpoint over HTTP against PostgreSQL and show that another organization's incident, an unknown identity and fields in the request body never reach the model. The provider adapter is tested against a stubbed HTTP endpoint. Browser journeys use the fake provider. None of these call a real provider. A live evaluation against a real model is a separate, manual check.
