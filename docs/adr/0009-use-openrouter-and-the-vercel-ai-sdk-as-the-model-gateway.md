---
status: proposed
date: 2026-11-14
decision-makers: Amanda Wolf
---

# 0009. Use OpenRouter and the Vercel AI SDK as the model gateway

## Context and Problem Statement

Week 4 activates the project's first LLM call. AI was deferred in
[ADR-0005](0005-defer-ai-agent-features-to-later-weeks-for-the-week-3-releas.md), and the
applicability matrix in [`.claude/rules/README.md`](../../.claude/rules/README.md) marks
the **Model Gateway as "ADAPTED — Week 4"** and the **R3 runtime defenses** as
"ACTIVATES Week 4". Two Planned tickets depend on this layer: **Evidence Search Pipeline
v1** (build order 8) and **Gap Classification** (build order 10).

R3 §1.3 calls for a *model gateway* — a defensive proxy that centralizes access control,
token caps, rate limits, and automated fallback routing. We are one Next.js app on Vercel,
not a fleet with a standalone gateway service (CLAUDE.md anti-cargo-cult clause). We need
to decide how to reach language models so that every call is forced through one place that
enforces: a server-only key, privacy routing, explicit `max_tokens`, a hard timeout,
retry caps of 2–3, truncation handling, Zod-validated structured output with a defensive
parse and a ≤2-turn self-correction loop, and per-call cost/run logging — without building
a separate service or importing a Python/LangGraph stack.

## Decision Drivers

* R3 §1 runtime caps and R3 §2 schema validation activate the moment a model is called
* The key must never reach the browser (ADR-0007 privacy-by-default; secrets-management)
* Career data must not be trained on or stored in production logs
* One choke point so no feature can bypass the caps, privacy routing, or logging
* Cross-provider fallback and a single cost cap, without running gateway infrastructure
* Right-sized: translate the *principle* to TypeScript; no Kafka/saga/LangGraph/FSM lib
* Reusable by the two Planned tickets without either re-implementing model access

## Considered Options

* **OpenRouter + Vercel AI SDK**, wrapped in a single server-side `src/lib/llm/` module
* **Anthropic SDK called directly** from a server module
* **A separate model-gateway service** (as R3 describes literally)

## Decision Outcome

Chosen option: **"OpenRouter + Vercel AI SDK, wrapped in a single server-side
`src/lib/llm/` module"**, because OpenRouter gives the gateway's cross-provider fallback,
privacy routing, and a per-key credit cap without us operating a service, and the Vercel
AI SDK gives typed calls, retries/timeout, and schema-validated structured output. The
single `src/lib/llm/` module is the gateway: all calls go through it, so the R3 caps,
privacy routing, and logging are set once and cannot be skipped.

1. **One gateway module.** `src/lib/llm/` is the only place that calls a model.
   `client.ts` imports `server-only`; `config.ts` holds models + privacy + caps; `run.ts`
   exposes `runLLM()` (thin call / SDK-native structured output) and `runStructured()`
   (defensive-parse + ≤2-turn self-correction). The SDK/HTTP boundary is thin and
   logic-free (Humble Object); callers depend on the typed interface and inject a fake
   `fetch` in tests (Dependency Inversion), per CLAUDE.md rules 2–3.
2. **R3 §1 runtime caps on every call.** Explicit `maxOutputTokens`, a hard `timeoutMs`,
   `maxRetries = 2`, and truncation-aware handling (`finish_reason = length` surfaced).
3. **R3 §2 structured output.** A Zod schema per output; SDK-native structured output is
   the primary path, and `structured.ts` adds a pure defensive parser (strip markdown code
   fences → `safeParse`) plus a bounded **≤2-turn** self-correction loop that feeds the
   validation error back. No "prompt begging". This is a small explicit TypeScript loop —
   **not** LangGraph or an FSM library (R1 stays dormant until Week 6 per the matrix).
4. **Server-only secret.** `OPENROUTER_API_KEY` lives in server env only, never prefixed
   `NEXT_PUBLIC_`, never committed; a placeholder is added to `.env.example`. A per-key
   credit limit is set in the OpenRouter dashboard (OWASP LLM10).
