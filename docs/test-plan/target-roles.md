# Test plan: Target Role & Job Description Intake (non-AI slice)

Status: Draft
Size: Medium
Design: medium plan (in-chat, design-review approved 2026-11-11); no design doc file

## Project choices
- Framework: **Vitest** (`@vitest/coverage-v8`) — the project's runner; tests colocated as
  `src/**/*.test.ts`, node environment, pure-logic only.
- External services: **Supabase is not touched by unit tests.** Pure logic (validation,
  extractor, matcher, source resolver, mapper) has no network. The framework matcher is
  tested against **canned in-memory reference items**, never the live table. The save
  integration tests use a **hand-written fake repository** (an injected interface with
  spies) — never a real project, key, or account (Rule 1). RLS (AC11) is checked against
  live policies with `check_rls.py`, not in Vitest.

## Critical paths
Each must reach 100 percent coverage.
- `extractRequirements` (src/lib/target-roles/extract.ts): the heuristic that turns a pasted
  JD into the requirement list. It is the most logic-heavy piece and shapes everything the
  user reviews; every branch (section detection, split, filter, boilerplate, normalize) is
  covered with canned JD samples.
- `resolveSource` (src/lib/target-roles/source.ts): decides each requirement's saved label
  via the framework → O*NET → job_description chain (AC6/AC7/AC8). A wrong branch mislabels
  provenance.
- `validateTargetRoleIntake` (src/lib/target-roles/validation.ts): the save gate — enforces
  AC9 (title required, JD long enough) so no empty/garbage target role is saved.

## Unit tests
- validation: accepts a valid intake (title + sufficient JD); rejects a missing/blank title;
  rejects empty or too-short JD (AC9); trims whitespace.
- extractor — bulleted "Requirements" section: returns one clean requirement per bullet.
- extractor — numbered list (`1.`, `1)`): splits on numbering, strips the marker.
- extractor — semicolon-separated line: splits into separate requirements.
- extractor — prose-only JD with no recognizable section: falls back to whole text and still
  returns candidate lines.
- extractor — boilerplate ("equal opportunity employer", benefits, company blurb): dropped.
- extractor — requirement-signal filter keeps "experience with…", "ability to…"; drops
  non-signal chatter when a section is absent.
- extractor — normalize + de-duplicate: trims, collapses whitespace, removes exact dupes.
- extractor — empty / whitespace-only input: returns an empty list (no crash).
- matcher — a requirement whose text matches a framework item name maps to it (AC5).
- matcher — a requirement matching no framework item returns no framework match.
- source resolver — framework match → source "framework"; else O*NET match → "onet"; else
  → "job_description" (AC6/AC7/AC8), including the exact precedence order.
- mapper — maps a validated intake + resolved requirements to the target_role row and
  role_requirement rows (user_id, requirement_text, source, reference_item_id/null).

## Integration tests
- Save action (fake repo) inserts the target_role and one role_requirement per requirement
  with the resolved source, and returns success: the parts work together (AC4).
- Save action performs no writes and returns the error when the intake is invalid (AC9).
- Update path updates the existing target_role and replaces its requirements rather than
  duplicating them (idempotent edit).

## End-to-end tests
Not required (medium).

## Edge cases and errors
- Empty / too-short JD → validation error, nothing saved (AC9).
- JD with a section header but no list items → no false requirements.
- Duplicate requirement lines → collapsed to one.
- A requirement that matches neither framework nor O*NET → kept, labelled "job_description".
- Unknown/extra form fields → ignored, never reach a row.

## Kanban cards
- **TR-T1 Extractor unit tests:** every branch of `extractRequirements` with canned JD
  samples (critical path, 100%) — maps to backlog card TR 2.
- **TR-T2 Validation, matcher, source-resolver, mapper unit tests:** core logic incl. the
  AC9 gate and the AC6/7/8 precedence — maps to backlog card TR 2.
- **TR-T3 Save-action integration tests:** insert, no-save-on-invalid, idempotent update
  with a fake repository — maps to backlog card TR 3.
