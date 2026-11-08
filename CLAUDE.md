# CLAUDE.md — Master Instructions

> Read this file first, every session. It governs every AI tool and human contributor
> working in this repository. It does not restate the engineering specs; it points to
> them and says how they apply **to this app as it actually exists today.**

## 1. What this project is (ground truth — do not assume otherwise)

The **Career Evidence Agent**, built during the AI Development Residency:

- **One** Next.js 16 app (App Router) in **TypeScript** + React 19 + **Material UI**.
- **Supabase** (Postgres + Row-Level Security + Storage) as the single datastore.
- Deployed to **Vercel** (serverless). One deployable, one database.
- **AI/agent features are deferred** to Weeks 4/6/7 per
  [ADR-0005](docs/adr/0005-defer-ai-agent-features-to-later-weeks-for-the-week-3-releas.md).
  As of now there is **no LLM call, no agent, and no second service.**

This is **not** a distributed microservice fleet and **not** a Python/LangGraph system.
See [`docs/adr/`](docs/adr/) for why each choice was made.

## 1.1 Order of authority (use this to resolve any conflict)

If two sources ever seem to disagree, the higher one wins. This exists so there is
always one answer, never a judgment call:

1. **Safety & security rules** — always first; never overridden.
2. **[AGENTS.md](AGENTS.md)** — tool-generated Next.js runtime facts; factual, not opinion.
3. **[ADRs](docs/adr/)** — decisions actually recorded for this project.
4. **This file + the [applicability matrix](.claude/rules/README.md)** — the project rules.
5. **Skills** (`design-review`, `git-workflow`, `llm-integration`, `supabase-data`, etc.) — the how-to steps for doing the work.
6. **Specs R1–R3** — reference material only, and always read *through* the matrix, never raw.

So a recorded ADR out-ranks these guardrails, and these guardrails out-rank the raw
specs. The specs can never override a decision you have written down.

## 2. The guardrail specs

Three immutable specifications live in [`.claude/rules/`](.claude/rules/) and are
authoritative source material:

- **[R1] [multi-agent-architectural-rules.md](.claude/rules/multi-agent-architectural-rules.md)** — orchestration, handoffs, fault tolerance.
- **[R2] [distributed-systems-structural-rules.md](.claude/rules/distributed-systems-structural-rules.md)** — data boundaries, persistence, recovery.
- **[R3] [agentic-runtime-defenses-and-standards.md](.claude/rules/agentic-runtime-defenses-and-standards.md)** — runtime caps, schema validation, clean code.

