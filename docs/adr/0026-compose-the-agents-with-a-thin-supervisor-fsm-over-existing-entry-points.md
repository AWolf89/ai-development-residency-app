---
status: accepted
date: 2026-11-23
decision-makers: AWolf89
---

# 0026. Compose the agents with a thin supervisor FSM over existing entry points

## Context and Problem Statement

The app has five peer agent loops — reconciliation, auto-propose, interview, reviewer, gap/investigation — each a pure `reduce(state, event)` FSM behind a `server-only` orchestrator with its own accept-only HITL gate. They are coupled only through shared Supabase tables; nothing sequences them, so the user has to move between tools by hand (assessment §3 item 2, §6). MVP 2 Phase 4 asks for a flow — upload → reconcile → propose → interview → review → map — that runs for the user with a review at each step. The proposal's "Career Intelligence Orchestrator" language (a central coordinator, handoffs, workflow state) maps onto R1's supervisor/swarm patterns, which the applicability matrix keeps **DORMANT** for good reason (one app, no second agent). The question is **how much coordinator to build** without violating the anti-cargo-cult clause (CLAUDE.md §2.1), which forbids a bus/saga/outbox/CDC/LangGraph introduced to satisfy a spec.

## Decision Drivers

* AC1: the layer must compose existing entry points only — no prompt or reasoning of its own.
* AC2: every evidence side effect must still pass its own agent's accept-only HITL gate.
* AC3: no distributed-systems machinery; any durable state must be a discriminated-union + a pure router (R1, in force), with the R2 rows staying DORMANT.
* AC4: if one step fails, prior steps' saved state is intact and the user can resume from the failed step.
* AC5: the flow operates only on the user's own data (RLS).
* R1 is already satisfied *per agent*; a cross-agent layer must slot **above** that contract, not re-implement it.

## Considered Options

* A thin supervisor FSM over the existing entry points, with position in one durable row
* A heavyweight stateful orchestrator with a message bus / saga / LangGraph-style runtime
* Derive workflow position on-read with no persisted run

## Decision Outcome

Chosen option: "A thin supervisor FSM over the existing entry points, with position in one durable row", because it is the smallest thing that meets every AC: a pure `reduce(state, event)` router (`src/lib/orchestrator/machine.ts`) tracks a fixed four-step ledger, a `server-only` boundary calls the agents' existing non-side-effecting **propose** entry points and records when each agent's own save fired, and one `orchestration_runs` row persists only position so a failed step is resumable with prior saves untouched. It re-implements no agent reasoning and introduces no bus, saga, or outbox — it activates the R1 supervisor row exactly as the matrix always said it would (a TypeScript FSM, not LangGraph), and leaves the R2 rows DORMANT. This change flips the R1 supervisor/FSM, HITL, and circuit-breaker rows to **ACTIVE for a composition supervisor** in both the applicability matrix (`.claude/rules/README.md`) and the CLAUDE.md §4 trigger table, in this same change.

### Consequences

* Good, because the orchestrator has no model call, no prompt, and no save capability in its injected deps — AC1/AC2 hold by construction, proven by a boundary test asserting no evidence is ever written during `advanceRun` and that each agent's own accept-only action stays the only save path.
* Good, because workflow position is one small discriminated-union state rehydrated from one row (the interview-session pattern, ADR-0014), so a mid-flow failure is durable and the user resumes from exactly the failed step with every prior `done` step intact (AC4).
* Good, because the Investigation Queue stays derive-on-read (no queue table): the flow's steps produce its signals and the `complete` state surfaces it, so "track workflow position" and "populate the queue" cost one table and zero new reasoning.
* Bad, because the orchestrator cannot observe an agent's HITL save directly — it trusts the UI to call `completeStep` after the agent's own save action returns — so a client that advances the run without actually saving would record a step as done that was not; the per-agent gate still prevents a bogus save, but run position could drift from agent state until the next read reconciles it.
* Bad, because adding `orchestration_runs` is one more stateful table and a new ADR for a composition layer the assessment itself marks "optional, last", so if the end-to-end flow proves unused the row is maintenance carried for little return.

### Confirmation

The pure router is unit-tested to 100% (`machine.test.ts`): a step reaches `done` only via `step_accepted` from `awaiting_review`, failure records the position, and `resume` re-opens exactly the failed step. The boundary (`tests/orchestrator/mock-orchestrator.test.mts`, run under `--conditions=react-server`) drives the whole flow against fake runners and a fake repo and asserts: only the cursor step's propose runner is called; the deps expose no save at all; a throwing step leaves prior steps `done` and persists `failed`; and another user's run is refused. Own-rows RLS on `orchestration_runs` (with an insert check that the anchoring file is the user's) enforces AC5; the deterministic eval gate (`npm test` + the six per-agent mock suites + `eval:agents:selftest`) is re-run unchanged to confirm no agent reasoning moved.

## Pros and Cons of the Options

### A thin supervisor FSM over the existing entry points, with position in one durable row

* Good, because it meets every AC with the least machinery: a pure router, a `server-only` boundary that only calls existing propose entry points, and one position row.
* Good, because it is the faithful in-stack realisation of the R1 supervisor row (discriminated-union state + pure router), not LangGraph — compliance, not cargo-cult.
* Good, because position is durable and resumable without duplicating any agent data.
* Bad, because step completion is reported by the caller, so run position can momentarily diverge from agent state until a read reconciles it.

### A heavyweight stateful orchestrator with a message bus / saga / LangGraph-style runtime

* Good, because it would give automatic cross-step retries, compensation, and a durable execution log out of the box.
* Bad, because it directly violates the anti-cargo-cult clause (CLAUDE.md §2.1): the app has none of the problems a bus/saga/outbox/CDC solves (one app, one DB, no async workers, no second agent), so adding them is a rule violation, not compliance.
* Bad, because it would re-implement orchestration the agents already encapsulate per-loop, inflating a one-user one-DB app with distributed-systems infrastructure it has no use for.

### Derive workflow position on-read with no persisted run

* Good, because it adds no table or migration — position is computed from existing agent rows, like the Investigation Queue.
* Bad, because a deliberate skip is indistinguishable from "not done yet", and there is no stable anchor tying one flow to one file across steps — AC4's "resume from the failed step" has nothing durable to resume.
* Bad, because the card explicitly asks to model workflow position durably (like interview-session rehydration), which this option does not do.

## More Information

Implements MVP 2 Phase 4 (build order 13) and `docs/evidence-foundation-assessment.md` §6 (the "thin composition, not a runtime" row) and §4 item C3 (orchestrator cargo-cult risk). Composes the existing entry points in [ADR-0023](0023-reconcile-new-uploads-against-existing-evidence-and-store-co.md) (reconciliation), the Auto-propose flow (MVP 2 Phase 2), [ADR-0021](0021-anchor-the-cdm-interview-to-a-user-corrected-project-timeline.md)/[ADR-0013](0013-model-the-reasoning-interview-as-an-explicit-fsm.md) (interview FSM + HITL isolation), [ADR-0016](0016-model-the-reviewer-agent-check-as-a-grounded-fsm-quality-gate.md) (reviewer), and [ADR-0024](0024-present-gap-verdicts-in-four-categories-and-route-unverified.md) (gap/Investigation Queue). The end-to-end UI wizard is deliberately left as a follow-up — this ADR covers the composition layer, its durable position, and the ADR-recorded R1 activation only. Revisit if the app ever splits into services or adds async workers, which would move the R2 saga/outbox rows from DORMANT to ACTIVE under their own ADR.
