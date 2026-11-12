# Test plan: Decision Records & Profile Save (non-AI slice)

Status: Draft
Size: Medium
Design: medium plan (in-chat, design-review approved 2026-11-11); no design doc file

## Project choices
- Framework: **Vitest** (`@vitest/coverage-v8`) — already the project's runner; tests are
  colocated as `src/**/*.test.ts`, run in the `node` environment, pure-logic only.
- External services: **Supabase is not touched by unit tests.** Pure logic (validation +
  mapper) has no network, so it needs no mock. For the optional integration tests, the
  Supabase client is a **hand-written fake** (an injected object with `insert`/`update`
  spies) — never a real project, key, or account (Rule 1). RLS itself is verified against
  the live policies with the `supabase-data` skill's `check_rls.py`, not in Vitest.

## Critical paths
Each must reach 100 percent coverage.
- `validateDecisionRecord` (src/lib/decision-records/validation.ts): the single gate that
  decides whether a record may be saved — directly enforces AC2 (source label) and AC6
  (missing required field → not saved). A hole here means bad or incomplete data persists.
- `mapFormToRow` (src/lib/decision-records/mappers.ts): turns validated input into the DB
  row; a mistake here writes wrong columns or drops the source label.

## Unit tests
- Accepts a fully-filled record (title, situation, cue, decision, why, outcome, source):
  proves AC1 — all six fields plus source are captured and returned.
- Accepts a core-only record (cue and why omitted): proves the optional fields are truly
  optional and a valid save still succeeds.
- Rejects a missing `title`: proves a required field blocks the save with a clear message.
- Rejects a missing `situation`: same, required field.
- Rejects a missing `decision`: BDD "missing required field" (decision) → not saved (AC6).
- Rejects a missing `outcome`: BDD "missing required field" (outcome) → not saved (AC6).
- Rejects a missing `source`: proves a record cannot be saved unlabelled.
- Accepts `source` = "artifact" and accepts `source` = "self_reported": proves AC2's two
  allowed labels pass.
- Rejects an out-of-range `source` (e.g. "other", ""): proves AC2 — only the two labels
  are allowed, no free-text source.
- Treats a whitespace-only required field as missing (after trim): proves spaces can't
  smuggle an "empty" required field past the gate.
- Mapper includes `cue`/`why` when present and sets them null when absent; always carries
  `source` and the required fields: proves the row written matches the validated input.

## Integration tests
- Save action with a fake Supabase client inserts the decision record, then inserts an
  `evidence_link` only when a `fileId` is supplied: proves AC4 (record linked to artifact)
  and that the two writes work together.
- Save action returns a validation error and performs **no** insert when required fields
  are missing: proves the confirm/save path honours AC6 end-to-end.
- Update path calls `update` (not `insert`) when an existing record id is supplied: proves
  the create+edit reuse writes to the right row.

## End-to-end tests
Not required (medium).

## Edge cases and errors
- Empty object / all fields missing → single first error, nothing saved.
- Whitespace-only values in required fields → treated as missing.
- Unknown / extra fields in input → ignored, do not reach the row.
- `source` present but wrong case or label → rejected.
- Optional `cue`/`why` present but blank → stored as null, not empty string.

## Kanban cards
- **DR-T1 Validation unit tests:** every branch of `validateDecisionRecord` (required set,
  source labels, trim/empty) — maps to backlog card DR 2.
- **DR-T2 Mapper unit tests:** `mapFormToRow` carries required + optional fields correctly
  — maps to backlog card DR 2.
- **DR-T3 Save-action integration tests (optional):** insert + evidence_link + update with
  a fake Supabase client — maps to backlog card DR 3.
