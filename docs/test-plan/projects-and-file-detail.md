# Test plan: Projects & File Detail Hub

Status: Draft
Size: Medium
Design: docs/design/projects-and-file-detail.md (ADR-0019)

## Project choices
- Framework: **Vitest** (`@vitest/coverage-v8`) — the project's runner; tests colocated as
  `src/**/*.test.ts`, node environment, pure-logic only (`npm test`). No new tooling.
- External services: **Supabase is not touched by unit tests.** The pure logic (project
  validation, project mapper, file-caption validation, file mapper) has no network. The action
  integration tests use a **hand-written fake repository** (an injected interface with spies) —
  never a real project, key, or account (Rule 1). The **cross-table ownership guard** and the
  `on delete set null` detach behaviour are **database-layer** guarantees (RLS policies +
  foreign keys) verified against live policies, **not** in Vitest — mirroring how `target-roles`
  left RLS to `check_rls.py`.

## Critical paths
Each must reach 100 percent coverage.
- `validateProjectInput` (src/lib/projects/validation.ts): the **save gate**. Enforces a required,
  length-bounded `name`, the optional-field caps, the `status` enum, and the `ended_on ≥
  started_on` date rule, so no empty or malformed project is ever written. Every branch covered
  with canned inputs.
- Cross-table ownership guard (migration RLS `with check … exists(project owned by caller)` on
  `files` / `decision_records` / `learning_moments`): a user must not be able to assign a row to
  another user's project. **Critical, but database-enforced** — covered by a live-policy check,
  not a Vitest unit (noted here so it is not forgotten, not because Vitest can reach it).

## Unit tests
- validation — accepts a minimal valid project (name only): returns `ok` with `status` defaulting
  to `active` and every optional field normalised to `null`.
- validation — rejects a missing / blank / whitespace-only `name`.
- validation — rejects `name` over 120 chars; accepts exactly 120 (boundary).
- validation — rejects `role` > 120, `organisation` > 160, `summary` > 2000 (each boundary: max
  accepted, max+1 rejected).
- validation — rejects a `status` outside `active | archived`; accepts both valid values.
- validation — dates: accepts both-null; accepts start-only; accepts end-only; accepts
  `ended_on ≥ started_on` (incl. equal); **rejects `ended_on < started_on`**.
- validation — trims surrounding whitespace on all text fields; an empty optional string becomes
  `null`, not `""`.
- validation — ignores unknown / extra fields; rejects a non-object / null input.
- project mapper — maps a `ProjectRow` to `ProjectView` (id, name, role, organisation, summary,
  status pass through).
- project mapper — date-range label: both dates → "start – end"; start-only → "since start";
  end-only → "until end"; neither → "" (no crash).
- project mapper — link-count label: formats counts as "N files · N records · N moments",
  including the all-zero case.
- file-caption validation (src/lib/files/validation.ts) — accepts a caption ≤ 280 and trims it;
  an empty/whitespace caption normalises to `null`; rejects > 280 (boundary max / max+1).
- file mapper (src/lib/files/mappers.ts) — extended `FileView` carries `caption` and `projectId`
  through, including the null cases (file with no caption / no project).

## Integration tests
- `createProject` (fake repo) — inserts one `projects` row with the validated, normalised values
  (user_id, name, role/org/summary/null, status, dates) and returns success.
- `createProject` — performs **no write** and returns the error when the input is invalid (e.g.
  blank name, reversed dates).
- `updateProject` — updates the existing row with normalised values; no write on invalid input.
- `getProjectWithLinks` — assembles the project plus its three link groups (files, decision
  records, learning moments) from canned repo rows into one view.
- `setFileProject` — sets `files.project_id`; `setFileCaption` — writes a validated caption and
  **performs no write** when the caption is too long.
- attach / detach decision record — inserts / removes an `evidence_links` row for a file; the
  ownership constraint itself is RLS (DB-layer), so the test asserts the repo call shape, not the
  policy.

## End-to-end tests
Not required (medium).

## Edge cases and errors
- Blank or whitespace-only `name` → validation error, nothing saved.
- Over-long fields at each boundary (name 121, role 121, organisation 161, summary 2001, caption
  281) → rejected; the exact max → accepted.
- `ended_on` before `started_on` → rejected; equal dates → accepted.
- Empty optional strings and absent dates → stored as `null`, never `""`.
- Unknown / extra form fields → ignored, never reach a row.
- Deleting a project → linked files / records / moments are **detached** (`project_id` → null),
  not deleted (DB foreign-key behaviour; asserted at the migration/DB layer, not Vitest).
- Assigning a row to a project the caller does not own → rejected by RLS (DB layer).

## Kanban cards
- **PR-T1 Projects validation unit tests:** every branch of `validateProjectInput` with canned
  inputs — critical path, 100% — maps to backlog card *Projects core (validation + mappers)*.
- **PR-T2 Projects + files mapper unit tests:** project mapper (field passthrough, date-range,
  link-count) and the extended file mapper (caption / projectId) — maps to *Projects core* and
  *File detail hub*.
- **PR-T3 Projects action integration tests:** `createProject` / `updateProject` /
  `getProjectWithLinks` with a fake repository (insert, no-save-on-invalid, aggregation) — maps
  to *Projects data access + actions*.
- **PR-T4 File-hub action + caption tests:** `setFileCaption` validation gate, `setFileProject`,
  and attach/detach-record repo shape with a fake repository — maps to *File detail hub*.
