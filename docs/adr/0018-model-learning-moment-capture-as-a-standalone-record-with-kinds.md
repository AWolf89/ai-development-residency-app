---
status: proposed
date: 2026-11-19
decision-makers: Amanda Wolf
---

# 0018. Model Learning Moment Capture as a standalone record with kinds, not an interview extension

## Context and Problem Statement

Epic 3 (Learning Agility Evidence) asks for a **Learning Moment Capture** feature so a
career changer can show how quickly and how well they learn — the trait a hiring manager
most doubts when someone has no direct industry history. The card's acceptance criteria
are: a prompt about a time the user got up to speed quickly (AC1); a record capturing
**what was learned, how long it took, and the result** (AC2); the record can be linked to
related artifacts (AC3); the prompt can be skipped with no empty record created (AC4); and
records are owner-only via Supabase RLS (AC5).

Two costly-to-change questions had to be settled before any code:

1. **Where does the capture live?** The app already has a **Reasoning Interview** agent
   loop ([ADR-0013](0013-model-the-reasoning-interview-as-an-explicit-fsm.md) /
   [ADR-0014](0014-persist-interview-sessions-and-turns-for-decision-records.md)): an
   LLM-driven FSM that asks grounded questions and **paraphrases** each answer into a fixed
   **CDM decision record** (`situation` / `cue` / `decision` / `why` / `outcome`). Should the
   learning-agility prompt extend that FSM, or be a lighter standalone capture?
2. **What is a learning moment, structurally?** AC2 lists three fields, but in design
   review the user widened the concept beyond "got up to speed quickly" to the family of
   moments that actually constitute *learning agility*: insight ("something clicked"), a
   course change on new information, and — most valuable for a career changer — transferring
   a skill from a past role into the new field.

## Decision Drivers

* Fit the record shape to the data: AC2's "how long it took" has no home in the CDM fields.
* Keep the safety-critical agent code (interview FSM: HITL gate, loop caps, circuit breaker)
  simple and provable — do not fork its paraphrase schema or save path for a second record type.
* Do not trigger runtime machinery we do not need: the moment an LLM call exists, R3 requires
  token caps, retries, structured-output validation, etc. Concrete user-entered fields need none.
* Reuse the existing **artifact / evidence** model for AC3 rather than inventing a parallel
  linking table (the app already has `files` + `evidence_links`).
* Own-rows RLS on everything shown (ADR-0003, ADR-0007); the AC4 skip must create nothing.
* SOLID / Humble Object / typed errors / TDD — the clean-architecture rules in force now
  (CLAUDE.md §3).
* Serve the career changer: the capture should evidence *learning agility* broadly, not only speed.

## Considered Options

* **Standalone `learning_moments` table + a lighter form capture**, with a `kind` dimension,
  reusing `files`/`evidence_links` for artifacts.
* **Extend the Reasoning Interview FSM**: add a learning-agility topic whose paraphrase emits
  a learning moment instead of a CDM record.
* **Model a learning moment as a `decision_record`** (as ADR-0015 did for claims), adding
  learning-specific columns (`duration`, `kind`) to that shared table.
* For artifacts: **a dedicated `learning_moment_files` link table** vs. **making the existing
  `evidence_links` polymorphic**.

## Decision Outcome

Chosen: **a standalone `learning_moments` table with a `kind` dimension, captured by a
lighter form (no LLM loop), reusing the existing `evidence_links`/`files` artifact model.**

1. **Standalone, not an interview extension.** The interview FSM is tightly coupled to the
   CDM paraphrase → `decision_records`. A learning moment's fields do not map onto CDM
   ("how long it took" has no CDM home), and the data is concrete enough to be typed
   directly — there is no judgement to interview out of it and no reason to spend an LLM call
   paraphrasing it. A plain form keeps the agent code untouched and triggers none of the R1/R3
   runtime rules (no model call exists). AC1's "prompt" is a per-kind headline prompt in the form.

