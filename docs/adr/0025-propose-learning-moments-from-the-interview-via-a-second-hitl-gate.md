---
status: accepted
date: 2026-11-23
decision-makers: Amanda Wolf
---

# 0025. Propose learning moments from the interview via a second HITL gate

## Context and Problem Statement

Learning moments (ADR-0018) are manual-entry only. The Reasoning / Decision-Point
Interview ([ADR-0013](0013-model-the-reasoning-interview-as-an-explicit-fsm.md) /
[ADR-0021](0021-anchor-the-cdm-interview-to-a-user-corrected-project-timeline.md)) already
surfaces how an approach changed, but it does nothing with that signal. MVP 2 card 10
(plan §6.4) asks the interview to **notice** a learning moment (a shift in approach, a
realisation) and **propose** a learning-moment record the user confirms — without ever
saving on its own, and without breaking manual entry.

The interview is the app's first agent: a pure `reduce(state, event)` FSM whose
load-bearing safety property is HITL isolation — the `saving` state is reachable **only**
from `awaiting_confirmation` on `accept` (ADR-0013, R1 §3.4). Any new save (a learning
moment) must obey the same rule. The question is **where** the proposal logic lives and
**how** a learning moment ties back to its origin, given that `learning_moments` today has
no interview linkage and `evidence_links` is polymorphic over files only.

## Decision Drivers

* Preserve HITL isolation: a learning moment is saved only on an explicit second accept
* Keep the existing decision-record gate and manual learning-moment entry unchanged
* Never invent a learning moment when no signal is present (AC4)
* Keep all save-safety logic in one audited machine, not spread across parallel modules
* Own-rows RLS for every proposal and save (AC5)
* Stay additive: no rewrite of the proven interview flow, no speculative infrastructure

## Considered Options

* Extend the interview FSM with a second isolated gate reached after a record is saved
* Build a separate parallel proposal module alongside the interview, like the file-analysis auto-propose module
* Detect and propose learning moments only in a batch step at the end of the interview
* Auto-save detected learning moments without a human confirmation step

## Decision Outcome

Chosen option: "Extend the interview FSM with a second isolated gate reached after a record is saved", because the card asks the proposal to route through the interview's existing confirm flow, and keeping both gates inside the one audited FSM means the HITL isolation proof covers the learning-moment save too — rather than re-proving it in a second machine.

1. **Detection (orchestrator, best-effort).** When an answer is paraphrased, the
   orchestrator also runs a learning-moment detector (a new structured prompt) over the
   same answer. It returns a draft or `null` (no signal ⇒ no proposal, AC4). A detector
   failure yields `null` — it never fails the interview or trips the breaker, because the
   decision record is the primary artifact.
2. **FSM gate (pure).** The detected draft rides on `awaiting_confirmation` / `saving`.
   After the record is saved (`saving → saved`), if a draft is present the machine enters
   a new `awaiting_learning_moment` state; `accept` is the **only** edge into the new
   `saving_learning_moment` state, and `reject` dismisses it. The learning-moment save can
   never share a step with its approval — the ADR-0013 invariant, applied a second time.
   The gate consumes no question budget.
3. **Linkage (AC2).** A proposed moment links to its **project** (`project_id`, from the
   session) and its **interview** via a new nullable `interview_session_id` column on
   `learning_moments`; its originating turn is stamped with the saved moment's id for
   idempotency and rehydration. Evidence is the interview turn's own provenance; a
   file-level `evidence_links` row is added only when the originating record cites a file.
4. **Manual entry untouched.** The `/dashboard/learning-moments` form and
   `saveLearningMoment` are unchanged; the interview injects `saveLearningMoment` as a
   dependency (same DI seam as the decision-record save) and passes the interview linkage.
5. **Gate re-run.** This changes the interview agent, so the Phase 0 eval gate is
   re-run: the pure FSM edges, the orchestrator "nothing saved until accept" invariant for
   learning moments, and a model-level detector case (proposes on a shift answer, proposes
   nothing on a plain one).

### Consequences

* Good, because HITL isolation is preserved and proven by the same machine and tests that already guard the decision-record save.
* Good, because the decision-record gate and manual learning-moment entry are untouched; the change is purely additive (two FSM states, a prompt, three nullable columns).
* Good, because a learning moment now carries real provenance — project + interview — so accepted moments are traceable (AC2).
* Good, because detection is best-effort and schema-validated, so a bad or empty signal proposes nothing rather than inventing a record (AC4).
* Bad, because the interview FSM grows two states and the rehydration logic gains a branch, so the one proven machine is now larger and must be re-audited.
* Bad, because the second gate adds a step after a saved record, lengthening the per-turn flow when a learning moment is present; mitigated by only showing it when a signal was detected.
* Bad, because tying a moment to its interview needs a schema change (`interview_session_id` + two `interview_turns` columns); accepted as the minimal additive cost of real provenance.

## More Information

Extends [ADR-0013](0013-model-the-reasoning-interview-as-an-explicit-fsm.md) (the interview
FSM and its HITL gate) and builds on [ADR-0018](0018-model-learning-moment-capture-as-a-standalone-record-with-kinds.md)
(learning moments) and [ADR-0019](0019-add-projects-as-a-cross-cutting-organising-entity-and-file-detail-hub.md)
(project linkage). Realises plan §6.4. The second agent loop stays dormant — this is one
FSM with two isolated gates, not a second machine.
