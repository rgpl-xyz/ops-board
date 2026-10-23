# AI assistance

Scope: the incident brief and typed questions, OpsBoard's AI features: what they do, what keeps them grounded and safe, their limits, and how to configure them. The endpoints and error codes are listed in the [API design](api-design.md), and the settings in [Deployment](deployment.md#configuration-and-secrets).

## What it does

An incident's detail page has a **Summarize with AI** button in its header and an **AI brief** tab beside the timeline. On request, a large language model (LLM) from a provider you configure writes a short brief of that incident in four parts: what happened, the current state, open questions, and suggested next checks. Every statement in the first two parts cites the records it relies on: `I` for the incident record, and `T1`, `T2` and so on for timeline entries. Each citation opens a card describing that record. The brief is labelled with the model and provider that wrote it, says when the incident has changed since it was written, and can be copied as plain text with its sources.

With questions also turned on, the tab has an **Ask about this incident** box under the brief. A person types a question of up to 300 characters, and the answer comes only from the incident's records, its postmortem and up to five related incidents, in at most five sentences that each cite their sources. Related incidents are cited as `R1`, `R2` and so on, and the postmortem as `P`. When the records do not answer the question, the page says so in fixed words. Each question stands alone: nothing is remembered between them.

The feature is off unless configuration turns it on, and questions are a second setting, off unless configured too. With it off, the page shows the timeline exactly as before.

## How a brief is made

1. The server checks the caller's identity and read access, then reads the incident and its newest timeline entries through the same organization-scoped queries as the rest of the API.
2. It turns them into a bounded data document. Long text is shortened and older entries are left out to stay within about 13,000 characters (roughly 4,000 tokens with the instructions). The document says what was left out.
3. It sends fixed instructions, the data as a separate message, and a JSON schema to one provider call. The schema lists the only valid citations and the most statements each part may have.
4. It checks the reply: exactly the four sections, plain statements of bounded length, facts that cite at least one source, and only citations it actually sent. A reply that breaks any rule is refused, not repaired.
5. It completes the citations. When a fact repeats a number, clock time or person's name that none of its cited records holds, but exactly one record it was sent does, that record is added to the fact's sources. The text is never changed.
6. It describes each cited record itself, from stored data, and returns the brief.

A brief has no lookups and takes no typed input: the person can only ask for a brief of the incident on screen.

## How a question is answered

