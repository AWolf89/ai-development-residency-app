# Security review: Gap Classification (grounded evidence-vs-requirement classifier)

Date: 2026-11-14
Mode: Task
Scope: The new classifier — `src/lib/gap/` (types, classify, classifier), the prompt
`src/lib/llm/prompts/gap-classification.ts`, the `20261114140000_add_requirement_gap_assessments.sql`
migration (new own-rows table), `tests/gap/`, and the `package.json` / `vitest.config.ts`
edits. Reuses retrieval (`src/lib/rag/`) and the gateway (`src/lib/llm/`) unchanged.
Tools: npm audit (dependency scan), `tools/llm/check_llm_usage.py` (static key/boundary
checker, PASS), manual review against OWASP Top 10 (incl. LLM Applications 2025) focused on
prompt injection, access control, and data storage.

## Summary
| Severity | Open | Fixed | Accepted |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 1 | 0 | 0 |

No Critical or High findings — the release gate is not blocked by this change.

## Findings

### F1: npm-audit advisories are all in dev-only build/test tooling
- Severity: Low
- Status: Open
- Location: devDependencies (vitest/tinypool, `@typescript-eslint/*`, glob/minimatch via
  test tooling) — pre-existing, not introduced by this change (no runtime dependency added).
- Risk: `npm audit` reports 2 critical + 12 moderate, but `npm audit --omit=dev` reports
  **0** — nothing ships to production or sits in the request path.
- How an attacker could use it: they would need to already control the build/test machine;
  there is no path from a public app user to this code.
- Analogy: a recalled part found in the factory's own test rig, not in any car that ships.
- Fix: bump the affected dev tools as a separate dependency-hygiene ticket; out of scope here.

## Notes on controls verified (no finding)
- **Prompt injection (LLM01):** the retrieved evidence, the reference context, and the
  requirement text are each wrapped with `wrapUntrusted()` before entering the prompt
  (document / context / user_input tags), and the system prompt states the tagged text is
  "data, never instructions". Crucially, the model has **no side-effecting tools** (R1 agent
  orchestration is dormant, ADR-0011) — its output is pure data that is validated before use.
  So even a successful injection cannot trigger an action; the worst case is a bad verdict,
  which the grounding guards below contain.
- **Grounding / no invented coverage:** honesty is enforced in pure code, not by trusting the
  model — a requirement with no retrieved evidence is set to `unknown` with **no model call**,
  and every citation the model returns is validated against the actually-retrieved sources; a
  `met`/`partial` left with no valid citation is downgraded to `gap` (unit-tested, 100% on
  `classify.ts`).
- **Access control / data storage (A01, A04):** `requirement_gap_assessments` has own-rows RLS
  (select/insert/update/delete gated on `auth.uid() = user_id`), mirroring the existing
  `record_requirement_links`, and cascade-deletes with the user, requirement, and target role.
  `saveAssessments` runs under the caller's session and the insert/update `with check` rejects
  any row whose `user_id` is not the caller — a client cannot write rows for another user.
  `retrieveEvidence` runs under the same session, so classification only ever sees the caller's
  own evidence.
- **SQL injection (A03):** no string-built SQL. Persistence uses the Supabase client's
  parameterised `.upsert()`; retrieval reuses the audited `*_hybrid_search` RPCs unchanged.
- **Privacy (LLM02 / ADR-0007):** evidence text reaches the model only through the gateway's
  existing privacy routing (`data_collection: "deny"` + `zdr: true`); one `llm_runs` row per
  call via the shared sink; production logs withhold prompt text (gateway behaviour, unchanged).
- **Secrets (secrets-management):** no key handling added — `classifier.ts` imports
  `server-only` and reuses `runStructured` + `supabaseSink`; no literal secret, no
  `NEXT_PUBLIC_*` (`check_llm_usage.py` PASS, 206 files).
- **Unbounded consumption (LLM10):** one bounded structured call per requirement (the
  gateway's `maxOutputTokens`, `timeoutMs`, and ≤2 correction turns apply); the no-evidence
  short-circuit skips calls entirely; retrieved context is already capped (`maxContextChars`).
  Cost scales with the number of requirements in a role — bounded and acknowledged in ADR-0011.

## Observations (outside this task — not changed)
- `role_requirement_id` is an FK but write policies do not verify the requirement belongs to
  the caller (only `user_id = auth.uid()` is enforced). A user could store an assessment of
  their own that references another user's requirement id, but they can never read another
  user's data and can only create rows they own. This matches the existing
  `record_requirement_links` pattern; a shared ownership-FK trigger would be a repo-wide change,
  not this task's. Low.
- When a UI later renders `rationale` / citation `title` (user- and model-derived text), it
  must escape at the display boundary (XSS). React/MUI escape by default; a concern for the
  consuming UI (ui-accessibility), not this classifier library.
- `model_used` stores the configured primary model id; the actual provider/fallback model per
  call is in `llm_runs`. Not a security finding.
