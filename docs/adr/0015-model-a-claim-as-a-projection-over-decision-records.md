---
status: proposed
date: 2026-11-17
decision-makers: Amanda Wolf
---

# 0015. Model a claim as a projection over decision records, not a new table

## Context and Problem Statement

The Figma "Your evidence profile" prototype presents the profile page (`/dashboard`) as a
list of **claims**: statements about what the user did, each with a status
(*Evidence-linked* / *Your recollection* / *Self-reported metric*), a source count, a
facet (Leadership / Delivery / Stakeholders / Technical), version history, and a "used in"
list. The app has no `claims` concept today (the "Review claims" nav is wired to "Soon"),
so the live page diverges from the prototype. The user chose to build the claims feature
for real — under two constraints: **no fake/placeholder data**, and **no new AI pipeline**
([ADR-0005](0005-defer-ai-agent-features-to-later-weeks-for-the-week-3-releas.md) defers
auto-extraction).

The costly-to-change question is **what a claim is**, structurally. The existing
`decision_records` aggregate already carries almost everything a claim needs: `title`, the
CDM fields (`situation`/`cue`/`decision`/`why`/`outcome`), a `source` label
(`artifact | self_reported`), version history (`record_versions`), evidence/source linking
(`evidence_links`), and "used in" mapping (`record_requirement_links` for gap-check matches,
plus `interview_turns.decision_record_id` for interview origin). The only things missing for
the prototype are a **facet** and a way to tell a *self-reported metric* from a plain
*recollection*.

## Decision Drivers

* No fake data — every chip, count, source, and history row must come from real rows
* No new AI — claims are formed from existing data or set by the user, not extracted by an LLM (ADR-0005)
* One source of truth — avoid a second table that duplicates and can desync from `decision_records`
* Additive only — no change to existing tables/policies or live data
* Own-rows RLS on everything shown (ADR-0003, ADR-0007)
* Status should never disagree with the evidence — prefer computed over stored (cf. [ADR-0012](0012-present-gap-verdicts-in-three-buckets-computed-on-demand.md))
* SOLID / Humble Object: a thin RLS-scoped read; pure logic for derivation and mapping (CLAUDE.md §3)

## Considered Options

* Projection over `decision_records`: a claim is a decision record read through a `src/lib/claims/` module, with two added columns (`category`, `is_metric`) and status derived on read
* A new `claims` table: a parallel aggregate with its own title/text/status/sources, populated from decision records
* A database view: a SQL `view` that reshapes `decision_records` into claim rows
* Extend the status into a stored column on `decision_records`, updated whenever evidence changes

## Decision Outcome

Chosen option: "Projection over `decision_records`: a claim is a decision record read through a `src/lib/claims/` module, with two added columns (`category`, `is_metric`) and status derived on read", because the record already holds a claim's title, text, source, history, evidence, and usage, so a claim is best modelled as a view onto that aggregate rather than a second copy of it. Concretely:

1. **One decision record = one claim.** The `src/lib/claims/` module reads `decision_records`
   (RLS-scoped) and assembles a `Claim` with its source count (`evidence_links`), version
   history (`record_versions`), and "used in" (`record_requirement_links` + interview
   origin). The record stays the single source of truth; the claim is a read-model over it.
2. **Two additive columns** on `decision_records`: `category text` (CHECK ∈
   `leadership | delivery | stakeholders | technical`, or NULL) for the facet tabs, and
   `is_metric boolean not null default false` to mark a self-reported number. Both are
   user-set — real data, no inference.
3. **Status is derived, not stored.** `deriveStatus`: evidence present ⇒ `evidence_linked`;
   else `is_metric` ⇒ `self_reported_metric`; else `recollection`. Computing it on read means
   it can never disagree with the actual evidence links (mirrors ADR-0012).
4. **Additive migration, RLS inherited.** Adding columns touches no existing policy or row;
   `decision_records`' own-rows RLS already governs the new columns. Pushed via the
   `supabase-data` dry-run → apply flow against the linked project.
5. **Not a DB view** — the assembly (counts, history, usages, derived status) is clearer and
   unit-testable as pure TypeScript in the claims module than as SQL, and keeps logic in the
   app layer where the tests and types live.

### Consequences

* Good, because there is one source of truth: editing a decision record (or its evidence)
  updates the claim with no copy to keep in sync.
* Good, because status always matches the evidence — it is computed from the live links, not
  a column that can drift.
* Good, because the migration is purely additive (two nullable/defaulted columns): no live
  data changes and no new RLS pattern to review.
* Good, because derivation and mapping are pure functions, unit-tested to the 80% floor
  before any UI is wired (Humble Object, CLAUDE.md §3).
* Bad, because "claim" and "decision record" are now two names for one row; the UI copy and
  docs must be clear that they are the same thing to avoid confusion.
* Bad, because one record = one claim cannot yet express a record that contains several
  distinct claims; splitting is deferred (a future `claims` child table could hang off a
  record if that need appears).
* Neutral, because the facet and metric flag depend on the user filling them in: unfiled
  claims show under "All" with a neutral chip until categorised — honest, but it means the
  tabs are only as rich as the user's own labelling.

## More Information

Realises the profile design in `docs/design/claims-evidence-profile.md`. Reuses
`decision_records` and its `record_versions` / `evidence_links` / `record_requirement_links`
relations, the own-rows RLS pattern of
[ADR-0003](0003-use-supabase-for-the-database-with-row-level-security.md) /
[ADR-0007](0007-handle-user-career-data-with-a-privacy-by-default-policy.md), and the
computed-on-read stance of
[ADR-0012](0012-present-gap-verdicts-in-three-buckets-computed-on-demand.md). Honours
[ADR-0005](0005-defer-ai-agent-features-to-later-weeks-for-the-week-3-releas.md): no new AI
is introduced. Status `proposed` pending the user's "approved".
