---
status: proposed
date: 2026-11-20
decision-makers: Amanda Wolf
---

# 0021. Anchor the CDM interview to a user-corrected project timeline, with a budget-neutral conclusion→redirect branch

## Context and Problem Statement

The **Decision-Point Interview (CDM-style)** card completes the job-seeker *Reasoning
Interview & Verified Records* epic. The interview loop already exists
([ADR-0013](0013-model-the-reasoning-interview-as-an-explicit-fsm.md),
[ADR-0014](0014-persist-interview-sessions-and-turns-for-decision-records.md)): a pure
`reduce(state, event)` FSM asks grounded CDM questions one at a time, plays back a paraphrase,
and — only on an explicit `accept` — saves a `decision_record`. What it does **not** yet do is
the backlog card's defining requirement: draft a **project timeline from the user's own files**,
let the user **correct** it, and ask about the decisions **at each point on that timeline**.
Two further behaviours are specified: when a user answers with a *conclusion* instead of what
happened, the agent must **guide them back**; and when files have **no usable dates**, the user
must be able to build the timeline **manually** rather than be blocked.

The interview FSM is the app's most safety-sensitive module — its HITL isolation and loop
bounds are proven by 100%-covered unit tests (R1 §3.4/§3.5, now ACTIVE in the
[applicability matrix](../../.claude/rules/README.md)). So the hard questions are:

1. **Where does timeline logic live** without destabilising the audited FSM or its proofs?
2. **How does "guide back from a conclusion" fit the FSM** without quietly consuming the
   question budget or opening a new unbounded path?
3. **How is the timeline stored** without a new store or a new model path?

## Decision Drivers

* Keep the audited FSM's HITL and budget/breaker proofs intact — add surface area deliberately, not by rewriting `machine.ts`.
* Honour the already-ACTIVE R1 (FSM/HITL/caps) and Week-6 R3 rows by **principle**, in TypeScript — no LangGraph, no second service (anti-cargo-cult clause).
* Reuse everything already built: the interview loop, orchestrator, `decision_records` save + evidence indexing, Projects/files, retrieval, and the gateway.
* Never invent facts: a drafted date or label is always the user's to correct; no file content is fabricated (closed-RAG honesty, carried from ADR-0010/0013).
* The "guide back" behaviour must be **budget-neutral** and bounded — it cannot become a way to loop forever.
* One database, additive migration only; the hosted push stays gated on the user's explicit yes.

## Considered Options

* Pre-interview timeline phase + one FSM branch — timeline drafting/correction are two new states *before* the question loop (`drafting_timeline`, `awaiting_timeline`); the only change inside the loop is a new `needs_redirect` event routing `paraphrasing → awaiting_answer` without incrementing `askedCount`. The corrected timeline is persisted as `jsonb` on the session and passed into question grounding.
* **Fold the timeline into the existing `planning`/`asking` states** — draft and correct the timeline inside the current loop with no new states, branching on flags in the orchestrator.
* **A separate second agent/FSM** for the timeline, handing off to the interview agent.
* **Build the timeline from file content** (parse dates out of extracted text) rather than from file metadata + filenames.

## Decision Outcome

Chosen option: "Pre-interview timeline phase + one FSM branch — timeline drafting/correction are two new states *before* the question loop (`drafting_timeline`, `awaiting_timeline`); the only change inside the loop is a new `needs_redirect` event routing `paraphrasing → awaiting_answer` without incrementing `askedCount`. The corrected timeline is persisted as `jsonb` on the session and passed into question grounding.", because it adds the timeline
capability as an additive phase that leaves the proven question-loop proofs untouched, makes the
one in-loop change (the redirect) small, bounded, and provably budget-neutral, and reuses the
interview's whole orchestrator/persistence/save pattern with one additive column and no new
model path.

1. **Timeline as a pre-loop phase.** Two new states, `drafting_timeline` (the orchestrator
   builds the timeline from the chosen project's files) and `awaiting_timeline` (the user
   corrects it), sit before `asking`. Timeline concerns never enter the budget/HITL states, so
   those proofs are unchanged. `draftTimeline` is a **pure** function over file rows
   (`created_at`, `file_name`) — ordering, filename version/date parsing, grouping revisions —
   unit-tested to 100%, including the **no-usable-dates → empty** case that drives the manual
   fallback.
2. **Budget-neutral conclusion→redirect.** The orchestrator runs a small structured
   classification of each answer (account-of-events vs conclusion). A conclusion emits a new
   `needs_redirect` event; the router returns `paraphrasing → awaiting_answer` with a redirect
   note and **does not change `askedCount`** — mirroring how `edit` re-asks without re-counting.
   A unit test asserts the budget is unchanged across a redirect, so "guide back" can never
   exhaust or extend the loop on its own.
3. **Honest, user-owned timeline.** Drafted dates come from `files.created_at` (the *upload*
   date) and filename hints; the UI states this and the **correction step is mandatory** before
   any question is asked. No date or label is invented. Questions are anchored to a timeline
   entry and ask what the user *noticed* and *expected*; with a retrieved snippet they cite it
   (`wrapUntrusted`, OWASP LLM01), without one they ask an open CDM question — never inventing
   file contents.
4. **Reuse, not rebuild.** Persistence adds one additive column `interview_sessions.timeline
   jsonb` (plus a nullable `project_id`); no new table, RLS unchanged. The save path, circuit
   breaker, 5–8 budget (started at 8), evidence indexing, retrieval, and gateway are reused
   as-is. One model path (`runLLM`/`runStructured`, `llm_runs`), one database.

### Consequences

* Good, because the question loop's HITL isolation and budget/breaker proofs stay exactly as audited — the timeline lives outside them and the one new edge is covered by a budget-neutrality test.
* Good, because "guide back from a conclusion" is a first-class, bounded FSM transition rather than ad-hoc orchestrator branching, so it is auditable and cannot loop unbounded.
* Good, because the user corrects the timeline before any question, so upload-date imprecision becomes a review step, not a wrong premise baked into questions.
* Good, because it reuses one table (plus one column), one model path, and the existing save/indexing — no new store, keeping distributed machinery dormant (anti-cargo-cult clause).
* Bad, because the answer classification is an extra model call per answer; it is a small `extract` with the gateway's R3 caps, and a classification failure falls back to proceeding (never blocks the user).
* Bad, because filename version/date parsing is heuristic and will mislabel some files; the mandatory correction step is the mitigation, and nothing is saved from the timeline itself — only from gated decision records.
* Bad, because two new states plus an event must be added to the union, the router, and the tests together — the standing cost of a hand-rolled FSM, accepted for the same reasons as ADR-0013.

## More Information

Extends [ADR-0013](0013-model-the-reasoning-interview-as-an-explicit-fsm.md) (the interview
FSM) and [ADR-0014](0014-persist-interview-sessions-and-turns-for-decision-records.md)
(session/turn persistence); builds on
[ADR-0009](0009-use-openrouter-and-the-vercel-ai-sdk-as-the-model-gateway.md) (gateway),
[ADR-0010](0010-use-pgvector-for-closed-rag-retrieval-over-reference-and-evidence.md)
(retrieval), and
[ADR-0019](0019-add-projects-as-a-cross-cutting-organising-entity-and-file-detail-hub.md)
(projects + files). Follows the agent pattern of ADR-0013/0016/0017, translating the ACTIVE
R1/R3 rows into this stack. Design notes: `docs/design/decision-point-interview.md`.