2. **Four kinds (the generalized model).** A `kind` column (CHECK ∈
   `speed | insight | pivot | transfer`, mirroring how `source`/`category` are modelled on
   `decision_records`) plus narrative fields that work across kinds:
   - `context` — what the user was facing,
   - `shift` — what changed / what was learned (AC2's "what"; its form label adapts per kind),
   - `result` — the impact (AC2's "result"),
   - `duration` — AC2's "how long it took", **required for `speed`**, optional/absent for the
     other kinds (a duration is meaningless for an insight or a reframe).
   This satisfies AC2 exactly for the original Speed case while making the feature evidence
   learning agility broadly. The prompts: Speed ("a time you got up to speed quickly"),
   Insight ("a moment something clicked"), Pivot ("a time you changed course"), Transfer
   ("a skill from a past role you brought into this one").

3. **Not a `decision_record`.** Unlike a claim (ADR-0015), a learning moment's fields
   (`kind`, `duration`, the learning-specific narrative) do not already exist on
   `decision_records`; folding them in would add learning-only columns to a general table and
   stretch its CDM semantics. A dedicated table keeps each aggregate cohesive (SRP).

4. **Reuse `evidence_links` for AC3, made polymorphic.** Rather than a parallel link table,
   add a nullable `learning_moment_id` to the existing `evidence_links`, make
   `decision_record_id` nullable, and add a CHECK that **exactly one** parent is set
   (`num_nonnulls(decision_record_id, learning_moment_id) = 1`). The INSERT/UPDATE policies are
   extended to verify `learning_moment` ownership, the same defence-in-depth as the file-ownership
   harden ([20261112000019](../../supabase/migrations/20261112000019_harden_evidence_links_file_ownership.sql)).
   Learning moments attach the same `files` through the same hardened table.

5. **Clean architecture, RLS, skip gate.** Pure Zod validation is the single save gate: it
   rejects an empty record and enforces "duration required when kind = speed", returning a typed
   error and saving nothing (AC4). A Humble-Object Supabase repository sits behind a typed
   interface (DI) so the save logic is unit-tested with a fake; mutations throw typed domain
   errors. `learning_moments` gets own-rows select/insert/update/delete RLS (AC5); the Server
   Action resolves the user from `auth.getUser()` and never trusts a client-supplied `user_id`.

### Consequences

* Good: the safety-critical interview FSM is untouched; no LLM call means no R1/R3 runtime
  machinery and a smaller, simpler feature.
* Good: the record shape fits the data; `duration` is only required where it is meaningful.
* Good: AC3 reuses the proven, security-hardened `evidence_links`/`files` path instead of a new one.
* Good: validation, mapping, and save logic are pure functions, unit-tested to the 80% floor.
* Bad / cost: making `evidence_links` polymorphic touches a shared, already-hardened table — the
  one change with blast radius beyond new files. Mitigated by the exactly-one-parent CHECK, the
  ownership policy, and leaving existing `decision_record_id` reads unchanged.
* Neutral: the four kinds are a deliberate subset; the remaining learning-agility kinds
  (failure, feedback, unlearning, reframe) can be added later by widening the `kind` CHECK.

## More Information

Realises the Epic 3 Learning Agility card (build order 13). Reuses the `files` +
`evidence_links` artifact model and the own-rows RLS pattern of
[ADR-0003](0003-use-supabase-for-the-database-with-row-level-security.md) /
[ADR-0007](0007-handle-user-career-data-with-a-privacy-by-default-policy.md), and follows the
projection-vs-new-table reasoning of
[ADR-0015](0015-model-a-claim-as-a-projection-over-decision-records.md) (here the conclusion
differs: a learning moment's fields are *not* already on `decision_records`, so a dedicated
table is warranted). Honours
[ADR-0005](0005-defer-ai-agent-features-to-later-weeks-for-the-week-3-releas.md): no new AI is
introduced. Status `proposed` pending the user's "approved".
