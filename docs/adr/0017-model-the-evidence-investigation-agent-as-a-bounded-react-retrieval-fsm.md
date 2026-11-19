---
status: proposed
date: 2026-11-18
decision-makers: Amanda Wolf
---

# 0017. Model the Evidence Investigation Agent as a bounded ReAct retrieval FSM with a human-in-the-loop save gate

## Context and Problem Statement

The **Evidence Investigation Agent** is the last feature of the job-seeker *Evidence vs.
Requirements Gap Check* epic. The one-shot Gap Classification
([ADR-0011](0011-classify-evidence-against-role-requirements-with-a-grounded-four-verdict-schema.md))
retrieves **once** per requirement and classifies it. When a user's evidence covers a
requirement but is phrased differently from it, that single query misses the match and the
requirement is reported as `gap` or `unknown` even though the evidence exists. We want an agent
that digs: it reformulates the search query, retrieves again, and decides whether the newly
retrieved evidence substantiates the requirement, iterating until it finds support or a budget
is spent.

**This is the second agent / multi-step loop in the app.** The first (the Reasoning Interview,
[ADR-0013](0013-model-the-reasoning-interview-as-an-explicit-fsm.md)) already flipped the R1
(FSM/HITL/caps) and the Week-6 half of R3 rows of the
[applicability matrix](../../.claude/rules/README.md) to **ACTIVE**. A search→reflect→reformulate
loop is squarely governed by those rules, so the hard questions are the same control-flow
questions, and getting them wrong is costly for the same reasons:

1. **How is the loop controlled?** A reformulation loop written as an ad-hoc `while` in the
   orchestrator has no single place to audit "have we searched too many times?" or "can we
   write here?", and it mixes non-deterministic model output with control flow.
2. **Can an assessment be overwritten without approval?** R1 §3.4 (HITL isolation) requires a
   side effect never share a step with the approval prompt. The agent proposes evidence; the
   user must be the one who decides it counts.
3. **Can the agent invent evidence?** The whole value of the Gap Check is that it is grounded
   (closed RAG). A reformulating agent must not be allowed to cite a snippet it did not retrieve.

## Decision Drivers

* Honor the already-ACTIVE R1 FSM/HITL/caps and Week-6 R3 rows by **principle**, in TypeScript — no LangGraph, no second service (anti-cargo-cult clause)
* Reuse the proven interview pattern (pure `reduce` router + thin orchestrator) so the second loop raises no new standard
* An assessment overwrite must be structurally impossible without an explicit "accept" (R1 §3.4)
* The loop must be bounded: a hard search budget and a circuit breaker on repeated model failure (R1 §3.5, R3 §1)
* Closed-RAG grounding is non-negotiable: every proposed citation is validated against really-retrieved snippets, reusing the Gap Check's validation (ADR-0010/0011)
* One model path and one database: reuse `runStructured`, `wrapUntrusted`, `llm_runs`, and the existing `requirement_gap_assessments` table — no new gateway, no new verified-evidence store
* Bounded cost: investigate one requirement at a time on user request, never a bulk auto-run over every requirement

## Considered Options

* **Bounded ReAct retrieval FSM**: a discriminated-union `InvestigationState` + a pure `reduce(state, event)` router, with `saving` reachable only from `awaiting_review` on `accept`, a search-budget guard (default 3, hard cap 5), and a circuit breaker — the thin orchestrator does retrieval, the reflect model call, and the gated upsert
* **Extend Gap Classification to loop internally**: fold reformulation into `classify.ts` as a loop, with no explicit state machine and no separate HITL step
* **Autonomous bulk investigation**: automatically re-investigate every non-`met` requirement and write updated assessments, with the user reviewing the changed assessments afterward
* **Import LangGraph (or a JS port)** and model the investigation as a graph

## Decision Outcome

Chosen option: **"Bounded ReAct retrieval FSM"**, because it reuses the interview's audited
control-flow pattern wholesale, makes the HITL gate and the loop bounds structural and
unit-testable in one pure module, keeps the agent grounded by reusing the Gap Check's citation
validation, and stays within one model path and one table — translating the R1/R3 principles
into this stack without importing distributed machinery.

