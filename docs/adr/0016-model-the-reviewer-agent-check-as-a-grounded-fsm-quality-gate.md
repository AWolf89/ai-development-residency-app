---
status: proposed
date: 2026-11-18
decision-makers: Amanda Wolf
---

# 0016. Model the Reviewer Agent Check as a grounded TypeScript FSM quality gate with a human-in-the-loop accept

## Context and Problem Statement

The **Reviewer Agent Check** is the quality-gate half of the job-seeker "Reasoning Interview &
Verified Records" epic (Epic 2). The
[Reasoning Interview](../design/reasoning-interview.md) ([ADR-0013](0013-model-the-reasoning-interview-as-an-explicit-fsm.md))
*captures* a verified **decision record**; this agent *examines a saved record before it is
trusted* and **flags issues** — claims with no supporting evidence, overclaiming, vagueness, or
missing detail — then lets the user **accept / edit / reject** those flags. It consumes the model
gateway ([ADR-0009](0009-use-openrouter-and-the-vercel-ai-sdk-as-the-model-gateway.md)) and
closed-RAG retrieval
([ADR-0010](0010-use-pgvector-for-closed-rag-retrieval-over-reference-and-evidence.md)) and reads
the existing `decision_records` model.

**This is the app's third agent / multi-step loop** (after the Reasoning Interview and the
Evidence Investigation Agent being built in parallel). The R1 (FSM/HITL/caps) and the Week-6 half
of R3 rows of the [applicability matrix](../../.claude/rules/README.md) are already **ACTIVE**
(flipped by ADR-0013), so a new agent loop must meet the same bar. The hard questions are the same
control-flow questions the interview faced, costly to get wrong because they decide whether the
loop can run away, invent evidence, or persist something the user never approved:

1. **How is the loop controlled?** A reviewer that runs several grounded passes and accumulates
   flags needs one auditable place to answer "have we run too many passes?" and "can we persist
   here?". Ad-hoc branching mixes non-determinism (model output) with control flow and is
   untestable.
2. **Can a flag invent evidence?** A reviewer that claims a record "overstates the evidence" must
   point at evidence that was actually retrieved. Trusting the model's prose would let it fabricate
   a contradiction — the closed-RAG promise (ADR-0010/0011) must hold here too.
3. **Can a record be marked reviewed without approval?** R1 §3.4 (HITL isolation) requires a side
   effect never share a step with the approval prompt. Persisting flags / marking a record reviewed
   in the same step as a review pass would trust a verdict the user has not seen.

## Decision Drivers

* Honor R1 FSM/HITL/caps and the Week-6 half of R3 by **principle**, in TypeScript — no LangGraph, no Pydantic, no second service
* Marking a record reviewed and persisting flags must be structurally impossible without an explicit user `accept` (R1 §3.4 HITL isolation)
* The loop must be bounded: a hard check budget and a circuit breaker on repeated model failure (R1 §3.5, R3 §1)
* Never invent evidence: a flag that asserts overstatement must cite really-retrieved evidence, validated in pure code, or be downgraded (closed RAG, ADR-0010/0011)
* Control flow must be pure and unit-testable to 100% — no IO inside the router (Humble Object, CLAUDE.md §3)
* One model path: reuse `runStructured`, `wrapUntrusted`, `supabaseSink`, `llm_runs` (no second gateway)
* Additive only: reuse `decision_records` unchanged; do not touch the interview, gap, or investigation modules

## Considered Options

* Grounded TypeScript FSM: a discriminated-union state plus a pure `reduce(state, event)` router that runs one grounded pass per fixed review dimension, with `saving` reachable only from `awaiting_review` on `accept`, a check-budget guard, a circuit breaker, and pure citation validation that downgrades uncited flags
* A single structured model call that returns every flag for the whole record in one pass, presented for approval with no state machine
* An autonomous reviewer that marks records reviewed (or edits them) itself, with the user auditing afterward
* Import LangGraph (or a JavaScript port) and model the reviewer as a graph

## Decision Outcome

Chosen option: "Grounded TypeScript FSM: a discriminated-union state plus a pure `reduce(state, event)` router that runs one grounded pass per fixed review dimension, with `saving` reachable only from `awaiting_review` on `accept`, a check-budget guard, a circuit breaker, and pure citation validation that downgrades uncited flags", because it makes the HITL invariant, the loop bounds, and the closed-RAG grounding structural and auditable in pure modules, mirrors the proven interview pattern (ADR-0013) and the Gap Check's grounding (ADR-0011) in this same stack, and keeps all control flow unit-testable to 100% while the non-deterministic calls stay behind the orchestrator boundary.