**They are written for a distributed Python/LangGraph system. This app is not that
system.** Therefore they are enforced by **principle, gated on applicability** — never
by copying their code. The authority on *what is in force and when* is the
**[applicability matrix](.claude/rules/README.md#applicability-matrix--what-is-in-force-and-when)**
in the rules index. Consult it before applying any rule.

### 2.1 The anti-cargo-cult clause (binding)

A rule from R1–R3 applies **only** when the thing it governs exists in this repo.

- **Do not** introduce Kafka, sagas, outbox tables, CDC, fencing tokens, CRDTs,
  event sourcing, CQRS, Temporal, LangGraph, or `Pydantic` to satisfy a spec.
  This app has none of the problems those solve. Adding them is a **rule violation**,
  not compliance.
- **Do** translate the *principle* into this stack: Python → TypeScript,
  `Pydantic` → **Zod**, LangGraph graph → an explicit TypeScript state machine
  (discriminated-union state + a pure router function), "model gateway service" →
  a single server-side client module.
- If a rule seems to demand infrastructure we do not have, it is **DORMANT** (see the
  matrix). Note it and move on; do not build the infrastructure speculatively.

## 3. Rules in force NOW (any TypeScript written today)

From **R3 §3** (clean architecture) — language-agnostic, non-negotiable:

1. **Single Responsibility.** No function mixes prompt/IO/parsing/business logic.
   Prompts, persistence, and orchestration live in separate modules.
2. **Dependency Inversion / Injection.** High-level logic depends on an interface, not
   on a vendor SDK. Every external boundary (Supabase, later the model client) sits
   behind a typed interface so it can be mocked in tests.
3. **Humble Object at every boundary.** Keep SDK/HTTP wrappers thin and logic-free;
   put all testable logic (validators, state updates, mappers) in pure functions.
4. **Command/Query separation + typed errors.** Mutations throw domain-specific errors;
   they do not return error codes. Functions stay small and single-level-of-abstraction.
5. **TDD / high coverage.** Pure logic is unit-tested with canned inputs before wiring.
   The **enforced gate is CI's 80% coverage floor** (see `ci-cd-setup`); the specs'
   "100% asymptotically" is an aspiration, not a release requirement. 80% is the number.

From **R2 §1** (boundaries), read as *module* boundaries in one app:

6. **Ownership & encapsulation.** A feature owns its data access; other features go
   through its functions, never its tables directly. Enforce row ownership with
   **Supabase RLS** (see [ADR-0003](docs/adr/0003-use-supabase-for-the-database-with-row-level-security.md)).
   No raw CRUD that leaks state-transition logic to callers.

From **R2 §2** (idempotency) — applies the moment a mutating route exists:

7. **Idempotent mutations.** Any Server Action / Route Handler that mutates
   count-like or money-like state carries a client-generated **Request ID** and is
   guarded by a `processed_requests` unique-key insert **or** an optimistic-concurrency
   version column (`UPDATE … WHERE version = $expected`). Network delivery is
   at-least-once; never assume exactly-once.

## 4. Rules that ACTIVATE on a trigger (not before)

| Trigger | Then enforce |
|---------|--------------|
| **First LLM/OpenRouter call (Week 4)** | **R3 §1**: explicit `max_tokens` on every call; retry/reflection caps of **2–3**; a hard timeout; truncation-aware parsing. **R3 §2**: structured output validated with **Zod** (not prompt-begging); defensive parse (strip code fences) before validate; feed validation errors back for ≤2 self-correction turns. Server-only API key (see `secrets-management`). |
| **First agent / multi-step loop (Week 6)** | **R1**: model the loop as an explicit TypeScript **FSM** (typed state + pure router), not ad-hoc branching. Hard **step/recursion caps** with a force-stop. **HITL gate**: never perform a side effect in the same step as the approval prompt — pause, collect `accept`/`edit`/`reject`, then act. **Circuit breaker** + deterministic fallback on repeated failure. |
| **App splits into services / adds async workers** | **R2 §1.4–§2**: sagas, transactional outbox, idempotent consumers, total-order log. Requires a new **ADR** first. |
| **Multi-writer / distributed locks introduced** | **R2 §2.3**: version vectors / CAS / fencing tokens. Requires a new ADR first. |

Delegated and not our code to write: **R2 §3** storage-engine crash recovery (WAL/LSM/
SSTable) and durable execution are owned by Supabase/Postgres and the platform.

## 5. Process

- **Changing a guardrail is an architecture decision.** Edit the
  [applicability matrix](.claude/rules/README.md) and the matching section here, and
  record it as an **ADR** in [`docs/adr/`](docs/adr/) (MADR 4.0.0). The specs
  themselves (R1–R3) are never edited to fit convenience.
- **Before building anything**, follow the `design-review` → `git-workflow` →
  `self-review-checklist` flow the residency uses; `security-review` when a change
  touches auth, input, secrets, or storage.
- **[AGENTS.md](AGENTS.md)** is regenerated by `next dev`. Respect its Next.js version
  notes and commit it with your work rather than fighting the diff.
- Never commit to `main`; use `type/short-description` branches and Conventional Commits.

## 6. One-line summary

Build a clean, well-tested **TypeScript/Next.js/Supabase** app. Treat R1–R3 as the
standard you grow into: apply their **principles** now (SOLID, DI, idempotency,
boundaries), switch on their **runtime defenses** the week the matching feature lands,
and leave their **distributed-systems machinery dormant** until an ADR says the
architecture actually needs it.