1. The server checks that questions are on, that the question is between 1 and 300 characters, and the caller's identity and read access, before it reads anything.
2. It reads the incident, its newest timeline entries, its postmortem and up to five [related incidents](api-design.md#resources), all through organization-scoped queries for the caller. Related incidents are labelled `R1` to `R5` in the data; the model never sees an incident ID.
3. It sends fixed instructions, the question and the records as one data message (with how long each resolved incident lasted, worked out by the server), and a schema listing the valid citations and the only lookup there is: reading a related incident by its label, at most two.
4. If the model asks for lookups, the server checks each request: the one known lookup, a label it offered for this question, nothing else in the request. It then reads those incidents itself, for the caller, with their description, recent timeline and postmortem, and makes a second call in which lookups are no longer allowed. Any other request refuses the whole question, so a question takes at most two provider calls.
5. It checks the answer: at most five plain sentences, each citing only records it sent. Every date, number, clock time and name in a sentence must appear in the records that sentence cites, and the sentence must share its meaningful words with them, counting the names of the people who wrote them. An answer that breaks any rule is refused, not repaired.
6. It describes each cited record itself, from stored data, and returns the answer. Nothing is stored.

## Safety model

The design assumes an attacker can control every word the model writes, for example through instructions hidden in an incident description or a timeline update. It does not rely on the model obeying its instructions. What it relies on instead:

- **The model can only see what the server sends**: one incident the caller may already read, chosen by the route and the caller's identity, and for a question that incident's related incidents. A brief's request body is ignored, and a question's body is read only for the question, so nothing in it can change the incident, the organization, the instructions or the model.
- **The model can do nothing.** It has no tools that act, and the server has no code path that acts on its reply other than showing checked text and, for a question, reading related incidents. A brief or an answer changes no data.
- **A question is data.** It travels in the data message beside the records, never in the instructions, and is at most 300 characters.
- **A lookup is a request, not authority.** The model can name a related incident only by a label the server issued for that question. The server reads it for the caller's organization, at most two in one round, and an unknown lookup, a label it did not offer, an extra argument or a second round refuses the whole question.
- **Answers are held to their sources.** A date, number, time or name its sources do not hold refuses the answer, and so does a sentence that shares no meaningful words with them, such as a poem or a recipe. This word check stops casual misuse; it cannot stop a reply written to pass it, which is why none of the guarantees here depend on it.
- **Nothing builds up.** Each question stands alone, with no memory of earlier ones.
- **Its reply is checked against a fixed contract** and against the citations actually sent, so it cannot point to records the caller was not given.
- **Its text is shown as text.** The page renders statements by interpolation, never as HTML or Markdown, and builds no links from model output. Source cards come from stored data, not from the model.
- **The instructions contain nothing secret**, so a model repeating them discloses nothing. The provider key is server configuration and never reaches the browser or the model.
- **Use is bounded**: a request timeout, a cap on concurrent provider calls, limits on new briefs and on questions per visitor, and daily limits across the whole deployment, since the demonstration has one shared identity.

The worst a fully hostile reply can do is be refused, or give a poor brief or answer from data the caller could already read.

Data sent to the provider: the incident's title, description, service and team names, severity, status, times, and the newest timeline entries with their authors' display names. A question also sends the question, the incident's postmortem, its related incidents' titles, services, teams, status and times, and for any related incident the model reads, its description, recent timeline entries and postmortem. Choose a provider whose data handling suits that, and turn on zero data retention where the provider offers it.

## Limits and failures

| Limit | Default | When reached |
| --- | --- | --- |
| Provider calls per UTC day | 50 | `429 assistant_daily_limit`, with `Retry-After` until midnight UTC |
| Concurrent provider calls | 2 | `429 assistant_busy`, with `Retry-After` |
| New briefs per visitor | 5 in 10 minutes | `429 assistant_visitor_limit`, with `Retry-After` until the oldest leaves the window |
| Questions per UTC day | 50 | `429 assistant_daily_limit`, with `Retry-After` until midnight UTC |
| Questions per visitor | 5 in 10 minutes | `429 assistant_question_limit`, with `Retry-After` until the oldest leaves the window |
| Question length | 300 characters | `400 validation_failed` |
| Provider calls per question | 2 | the answer is refused: `502 assistant_unverified_response` |
| Whole request | 30 s | `503 assistant_provider_unavailable` |
| Provider call | 20 s, one retry on a server error | `503 assistant_provider_unavailable` |

With questions turned off, asking one answers `503 assistant_questions_disabled`. A provider's own rate limit also answers `assistant_busy` and is never retried. A reply that fails the checks, or that the provider itself rejects against the schema, answers `502 assistant_unverified_response`. The page explains each failure and offers to try again only where that can help.

Visitors are told apart by network address, read from forwarded headers only when they come from a trusted proxy ([client addresses](deployment.md#client-addresses)), so no one visitor can spend the shared daily limit. A refused request spends neither allowance.

A brief is cached per incident and reused while everything the model would see is unchanged, so asking again costs nothing and counts against neither limit. Cached briefs are still subject to the access check on every request. Answers are never cached: each question is new.

A question's data is kept smaller than a brief's, so that a question with two lookups still fits a free tier's tokens per minute. Its limits hold it to about 12,000 characters before lookups and 4,000 for each related incident read. On the demonstration data it is 1,600 to 3,200 characters, and at most 5,800 after reading two related incidents: about 5,000 tokens for both calls.

## Providers

The server talks to any OpenAI-compatible chat completions endpoint, such as Groq, Cloudflare Workers AI or OpenRouter, and never sends tools. Where the provider enforces JSON schemas (`SupportsStrictSchema`), it is asked to; otherwise it is asked for a JSON object and the server's checks are the only enforcement. Free tiers allow a few dozen briefs a day, which is why caching and the daily limit matter.

In Development the API uses an offline **fake provider** that writes a plain brief from the data without any model. Its briefs go through the same checks and are never called AI: `GET /api/assistant` reports `simulated`, the tab reads **Brief (simulated)** and the header button **Summarize (simulated)**, the panel says no AI model is connected, and each brief is labelled as simulated. It also answers questions by fixed rules: a question about earlier or similar incidents reads the strongest related incident and answers from it, and any other question gets the incident's current state. It lets the page, the tests and local work run without a key.

## Observability

Each brief request records `opsboard.assistant.requests` by outcome, plus provider tokens, estimated cost (from configured per-million-token prices) and duration, on the `OpsBoard.Assistant` meter. Questions record `opsboard.assistant.questions` by outcome, `opsboard.assistant.question_duration`, and the related incidents read in `opsboard.assistant.lookups`. Logs carry the outcome, provider, model, token counts and the reason a reply was refused, never the prompt, the question, the data or the reply.

## Tests

Backend unit tests play the model with scripted replies, including replies that follow injected instructions perfectly, and assert what the server refuses, what reaches the model, and how limits behave. For questions they ask for tools that do not exist, name incidents by ID, ask for labels never offered, pass extra arguments, ask for a second round, cite records never sent and state details their sources do not hold, and show that each is refused before anything more is read. Integration tests drive the endpoints over HTTP against PostgreSQL and show that another organization's incident, an unknown identity, an overlong question and fields in the request body never reach the model. The provider adapter is tested against a stubbed HTTP endpoint. Browser journeys use the fake provider. None of these call a real provider. A live evaluation against a real model is a separate, manual check.