1. **Explicit state machine.** `ReviewState` is a typed discriminated union
   (`planning | reviewing | awaiting_review | saving | paused | discarded | complete`).
   `ReviewEvent` is a typed union. A pure `reduce(state, event) → state` router performs the
   transitions. **No side effects** run inside the router — the orchestrator performs retrieval,
   model calls, and DB writes, then feeds each result back as the next event.
2. **HITL isolation (R1 §3.4), structural.** `saving` — the only state that persists flags and
   marks the record reviewed — is reached **only** from `awaiting_review` on `accept`. A review
   pass (`reviewing`) and a persisted side effect (`saving`) can never occupy the same step.
   `edit` changes flag dispositions and stays in `awaiting_review`; `reject` routes to
   `discarded` and persists no flags and no "reviewed" trust. A unit test asserts no other
   transition reaches `saving`.
3. **Hard caps (R1 §3.5, R3 §1).** A pure guard `budget_reached` ends the review phase when
   `checks_done ≥ check_budget` (default 4 — the four dimensions — hard cap 8, clamped in
   `createReview`). A `llm_failed` event increments a failure counter; after N consecutive
   failures a **circuit breaker** degrades the loop to `paused` rather than retrying forever.
   Every model call still carries the gateway's R3 caps (`maxOutputTokens`, `timeoutMs`, ≤2
   correction turns, 2 transport retries) from ADR-0009 — unchanged.
4. **Grounding and honesty.** The `support` and `accuracy` dimensions retrieve the user's own
   evidence; the record and evidence are `wrapUntrusted()`-wrapped (OWASP LLM01). Flags are a
   strict structured `extract`, validated with Zod. Citations are validated against really-
   retrieved sources in pure code (`validateFlagCitations`, mirroring `gap/classify.ts`); an
   `accuracy` flag with no valid citation is **downgraded** to a `support` flag. When no evidence
   is retrieved, `support` emits one honest "no supporting evidence on file" flag with **no model
   call** and `accuracy` is skipped. The `specificity` and `completeness` dimensions judge the
   record text only, make no retrieval call, and carry no evidence citation. The model has **no
   side-effecting tools**.
5. **Persistence, additive.** Two own-rows-RLS tables, `record_reviews` and
   `record_review_flags`, mirror the interview's session/turn shape (ADR-0014). A record counts
   as reviewed when it has a `record_reviews` row with `status = complete` — the reviewed state is
   *derived*, so `decision_records` and the claims projection (ADR-0015) are untouched.

### Consequences

* Good, because a record can never be marked reviewed and no flags can be written without an explicit `accept` — the only edge into `saving` is from `awaiting_review`, and a test enforces it.
* Good, because the loop is provably bounded: the check-budget guard and the circuit breaker are pure predicates covered to 100%.
* Good, because the closed-RAG promise holds for the reviewer: a flag that asserts overstatement must cite really-retrieved evidence or is downgraded, validated in pure, tested code rather than trusted from the prompt.
* Good, because all control flow is pure and deterministic, so the whole review is unit-tested with plain inputs; only the thin orchestrator touches the network and database.
* Good, because it stays within one model path and one database, reuses `runStructured`/`wrapUntrusted`/`llm_runs` and the existing `decision_records`, and invents no new verified-records machinery.
* Good, because reviewed-status is derived from `record_reviews`, so the feature adds no column to `decision_records` and cannot collide with the claims projection or the parallel investigation work.
* Bad, because a hand-rolled FSM is more code to maintain than calling a framework, and every new state, event, or review dimension must be added to the union, the router, and the tests together.
* Bad, because the dimension set, the check budget, the breaker threshold, and the severity labels are judgement calls — too aggressive flags over-nag the user, too lax misses weak records — they are tunable but start conservative.
* Bad, because deriving reviewed-status from a separate table means any reader that wants "is this reviewed?" must join to `record_reviews` rather than reading one column on the record.

## More Information

Builds on [ADR-0009](0009-use-openrouter-and-the-vercel-ai-sdk-as-the-model-gateway.md) (gateway),
[ADR-0010](0010-use-pgvector-for-closed-rag-retrieval-over-reference-and-evidence.md) (retrieval),
and [ADR-0011](0011-classify-evidence-against-role-requirements-with-a-grounded-four-verdict-schema.md)
(grounded citation validation). Mirrors the FSM/HITL/caps pattern of
[ADR-0013](0013-model-the-reasoning-interview-as-an-explicit-fsm.md) and the persistence shape of
[ADR-0014](0014-persist-interview-sessions-and-turns-for-decision-records.md). Realises the R1
FSM/HITL/caps and the Week-6 half of R3 directions of the
[applicability matrix](../../.claude/rules/README.md), already ACTIVE, for a third agent loop.
Design notes: [`docs/design/reviewer-agent-check.md`](../design/reviewer-agent-check.md).
