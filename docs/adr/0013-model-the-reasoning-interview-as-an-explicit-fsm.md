---
status: proposed
date: 2026-11-16
decision-makers: Amanda Wolf
---

# 0013. Model the Reasoning Interview as an explicit TypeScript FSM with a human-in-the-loop save gate

## Context and Problem Statement

The **Reasoning Interview** (Figma screen "03 Reasoning interview") is the capture half of
the job-seeker "Reasoning Interview & Verified Records" epic. It walks a user through one
project at a time with grounded, one-at-a-time questions, plays back what it understood, and —
only after the user confirms — saves a verified **decision record** in the user's own words.
It consumes the model gateway
([ADR-0009](0009-use-openrouter-and-the-vercel-ai-sdk-as-the-model-gateway.md)) and retrieval
([ADR-0010](0010-use-pgvector-for-closed-rag-retrieval-over-reference-and-evidence.md)), and
writes into the existing `decision_records` model.

**This is the first agent / multi-step loop in the app.** Until now every AI feature has been
a single bounded call (chat, one classification per requirement), so the R1 (FSM/HITL/caps)
and the Week-6 half of R3 rows of the [applicability matrix](../../.claude/rules/README.md)
were DORMANT. A capture loop that asks, waits for an answer, paraphrases, and asks again —
turn after turn until a budget is reached — is exactly the shape those rules govern. The
moment it exists, they **ACTIVATE** (CLAUDE.md §4).

The hard questions are control-flow questions, costly to get wrong because they decide whether
the loop can run away or save something the user never approved:

1. **How is the loop controlled?** An ad-hoc `while` loop with branching spread across the
   orchestrator and React state has no single place to audit "can we save here?" or "have we
   asked too many questions?". Non-determinism (model output) mixed with control flow makes
   both untestable.
2. **Can a save ever happen without explicit approval?** R1 §3.4 (HITL isolation) requires
   that a side effect never share a step with the approval prompt. A paraphrase and a save in
   the same step would let the app write a record the user has not seen.
3. **Is this LangGraph?** The guardrail specs (R1) are written for Python/LangGraph. The
   CLAUDE.md anti-cargo-cult clause forbids importing that machinery to satisfy a spec; the
   *principle* must be translated into this one Next.js + TypeScript app.

## Decision Drivers

* Honor R1 FSM/HITL/caps and the Week-6 half of R3 by **principle**, in TypeScript — no LangGraph, no Pydantic, no second service
* A save must be structurally impossible without an explicit "Yes, save it" (R1 §3.4 HITL isolation)
* The loop must be bounded: a hard question budget and a circuit breaker on repeated model failure (R1 §3.5, R3 §1)
* Control flow must be pure and unit-testable to 100% — no IO inside the router (Humble Object, CLAUDE.md §3)
* One model path: reuse `runLLM`/`runStructured`, `wrapUntrusted`, `llm_runs` (no second gateway)
* Never invent content: the agent only asks and paraphrases from the user's words; provenance stays `self_reported`
* Additive only: do not change the gateway or retrieval beyond genuinely additive needs

## Considered Options

* Explicit TypeScript FSM: a discriminated-union state plus a pure `reduce(state, event)` router, with `saving` reachable only from `awaiting_confirmation` on `accept`, a question-budget guard, and a circuit breaker
* Import LangGraph (or a JavaScript port) and model the interview as a graph
* Ad-hoc control flow: a `while` loop in the orchestrator plus React component state, with no formal state machine
* An autonomous agent that paraphrases and saves records in one pass, with the user reviewing saved records afterward

## Decision Outcome

Chosen option: "Explicit TypeScript FSM: a discriminated-union state plus a pure `reduce(state, event)` router, with `saving` reachable only from `awaiting_confirmation` on `accept`, a question-budget guard, and a circuit breaker", because it makes the HITL invariant and the loop bounds structural and auditable in one pure module, translates the R1/R3 principles into this stack without importing distributed machinery, and keeps all control flow unit-testable to 100% while the non-deterministic calls stay behind the orchestrator boundary.

