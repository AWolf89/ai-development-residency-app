---
status: accepted
date: 2026-11-23
decision-makers: AWolf89
---

# 0023. Reconcile new uploads against existing evidence and store conflicts in a dedicated table

## Context and Problem Statement

File Analysis (ADR-0020) and Auto-propose (MVP 2 Phase 2, build order 5) read one upload at a time. Nothing compares a **new** document against the evidence the user already has, so a date, metric, or ownership claim in a new file can silently contradict an existing record — the proposal's §13 Test 7 (cross-document reconciliation) and gap P6 call this out. We need an ingest-time pass that flags contradictions (and surfaces complementary matches to link rather than duplicate) before the user commits records. The open question is **where a detected conflict is stored**.

## Decision Drivers

* A conflict is **two-sided** (source A says X, source B says Y) and must cite **both** sources — it is not a one-sided "something is unknown".
* Conflicts have their own lifecycle (pending → accepted / dismissed / resolved), distinct from an open/resolved to-do.
* The product roadmap includes an **evidence-health / conflicts view** and an Investigation Queue (Phase 3) that will want to list and filter unresolved contradictions by type.
* Own-rows RLS and the HITL rule (nothing persisted without the user acting) must hold, as everywhere else.
* Guardrails discourage pre-building infrastructure before a feature needs it (CLAUDE.md §2.1).

## Considered Options

* A dedicated `reconciliation_flags` table
* Reuse `missing_info_items`
* Reuse `record_review_flags`

## Decision Outcome

Chosen option: "A dedicated `reconciliation_flags` table", because a cross-document conflict is a first-class, two-sided, independently-managed object that the roadmap will surface on its own, and modelling it with structured columns (both cited sources, the disagreeing field, a disposition) makes that future view a clean query instead of parsing it back out of a free-text note. The user chose this over the lighter options after weighing the trade-off, accepting a new migration now to avoid remodelling later.

### Consequences

* Good, because a conflict stores both sides structurally — both citations, the conflict kind (date/metric/ownership) and the two values — so a future conflicts / evidence-health view and the Investigation Queue are a simple `SELECT`, and "metric conflicts" vs "date conflicts" are filterable.
* Good, because conflicts get their own `pending / accepted / dismissed` lifecycle, independent of whether a record was ever saved, reusing the proven `record_review_flags` shape.
* Bad, because it adds a new table, RLS policies, and persistence code to build and maintain for a consumer (the conflicts view) that does not exist yet — storage slightly ahead of its need.
* Bad, because the app now has **two** follow-up-ish stores (`missing_info_items` and `reconciliation_flags`); the Investigation Queue and any "what needs attention" surface must read both and keep the distinction clear (unknowns vs contradictions).

### Confirmation

The ingest reconciliation pass is an extension of the Auto-propose flow and inherits its HITL isolation (ADR-0013): conflicts are **proposed** by a pure pass and written to `reconciliation_flags` only on an explicit user decision, proven by a boundary test asserting zero flag writes until the user acts. Own-rows RLS is enforced by policy and exercised like the other stores. The migration is additive and reviewed via `supabase-data`.

## Pros and Cons of the Options

### A dedicated `reconciliation_flags` table

* Good, because it models a conflict as what it is: a two-sided, cited relationship between sources with its own disposition.
* Good, because it makes a future conflicts / evidence-health view and type-filtering trivial.
* Good, because it reuses an established pattern (`record_review_flags`: denormalised `user_id`, `citations` jsonb, `disposition`, `model_used`/`prompt_version`).
* Bad, because it is a new migration + RLS + persistence to maintain before its main consumer ships.

### Reuse `missing_info_items`

* Good, because no new table or migration; reuses a store already designed as the Investigation Queue backing + open-gap signal.
* Good, because it fits the anti-speculation guardrail — build storage when the consumer needs it.
* Bad, because `missing_info_items` is one-sided ("what is unknown"); a two-sided conflict with two citations has to be flattened into a free-text `description`, which is fragile to read back and can't be filtered by conflict type.
* Bad, because conflicts and plain to-dos would share one store, so later surfaces must disentangle them by convention.

### Reuse `record_review_flags`

* Good, because its shape (citations, disposition, model provenance) is almost exactly right.
* Bad, because it is bound to a saved record's review (`review_id` FK); a reconciliation conflict is detected at **ingest**, before any record exists, so it does not fit the foreign key or the reviewer's fixed dimension set.

## More Information

Implements gap P6 and §13 Test 7 from `docs/evidence-foundation-assessment.md` (§7 step 2). Builds on [ADR-0020](0020-analyze-uploaded-files-into-grounded-framework-tags-with-a-clarification-fsm.md) (File Analysis FSM), the Auto-propose flow (MVP 2 Phase 2), [ADR-0022](0022-split-the-evidence-record-from-the-claim-and-define-the-clai.md) (record/claim model + `missing_info_items`), and [ADR-0013](0013-model-the-reasoning-interview-as-an-explicit-fsm.md) (HITL isolation). Revisit if the Investigation Queue (Phase 3) ends up wanting a single unified "needs attention" store, which could merge `reconciliation_flags` and `missing_info_items`.