5. **Privacy + injection defenses.** Every request sends `data_collection: "deny"` and
   `zdr: true`; untrusted text is wrapped with `wrapUntrusted()`; the gateway gives the
   model no tools that change data. Production logs store metadata only.
6. **Cost/run logging.** One `llm_runs` row per call (RLS, append-only), metadata always,
   prompt/reply text only in local dev. The migration is applied locally with a dry-run
   first; the hosted push happens only on explicit approval.

### Consequences

* Good, because every model call is forced through one audited choke point with the R3
  caps, privacy routing, and logging — no feature can bypass them
* Good, because cross-provider fallback and a single per-key cost cap come for free, and
  the two Planned tickets reuse `runLLM`/`runStructured` instead of re-integrating models
* Good, because the pure helpers (parser, fence-stripper, correction-builder, truncation
  detector, cost mapper) are cheap to unit-test behind the thin SDK boundary
* Bad, because OpenRouter is a new third-party dependency in the request path (mitigated by
  fallback routing, a credit cap, and privacy routing)
* Bad, because routing through OpenRouter adds a small latency hop versus a direct provider
  call (accepted for the fallback and single-cap benefits)
* Neutral, because model ids must be confirmed with `check_models.py` before use and can
  drift; the fallback list and a typed 404 error absorb this

### Confirmation

Enforced four ways: (1) `client.ts` imports `server-only`, so the build fails if browser
code imports the gateway; (2) the CI rule below forbids the key from any `NEXT_PUBLIC_`
variable; (3) unit tests cover the pure structured-output helpers and the gateway's caps,
privacy routing, logging, and self-correction against a fake OpenRouter, to the 80%
coverage floor; (4) the `llm_runs` migration review confirms RLS is enabled with
per-user, append-only policies.

```adr-rules
[
  {"id": "openrouter-key-never-public",
   "description": "The OpenRouter API key must never be exposed via a NEXT_PUBLIC_ variable.",
   "files": ["**/*.ts", "**/*.tsx", "**/*.mjs", "**/*.js"],
   "forbid": "NEXT_PUBLIC_[A-Z_]*OPENROUTER",
   "allow_in": []},
  {"id": "no-raw-openrouter-base-url-outside-gateway",
   "description": "OpenRouter is reached only through the gateway module (src/lib/llm). No feature code hard-codes the OpenRouter host.",
   "files": ["src/**/*.ts", "src/**/*.tsx"],
   "forbid": "openrouter\\.ai/api",
   "allow_in": ["src/lib/llm/"]}
]
```

## Pros and Cons of the Options

### OpenRouter + Vercel AI SDK, wrapped in one server-side module

* Good, because it delivers the gateway's fallback, privacy routing, and cost cap with no
  service to run, and the AI SDK gives typed calls, retries/timeout, and structured output
* Good, because one server-only module is a natural single choke point for the R3 caps
* Bad, because it adds a third-party hop in the request path and another model-id surface

### Anthropic SDK called directly

* Good, because it is the most direct path to a capable model with the fewest hops
* Bad, because there is no cross-provider fallback and no single per-key cost cap, and
  adding a second provider later means a second integration and a second logging path

### A separate model-gateway service (R3 literal)

* Good, because it matches R3 §1.3 word-for-word and would centralize controls at the edge
* Bad, because it is a second deployable and datastore boundary for one app with none of
  the problems a gateway service solves — exactly the cargo-cult the CLAUDE.md clause
  forbids; it would need its own ADR to justify the architecture change

## More Information

Realizes the "Model Gateway — ADAPTED, Week 4" and "R3 runtime defenses — ACTIVATES Week 4"
rows of the [applicability matrix](../../.claude/rules/README.md). Related:
[ADR-0003](0003-use-supabase-for-the-database-with-row-level-security.md) (RLS ownership),
[ADR-0005](0005-defer-ai-agent-features-to-later-weeks-for-the-week-3-releas.md) (AI
deferred), [ADR-0007](0007-handle-user-career-data-with-a-privacy-by-default-policy.md)
(server-only secret key, privacy by default). Design:
[`docs/design/ai-foundation-openrouter.md`](../design/ai-foundation-openrouter.md).
Revisit when Week 6 adds a multi-step agent (R1 FSM/HITL activates) or if a second service
or async worker is introduced (R2 rows flip ACTIVE — a new ADR then).
