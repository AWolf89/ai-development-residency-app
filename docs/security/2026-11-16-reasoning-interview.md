# Security review: Reasoning Interview (screen 03)

Date: 2026-11-16
Mode: Task
Scope: The Reasoning Interview feature (ADR-0013/0014) — the pure FSM
(`src/lib/interview/machine.ts`, `types.ts`), the `server-only` orchestrator
(`orchestrator.ts`) and its reads (`queries.ts`), the two prompts
(`interview-question.ts`, `interview-paraphrase.ts`), the additive migration
`20261116120000_add_interview_sessions_and_turns.sql`, and the
`/dashboard/interview` page + Server Actions.
Tools: npm audit (prod + dev), manual review (OWASP Top 10, LLM01, RLS, authz).

## Summary

| Severity | Open | Fixed | Accepted |
| -------- | ---- | ----- | -------- |
| Critical | 0    | 0     | 0        |
| High     | 0    | 0     | 0        |
| Medium   | 0    | 0     | 0        |
| Low      | 1    | 1     | 0        |

No Critical or High findings: the release is not blocked.

## Findings

### F1: Dev-only dependency vulnerabilities (vitest / tinypool / @vitest/mocker)

- Severity: Low
- Status: Open
- Location: devDependencies (`vitest`, `@vitest/coverage-v8` → `tinypool`,
  `@vitest/mocker`); not introduced by this task.
- Risk: `npm audit` reports 13 advisories (11 moderate, 2 critical) in the test
  runner's transitive packages. `npm audit --omit=dev` reports **0** — nothing ships
  to users. The critical `tinypool` prototype-pollution-to-RCE needs attacker-
  controlled worker options, which only exist on a developer's machine running the
  test suite, never in the deployed app.
- How an attacker could use it: they could not reach it through the running app; it
  would require already executing code in the local/CI test environment.
- Analogy: a recall notice on a tool in the workshop, not on any part of the product
  that leaves the building.
- Fix: upgrade to `vitest@5` (a breaking change) in a dedicated tooling PR; tracked
  repo-wide, not in scope for this feature. Prod surface is clean today.

### F2: Concurrent double-accept could write a duplicate decision record

- Severity: Low
- Status: Fixed (idempotency guard added; narrow truly-concurrent race accepted)
- Location: `src/lib/interview/orchestrator.ts` (`acceptDraft` → `advance` saving
  branch).
- Risk: The FSM already blocks re-accepting a turn sequentially — once a turn is
  saved, the next `load()` rehydrates past it, so a second `accept` is an ignored
  event. The only gap is two *truly concurrent* accepts (two tabs, or a fast double
  click past the pending-disabled button) that both read `awaiting_confirmation`
  before either persists; both would call `saveDecisionRecord` and create two
  records for one answer.
- How an attacker could use it: this is self-inflicted on the user's own account
  (RLS keeps it to their own rows), so it is a data-tidiness bug, not a cross-tenant
  or privilege issue — a user could end up with duplicate records of their own.
- Analogy: pressing a lift call button twice and two lifts arriving — wasteful, not
  dangerous.
- Fix (done): the `saving` branch now re-reads the turn and skips the save when
  `decision_record_id` is already set, adopting the existing record — matching the
  matrix's "idempotency when a route mutates state" row. This removes the duplicate
  for a repeat/late accept, a double click, and a retry after a partial failure whose
  first save had completed.
- Residual (accepted): two *truly simultaneous* accepts that both read the turn
  before either stamps it, and the narrow window where `saveDecisionRecord` commits
  but the follow-up `updateTurn` fails, can still duplicate. Fully closing this needs
  a DB-level key (e.g. a unique `origin_turn_id` on `decision_records`); deferred as a
  nuisance on the user's own rows, not corruption, and out of scope for this feature.

## Observations (outside this task - not changed)

Verified properties (no change needed):

- **LLM01 prompt injection.** Both prompts wrap untrusted text with `wrapUntrusted`:
  retrieved evidence in `<document>`, the user's answer in `<user_input>`, the topic
  and prior questions in `<context>`; each system prompt states "data, never
  instructions". The model has **no side-effecting tools** — it only returns text
  (a question) or a Zod-validated draft, and nothing is written until the human
  clicks "Yes, save it".
- **HITL save gate.** `saving` is reachable only from `awaiting_confirmation` on
  `accept` (FSM invariant, proven by a unit test and the orchestrator boundary test:
  a record is written only after accept, never during paraphrase).
- **RLS own-rows.** `interview_sessions` and `interview_turns` carry `user_id` and
  the four own-rows policies (mirroring `requirement_gap_assessments`); `user_id` is
  denormalised onto turns so the policy needs no join. All reads go through
  RLS-scoped `queries.ts` under the caller's client. Hardened in this review: the
  turn INSERT/UPDATE `with check` now also requires the referenced `session_id` to
  belong to the caller, so a turn can never be attached to or moved under another
  user's session even though own-rows alone would allow a matching `user_id`.
- **IDOR.** The Server Actions take a client-supplied `session_id`, but
  `getSession` is RLS-scoped — a session the caller does not own returns null and
  the orchestrator throws "interview session not found", so no cross-user read or
  write is possible.
- **Server-only key boundary.** `orchestrator.ts` imports `server-only`; the client
  components import only the `"use server"` actions and theme tokens, never
  `lib/llm` or the orchestrator. `llm:check` passes (no browser component imports
  server LLM code; no key in client or `NEXT_PUBLIC_`).
- **Auth.** Every Server Action re-resolves the user and redirects to `/login` when
  absent (defence in depth, not trusting the rendering page).

Minor hardening to consider later (not a finding): neither the answer nor the project
title has a maximum length, so a very long answer inflates the user's own token cost
on their own account. The gateway already caps model *output* (`maxOutputTokens`);
an input length cap would bound input cost too.

## Not browser-verified

Signed-in flows could not be exercised in-browser in this environment (no local
Supabase; hosted test sign-ins are rejected), the same limit noted by the sibling
Gap Check build. Verification was `next build` + 354 unit tests + 31 orchestrator
boundary checks + eslint/prettier/llm:check/ADR checks.
