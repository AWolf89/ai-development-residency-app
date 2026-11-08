# Project Guardrails — `.claude/rules/`

This folder holds the **immutable engineering specifications** that govern how this
repository is built. They are referenced (not restated) by the root
[`CLAUDE.md`](../../CLAUDE.md), which is the master instruction file every AI tool
and human contributor reads first.

The three specs are stored **verbatim**. They are reference-grade and are not edited
to match the app; instead `CLAUDE.md` maps each one onto this stack and declares, per
section, whether it is in force **now**, **later**, or **dormant**. This preserves the
specs as authoritative source material while keeping day-to-day rules honest about what
the app actually is.

## File-system map

```
AI Development Residency - App/
├── CLAUDE.md                                  # Master instructions — read first; maps specs → this stack
├── AGENTS.md                                  # Next.js runtime notes (tool-generated; do not fight it)
├── docs/
│   └── adr/                                   # Architecture Decision Records (MADR 4.0.0)
│       ├── 0001 … 0006-*.md                   # Why the stack is what it is
│       └── README.md
└── .claude/
    └── rules/                                 # ◀ Guardrail specs live here
        ├── README.md                          # This file — index + applicability matrix
        ├── multi-agent-architectural-rules.md         # [R1] Orchestration, handoffs, fault tolerance
        ├── distributed-systems-structural-rules.md    # [R2] Data boundaries, persistence, recovery
        └── agentic-runtime-defenses-and-standards.md  # [R3] Runtime caps, schema validation, clean code
```

Both local configuration and CI resolve rules by this path: `.claude/rules/*.md`.
Filenames are stable identifiers — do not rename them; `CLAUDE.md` and any CI check
reference them by exact name.

## The specs

| ID | File | Scope | Origin assumption |
|----|------|-------|-------------------|
| **R1** | `multi-agent-architectural-rules.md` | FSM/HSM orchestration, supervisor/swarm handoffs, retries, HITL gates, circuit breakers | Python / LangGraph, running multi-agent system |
| **R2** | `distributed-systems-structural-rules.md` | Bounded contexts, event sourcing/CQRS, sagas, outbox/CDC, idempotency, crash recovery | Multi-service distributed fleet |
| **R3** | `agentic-runtime-defenses-and-standards.md` | Execution caps, constrained decoding, Pydantic validation, SOLID / Humble Object / DI, TDD | Python agentic services |

## Applicability matrix — what is in force, and when

> **This matrix is the contract.** It resolves the gap between the specs (written for a
> distributed Python/LangGraph fleet) and this repo (one Next.js + TypeScript + Supabase
> app on Vercel, with AI features deferred per [ADR-0005](../../docs/adr/0005-defer-ai-agent-features-to-later-weeks-for-the-week-3-releas.md)).

| Spec area | Status in this repo | Why |
|-----------|---------------------|-----|
| **R3** — execution caps (`max_tokens`, `max_iterations`, retry caps 2–3), context trimming | **ACTIVATES Week 4** | No model is called yet. Becomes mandatory the moment an LLM/OpenRouter call exists. |
| **R3** — schema validation (constrained decoding, defensive parse, typed validators) | **ACTIVATES Week 4** | Translate `Pydantic` → **Zod**. No "prompt begging"; validate every model output structurally. |
| **R3** — SOLID, Humble Object, Dependency Injection, TDD, function sizing | **ACTIVE NOW** | Language-agnostic craftsmanship. Applies to all TypeScript written today. |
| **R3** — Model Gateway | **ADAPTED — Week 4** | We do not run a gateway service. OpenRouter + a single server-side client module is the gateway equivalent. |
| **R1** — FSM/HSM, supervisor/swarm, `Command`, handoff tools, A2A/JSON-RPC | **ACTIVATES Week 6** | There is no agent to orchestrate yet. On arrival, realize in TypeScript (e.g. explicit state unions + a router), **not** by importing LangGraph. |
| **R1** — HITL interruption gates (pause → approve → act) | **ACTIVATES Week 6** | The *principle* (never side-effect in the same step as the approval prompt) is binding when agent actions arrive. |
| **R1** — recursion/step caps, circuit breakers, fallback cascades | **ACTIVATES Week 6** | Same as R3 caps, at the orchestration layer. |
| **R2** — SOLID data boundaries, "service owns its data", tolerant readers | **ACTIVE (as module boundaries)** | One app, one DB. Read this as *module/route boundaries* and Supabase RLS ownership, not microservice splits. |
| **R2** — idempotency (`Request ID` + dedupe table), conditional writes (CAS), optimistic concurrency | **ACTIVE when a route is non-idempotent** | Applies today to any API route/Server Action that mutates money-like or count-like state. Use a `processed_requests` row or a version column. |
| **R2** — event sourcing, CQRS, sagas, transactional outbox, CDC | **DORMANT** | These govern multi-service workflows. Adopt only if/when the app is split into services or adds async workers. Do not pre-build. |
| **R2** — fencing tokens, CRDTs, Kafka total-order broadcast | **DORMANT** | No distributed locks, no multi-writer replicas, no Kafka. Out of scope unless architecture changes. |
| **R2** — storage-engine crash recovery (WAL/LSM/SSTable), Temporal durable execution | **DELEGATED** | Owned by Supabase/Postgres and the platform. We rely on it; we do not implement it. Relevant only as background knowledge. |

**DORMANT** rules are not deleted and not weakened — they are pre-approved and waiting.
If a future ADR moves the app toward distribution, async workers, or multi-writer data,
the corresponding rows flip to ACTIVE and `CLAUDE.md` is updated in the same change.

## How to change a guardrail

1. Specs (`R1`–`R3`) are **immutable reference** — do not edit them to fit convenience.
2. To change *what is enforced*, change the **applicability matrix above** and the
   matching section of `CLAUDE.md`, and record the reasoning as an **ADR** in
   [`docs/adr/`](../../docs/adr/). A guardrail change is an architecture decision.
