---
status: proposed
date: 2026-11-22
decision-makers: Amanda Wolf
---

# 0022. Split the evidence record from the claim and define the claim lifecycle

## Context and Problem Statement

Today the app **fuses the evidence record and the claim into one row**: one
`decision_records` aggregate is simultaneously a CDM decision record, the evidence record,
and the claim, surfaced on `/dashboard` through the `src/lib/claims/` projection
([ADR-0015](0015-model-a-claim-as-a-projection-over-decision-records.md)). Files attach to
records through the polymorphic `evidence_links` table. The MVP-2 evidence-foundation
assessment names this the single most important conceptual decision to resolve
(`docs/evidence-foundation-assessment.md` §0, §4 "C1", §5.1): the proposed vision wants a
clean **source → evidence record → claim** separation with fan-out that the fused row
cannot express — one source supporting many evidence records, one evidence record
supporting many claims, and one claim drawing on several evidence records. ADR-0015
deliberately deferred this and named the escape hatch ("a future `claims` child table could
hang off a record").

This is the keystone Phase-0 decision; Phase-1's migrations depend on it. Two linked
questions must be answered as a conscious decision, not by accident: **(1)** do we split
*claim* from *evidence record*, and in what data shape; and **(2)** what is the claim's
**lifecycle** — its states and transitions — given this repo's "computed over stored"
stance ([ADR-0012](0012-present-gap-verdicts-in-three-buckets-computed-on-demand.md),
[ADR-0015](0015-model-a-claim-as-a-projection-over-decision-records.md)). This ADR decides;
it writes **no schema and no app code** (CLAUDE.md §5).

## Decision Drivers

* **Express the fan-out** the proposal requires (§4.4): source → many evidence records;
  evidence record → many claims; claim → many evidence records.
* **The live `/dashboard` must keep working unchanged** throughout the migration — today's
  one-claim-per-record behaviour and copy stay correct on day one.
* **Additive only, no live-data rewrite, own-rows RLS preserved** — the same discipline as
  ADR-0015/0019 (ADR-0003/0007 own-rows policy on every new table).
* **No fake/placeholder data** (ADR-0005, ADR-0015): every claim and link is backfilled
  from real existing rows, never invented.
* **Anti-cargo-cult** (CLAUDE.md §2.1): no speculative distributed-systems machinery
  (no sagas, outbox, CDC, event sourcing) to satisfy a spec — a join table and a pure
  reducer, in this stack.
* **Status must never disagree with the evidence** (ADR-0012/0015): keep the
  evidence-derived portion of the lifecycle computed on read; store only the human
  decisions that cannot be re-derived.
* **HITL on every side effect** (R1 §3.4, already enforced in every agent FSM): a claim's
  irreversible transitions (confirm, archive) happen only on an explicit `accept`.
* **SOLID / Humble Object** (CLAUDE.md §3): lifecycle logic is a pure, unit-tested reducer
  behind the RLS-scoped read; the persistence boundary stays thin.

## Considered Options

* **Option A — keep the fusion, enrich the record.** One `decision_records` row stays
  "evidence record = claim"; add the missing structured provenance fields to it. No new
  tables.
* Option B — introduce `claims` + `claim_evidence` child tables, phased in behind today's one-claim-per-record behaviour
* **Option C — big-bang cutover.** Add the tables and immediately make `claims` the
  primary aggregate, rewriting the projection, routes, and dashboard in one migration.

## Decision Outcome

Chosen option: "Option B — introduce `claims` + `claim_evidence` child tables, phased in behind today's one-claim-per-record behaviour", because it is the only option that
unlocks the required fan-out (Option A structurally cannot) while keeping the live profile
working from day one and staying additive (Option C risks the live surface in a single
step). Concretely, this ADR decides the following; the migrations themselves are Phase-1
work, not written here.

### 1. The cardinality: source → evidence record → claim

* **Source** = `files` (a document, unchanged).
* **Evidence record** = `decision_records` (the CDM narrative, unchanged) — it keeps owning
  its sources through the existing polymorphic `evidence_links`. One source can already
  back many evidence records.
* **Claim** = a new `claims` aggregate: a statement about what the user did/achieved.
* **`claim_evidence`** = a many-to-many join between `claims` and `decision_records`. This
  gives **one evidence record → many claims** and **one claim → many evidence records**.
  The full chain is therefore `files → evidence_links → decision_records → claim_evidence →
  claims`.
* The claim-level facets `category` and `is_metric` (added to `decision_records` by
  ADR-0015) are conceptually claim properties. They are **not moved in Phase 1**: during the
  1:1 backfill the claim reads them from its single backing record, preserving behaviour.
  Relocating them to `claims` is a later, separate migration, noted but not decided here.

### 2. The migration rolls out behind current behaviour

* **Additive tables only.** `claims` and `claim_evidence` are new; `decision_records`,
  `evidence_links`, and their RLS are untouched. Each new table carries its own `user_id`
  and own-rows RLS (ADR-0003/0007).
* **Backfill one claim per existing decision record**, with exactly one `claim_evidence` row
  linking them — real rows only, no invented data (ADR-0005/0015).
* **The `src/lib/claims/` projection is re-pointed at `claims`** (reading sources through
  `claim_evidence → evidence_links → files`). Because the backfill is strictly 1:1, the
  `/dashboard` output is identical on cutover.
* **Fan-out is enabled only after** the 1:1 world is proven live: only then may a claim span
  several evidence records, or one record feed several claims.

### 3. The claim lifecycle: computed strength, stored human decisions

The existing derived "evidence status" (`evidence_linked` / `recollection` /
`self_reported_metric`, ADR-0015) is **evidence *strength*** and stays computed on read —
it is orthogonal to, and kept alongside, the lifecycle. The **lifecycle** is a `status`
column on `claims` with a `CHECK` constraint over six states, advanced by a pure
`src/lib/claims/lifecycle.ts` reducer:

| State | Meaning |
|---|---|
| `draft` | Created, not yet substantiated or confirmed. Initial state. |
| `needs_investigation` | An open evidence gap: no linked source, or a gap verdict `unknown`/`gap`, or a missing-info item. Actionable. |
| `supported` | Has ≥1 evidence record with a validated source and no open challenge. |
| `user_confirmed` | The user has explicitly affirmed the claim via an HITL `accept`. |
| `challenged` | An open reviewer flag (ADR-0016) or an ingest-time contradiction stands against it. |
| `archived` | Retired by the user; excluded from the active profile. |

**Transitions** (computed unless marked *stored*):

* → `draft` on claim creation.
* `draft` ↔ `needs_investigation` ↔ `supported`: driven by live evidence links, gap
  verdicts (ADR-0011/0012), and open missing-info items — **computed**, so lifecycle can
  never disagree with the evidence (ADR-0012/0015).
* any active state → `challenged`: when a reviewer flag or cross-document contradiction is
  open — **computed** from open flags (ADR-0016). `challenged` clears back to the underlying
  computed state when every flag is resolved.
* `supported`/`needs_investigation` → `user_confirmed`: only on an explicit user `accept`
  — **stored** (HITL, R1 §3.4). It cannot be reached in the same step as the prompt that
  proposes it, mirroring the "`saving` reachable only from `awaiting_confirmation`" gate.
* any state → `archived`, and `archived` → `draft` (restore): only on an explicit user
  action — **stored**.

Only the two irreducible human decisions (`user_confirmed`, `archived`) are stored; every
evidence-derived state is recomputed on read. The reducer takes
`(storedHumanState, computedEvidenceSignals)` → lifecycle status, with a new `challenged`
signal always able to surface even over a `user_confirmed` claim. This keeps the stance of
ADR-0012/0015 (compute what can drift; store only deliberate acts) and the Humble-Object
discipline (pure reducer, unit-tested to the 80% floor, behind a thin read).

### 4. Reconcile the Phase-1 backlog to this decision (note, do not implement)

The assessment's Phase-1 plan (§7) carries two backlog cards that this ADR now governs: the
"harden the shared foundation" migration card (which must add `claims` + `claim_evidence`
and the 1:1 backfill as decided in §1–§2, not merely enrich the record) and the
"claim lifecycle CHECK + pure reducer" card (which must implement the six-state,
compute-vs-store split in §3). **They should be reconciled to this ADR's shape before Phase 1
is built.** This ADR records the decision only; it writes no migration or app code.

### Consequences

* Good, because the source → evidence → claim fan-out the proposal requires becomes
  expressible without touching the evidence record (ADR-0015 is extended, not reversed).
* Good, because the 1:1 backfill keeps `/dashboard` byte-for-byte identical at cutover — no
  user-visible change, no fake data, no big-bang risk.
* Good, because every new table is additive with its own own-rows RLS; no existing policy or
  live row changes, matching the ADR-0015/0019 pattern.
* Good, because the lifecycle stores only the two human decisions and computes the rest, so
  status can never silently disagree with the evidence (ADR-0012/0015), and the reducer is a
  pure, testable Humble Object.
* Good, because no distributed-systems machinery is introduced — a join table and a pure
  reducer in TypeScript/Supabase honour the anti-cargo-cult clause (CLAUDE.md §2.1).
* Bad, because a claim is now a second aggregate joined to the evidence record: reads for the
  profile gain a join (`claim_evidence`), and the projection and its tests must be rewritten
  even though the Phase-1 output is unchanged.
* Bad, because two facet columns (`category`, `is_metric`) temporarily live on the evidence
  record while conceptually belonging to the claim; a later migration to relocate them is
  owed (noted in §1), and until then the model carries a known seam.
* Bad, because introducing a stored lifecycle `status` adds a human-decision field that the
  reducer must always reconcile against computed signals; getting that precedence wrong
  (e.g. letting `user_confirmed` mask a real `challenged`) would be a correctness bug the
  unit tests must pin.
* Neutral, because fan-out is decided but deliberately dormant until the 1:1 world is proven
  live; multi-evidence claims deliver value only once Phase-2 ingestion proposes them.

## More Information

Decides `docs/evidence-foundation-assessment.md` §5.1 (keystone) and §5.3 (lifecycle), and
resolves conflicts C1 and C4 in that assessment. Extends — does not supersede —
[ADR-0015](0015-model-a-claim-as-a-projection-over-decision-records.md) (the claims
projection and its `category`/`is_metric` columns are reused and re-pointed, not removed) and
keeps the computed-on-read stance of
[ADR-0012](0012-present-gap-verdicts-in-three-buckets-computed-on-demand.md). Builds on the
own-rows RLS of [ADR-0003](0003-use-supabase-for-the-database-with-row-level-security.md) /
[ADR-0007](0007-handle-user-career-data-with-a-privacy-by-default-policy.md), the additive-
migration pattern of [ADR-0019](0019-add-projects-as-a-cross-cutting-organising-entity-and-file-detail-hub.md),
and the HITL-gate and FSM patterns of
[ADR-0013](0013-model-the-reasoning-interview-as-an-explicit-fsm.md) /
[ADR-0016](0016-model-the-reviewer-agent-check-as-a-grounded-fsm-quality-gate.md). Honours
[ADR-0005](0005-defer-ai-agent-features-to-later-weeks-for-the-week-3-releas.md): no new AI
path is introduced by this decision. Status `proposed` pending the user's "approved".
Revisit when Phase-1 migrations are authored, or if the fan-out proves unneeded (in which
case Option A's enrichment would be the fallback).