1. **Explicit state machine.** `InterviewState` is a typed discriminated union
   (`planning | asking | awaiting_answer | paraphrasing | awaiting_confirmation | saving |
   paused | complete`). `InterviewEvent` is a typed union. A pure
   `reduce(state, event) → state` router performs the transitions. **No side effects** run
   inside the router — the orchestrator performs retrieval, model calls, and DB writes, then
   feeds each result back as the next event.
2. **HITL isolation (R1 §3.4), structural.** `saving` is a distinct state reached **only**
   from `awaiting_confirmation` on `accept`. A paraphrase (`paraphrasing`) and a save
   (`saving`) can never occupy the same step. `edit` routes back to `awaiting_answer`;
   `reject` routes to the next question. This is proven by a unit test asserting no other
   transition reaches `saving`.
3. **Hard caps (R1 §3.5, R3 §1).** A pure guard `budget_reached` ends the loop when
   `asked_count ≥ question_budget` (default ~6, hard cap 10). A `llm_failed` event increments
   a failure counter; after N consecutive failures a **circuit breaker** degrades the loop to
   `paused` with a saved message rather than retrying forever. Every model call still carries
   the gateway's R3 caps (`maxOutputTokens`, `timeoutMs`, ≤2 correction turns, 2 transport
   retries) from ADR-0009 — unchanged.
4. **Grounding and honesty.** Questions are grounded: the orchestrator retrieves evidence for
   the angle and the question prompt cites a retrieved snippet, or asks an open CDM question
   when there is none. The paraphrase is a strict `extract` call mapping the answer to CDM
   draft fields **from the user's words only**; evidence and answer are `wrapUntrusted()`-
   wrapped (OWASP LLM01). The model has no side-effecting tools.
5. **Matrix flip.** The R1 (FSM/HSM, HITL, recursion/step caps) and R3 (Week-6 execution caps
   at the orchestration layer) "ACTIVATES Week 6" rows of the applicability matrix flip to
   **ACTIVE**, and CLAUDE.md §4 is updated in the same change, because the triggering feature
   now exists.

### Consequences

* Good, because a decision record can never be written without an explicit `accept` — the only edge into `saving` is from `awaiting_confirmation`, and a test enforces it.
* Good, because the loop is provably bounded: the budget guard and the circuit breaker are pure predicates covered to 100%.
* Good, because all control flow is pure and deterministic, so the whole interview is unit-tested with plain inputs; only the thin orchestrator touches the network.
* Good, because it stays within one model path and one database and reuses the existing `saveDecisionRecord`, inventing no new verified-records table.
* Good, because the R1/R3 principles are satisfied in TypeScript, keeping the distributed machinery (LangGraph, sagas, Kafka) dormant per the anti-cargo-cult clause.
* Bad, because a hand-rolled FSM is more code to maintain than calling a framework, and every new state or event must be added to the union, the router, and the tests together.
* Bad, because the budget and breaker constants are judgement calls; too low frustrates a user mid-story, too high spends tokens — they are tunable but start conservative.
* Bad, because flipping the matrix rows raises the bar for all later agent work: every future loop must now meet the same FSM/HITL/caps standard.

## More Information

Builds on [ADR-0009](0009-use-openrouter-and-the-vercel-ai-sdk-as-the-model-gateway.md)
(gateway) and [ADR-0010](0010-use-pgvector-for-closed-rag-retrieval-over-reference-and-evidence.md)
(retrieval); persists through [ADR-0014](0014-persist-interview-sessions-and-turns-for-decision-records.md).
Realises the R1 FSM/HITL/caps and the Week-6 half of R3 directions of the
[applicability matrix](../../.claude/rules/README.md), translated to this stack. Design notes:
`docs/design/reasoning-interview.md`.
