---
status: proposed
date: 2026-11-16
decision-makers: Amanda Wolf
---

# 0014. Persist interview sessions and turns that feed decision records

## Context and Problem Statement

The Reasoning Interview ([ADR-0013](0013-model-the-reasoning-interview-as-an-explicit-fsm.md))
is a multi-turn capture loop that can be **paused and resumed**: a user may answer two
questions, step away, and come back to finish. The FSM is pure and holds no durable memory of
its own, so the loop's progress — which questions were asked, what the user answered, what the
agent understood, and which answers became decision records — must live somewhere.

R1 §1.4 (checkpointing / history markers) requires that an interruptible loop persist enough
state to resume at the exact point it left off. In the distributed spec that means a state
saver writing deltas after every node; translated to this one Next.js + Supabase app, it means
**rows**: the session and its turns *are* the checkpoint. The modelling question is what those
rows are, and how they relate to the existing `decision_records` model that already holds the
saved CDM fields (`situation`, `cue`, `decision`, `why`, `outcome`, `source`).

The costly-to-change questions:

1. **One table or two?** The interview is a session (one project/decision under discussion)
   made of turns (ask → answer → paraphrase → maybe save). Flattening both into one table
   would duplicate session fields on every turn and make "resume the latest turn of this
   session" awkward.
2. **Do we duplicate the decision record, or point at it?** A saved turn produces a
   `decision_records` row via the existing `saveDecisionRecord`. Re-storing those fields on the
   turn would create two sources of truth for the same record.
3. **How is ownership enforced?** Interview content is personal career data (ADR-0007). Every
   row must be scoped to its owner.

## Decision Drivers

* The session + its turns must be a resumable checkpoint (R1 §1.4, translated to rows)
* Reuse `decision_records` + `saveDecisionRecord` unchanged — a saved turn points at a record, it does not copy it
* Own-rows RLS on every new table, mirroring the existing policies (ADR-0003, ADR-0007)
* Additive only: no change to existing tables or policies
* Thin, RLS-scoped reads to rehydrate the FSM; no business logic in the query layer (CLAUDE.md §3)
* Honest provenance: interview answers are the user's recollection → saved as `source = self_reported`

## Considered Options

* Two additive tables — `interview_sessions` and `interview_turns`, with a saved turn carrying a nullable `decision_record_id` foreign key into the existing `decision_records`
* A single flat `interview_turns` table that repeats session columns on every row
* Store the whole interview transcript as one JSONB blob on a single session row
* Extend `decision_records` with interview columns and add no new tables

## Decision Outcome

Chosen option: "Two additive tables — `interview_sessions` and `interview_turns`, with a saved turn carrying a nullable `decision_record_id` foreign key into the existing `decision_records`", because the session/turn split matches the loop's own shape, makes "resume the latest turn" a simple ordered read, and keeps `decision_records` the single source of truth for a saved record while the turn only references it.

1. **`interview_sessions`** — `id`, `user_id`, `title` (the project/decision under discussion),
   `target_role_id` (nullable), `status` (`active | paused | complete`), `question_budget`,
   `asked_count`, `created_at`, `updated_at`. One row per interview; the row's `status` and
   `asked_count` are the resume markers.
2. **`interview_turns`** — `id`, `session_id`, `user_id`, `question_text`,
   `grounding_citation` (jsonb, the cited source or null), `answer_text` (null until answered),
   `paraphrase` (jsonb, the CDM draft or null), `status`
   (`asked | answered | skipped | saved`), `decision_record_id` (nullable, set on save),
   `created_at`. The turns in order are the interview history.
3. **Reuse, don't duplicate.** On "Yes, save it" the orchestrator calls the existing
   `saveDecisionRecord` with `source = self_reported`, then stamps the returned
   `decision_record_id` onto the turn. The CDM fields live only in `decision_records`; the turn
   points at them.
4. **Own-rows RLS.** Both tables carry `user_id` and the four own-rows policies (select /
   insert / update / delete, `auth.uid() = user_id`), mirroring
   `requirement_gap_assessments`. Reads go through a thin `queries.ts` under the caller's
   session, so RLS returns only the user's own sessions and turns.
5. **Additive migration.** A single additive migration adds both tables, their indexes, RLS,
   and the `set_updated_at` trigger on the session. No existing table or policy is touched.
   `supabase db push --dry-run` is run locally; the hosted push happens only on the owner's
   explicit yes.

### Consequences

* Good, because the session/turn shape mirrors the FSM, so rehydrating the machine is an ordered read of the latest turn rather than parsing a blob.
* Good, because `decision_records` stays the single source of truth for a saved record — the turn references it, so editing a record later never desyncs a copy.
* Good, because own-rows RLS on both tables keeps every interview private by default (ADR-0007), with no new policy pattern to review.
* Good, because the migration is additive and reuses the existing save path, so nothing already live changes behaviour.
* Bad, because two tables plus a foreign key into `decision_records` is more schema than a single blob, and a save touches three tables (turn, decision_records, evidence link) in sequence without a cross-table transaction — acceptable because a dangling turn simply shows as unsaved and can be retried idempotently.
* Bad, because `grounding_citation` and `paraphrase` are JSONB, so their shape is enforced by the app's Zod schemas rather than by the database; a schema change needs a code change, not a migration.
* Bad, because resuming depends on the turn rows being consistent with the FSM's expectations; a future change to the state union must keep the rehydration read in `queries.ts` in step.

## More Information

Persists the loop defined in
[ADR-0013](0013-model-the-reasoning-interview-as-an-explicit-fsm.md); reuses
`decision_records` and `saveDecisionRecord` (Decision Records & Profile Save) and the own-rows
RLS pattern of [ADR-0003](0003-use-supabase-for-the-database-with-row-level-security.md) /
[ADR-0007](0007-handle-user-career-data-with-a-privacy-by-default-policy.md). Design notes:
`docs/design/reasoning-interview.md`.