1. **Explicit state machine.** `InvestigationState` is a typed discriminated union
   (`planning | searching | reflecting | awaiting_review | saving | exhausted | paused |
   complete`). `InvestigationEvent` is a typed union. A pure `reduce(state, event) → state`
   router performs the transitions. **No side effects** run inside the router — the orchestrator
   performs retrieval, the reflect call, and the upsert, then feeds each result back as the next
   event.
2. **HITL isolation (R1 §3.4), structural.** `saving` is reached **only** from `awaiting_review`
   on `accept`. The agent can surface candidate evidence, but cannot change an assessment row
   without an explicit accept; `edit` stays in review, `reject` leaves the assessment unchanged.
   A unit test asserts no other transition reaches `saving`.
3. **Hard caps (R1 §3.5, R3 §1).** A pure `budget_reached` guard stops the loop after
   `searchBudget` searches (default 3, clamped to a hard cap of 5). A `llm_failed` event
   increments a failure counter; after 3 consecutive failures a circuit breaker degrades the loop
   to `paused`. Every reflect call still carries the gateway's R3 caps (`maxOutputTokens`,
   `timeoutMs`, ≤2 correction turns) from ADR-0009 — unchanged.
4. **Closed-RAG grounding.** The reflect call returns structured output (`substantiated |
   insufficient`, a reformulated `nextQuery`, `verdict`, `rationale`, `citations[]`, `confidence`)
   validated by Zod; evidence and requirement are `wrapUntrusted()`-wrapped (OWASP LLM01). Every
   proposed citation is validated against the snippets actually retrieved, and a substantiated
   verdict left with no valid citation is downgraded to `gap` — the same contract as Gap
   Classification. The agent has no side-effecting tools; retrieval is the only external reach and
   stays behind the orchestrator.
5. **Reuse, not rebuild.** Persistence is the existing `requirement_gap_assessments` table with
   additive provenance columns (`method`, `confidence`, `search_count`); the save is an idempotent
   UPSERT on `(user_id, role_requirement_id, target_role_id)` (CLAUDE.md rule 7). No new table, no
   second model path, no change to the gateway or retrieval beyond genuinely additive needs.

### Consequences

* Good, because an assessment can never be overwritten without an explicit `accept` — the only edge into `saving` is from `awaiting_review`, enforced by a test.
* Good, because the loop is provably bounded: the search-budget guard and the circuit breaker are pure predicates covered to 100%.
* Good, because it reuses the interview's pattern and the Gap Check's citation validation, so the second agent adds no new architectural standard and little conceptual surface area.
* Good, because it stays grounded: the agent cannot cite evidence it did not retrieve, preserving the closed-RAG guarantee the Gap Check depends on.
* Good, because it reuses one model path, one table, and `llm_runs` logging — inventing no new store and keeping the distributed machinery dormant per the anti-cargo-cult clause.
* Bad, because a reformulation loop spends more model + embedding calls per requirement than the one-shot check; investigating one requirement at a time on user request (not a bulk run) keeps that cost visible and bounded.
* Bad, because the search budget and breaker constants are judgement calls — too low misses evidence a second reformulation would have found, too high spends tokens; they start conservative and are tunable.
* Bad, because a hand-rolled FSM is more code than a plain loop, and every new state or event must be added to the union, the router, and the tests together.

## More Information

Builds on [ADR-0009](0009-use-openrouter-and-the-vercel-ai-sdk-as-the-model-gateway.md)
(gateway), [ADR-0010](0010-use-pgvector-for-closed-rag-retrieval-over-reference-and-evidence.md)
(retrieval), and [ADR-0011](0011-classify-evidence-against-role-requirements-with-a-grounded-four-verdict-schema.md)
(grounded verdicts + citation validation); follows the agent pattern of
[ADR-0013](0013-model-the-reasoning-interview-as-an-explicit-fsm.md). Realises the already-ACTIVE
R1 FSM/HITL/caps and Week-6 R3 directions of the
[applicability matrix](../../.claude/rules/README.md), translated to this stack. Design notes:
`docs/design/evidence-investigation-agent.md`.
