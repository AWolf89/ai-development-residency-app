# Security review: AI foundation (OpenRouter model gateway)

Date: 2026-11-14
Mode: Task
Scope: The new AI foundation — `src/lib/llm/` (client, config, run, structured, untrusted,
log, supabase-sink), the `career-chat` prompt, `tests/llm/`, `tools/llm/` checkers, the
`llm_runs` migration, and the `.env.example` / `package.json` / `vitest.config.ts` edits.
Tools: npm audit (dependency scan), `tools/llm/check_llm_usage.py` (static key/boundary
checker), manual review against the OWASP Top 10 for LLM Applications 2025.

## Summary
| Severity | Open | Fixed | Accepted |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 2 | 0 | 0 |

No Critical or High findings — the release gate is not blocked by this change.

## Findings

### F1: Critical npm-audit advisory is in a dev-only build tool (vitest → tinypool)
- Severity: Low
- Status: Open
- Location: `node_modules/tinypool` via `vitest@3.2.7` (devDependency, pre-existing)
- Risk: The advisory is a prototype-pollution → RCE gadget in tinypool's worker options.
  It runs only inside the Vitest test runner on a developer/CI machine, never in the
  deployed app and never on user input. Production-dependency audit is clean
  (`npm audit --omit=dev` → 0), so CI's production-only dependency scan is unaffected.
- How an attacker could use it: they would need to already control the test inputs or the
  build environment; there is no path from a public app user to this code.
- Analogy: a recalled part found in the factory's own test rig, not in any car that ships.
- Fix: bump `vitest` to a fixed line (a breaking major) as a separate dependency-hygiene
  ticket; it is not introduced by, and not in scope of, this change.

### F2: The gateway does not cap input size (left to callers)
- Severity: Low
- Status: Open
- Location: `src/lib/llm/run.ts` (`runLLM` / `runStructured`)
- Risk: Output is bounded (`maxOutputTokens`, timeout, retry + correction caps), but the
  gateway itself does not limit how much text a caller passes in, so a feature that forwarded
  unbounded user text could inflate token cost (OWASP LLM10 Unbounded Consumption).
- How an attacker could use it: only via a future feature that forwards raw, unbounded user
  input to the gateway; there is no user-facing entry point in this foundation yet.
- Analogy: the output tap has a flow limiter; the inlet pipe's size is set by whoever
  connects it.
- Fix: no change here by design — input sizing belongs to each feature route (the design's
  safety table requires feature tickets to cap input, e.g. the chat route's character cap),
  and the OpenRouter per-key credit limit is the backstop. Documented for the Week-4 feature
  tickets rather than hard-coded in the gateway, so legitimate large RAG contexts are not
  truncated.

## Notes on controls verified (no finding)
- **Secrets (LLM02 / secrets):** `OPENROUTER_API_KEY` is read from `process.env` in
  server-only code; `client.ts` imports `server-only` (build fails if a client component
  imports it); `.env*` is gitignored with a `.env.example` placeholder; `check_llm_usage.py`
  found no key literal and no `NEXT_PUBLIC_*OPENROUTER` (169 files scanned).
- **Prompt injection (LLM01):** all untrusted text passes through `wrapUntrusted()` (which
  escapes closing tags); the system prompt marks tagged text as data; the gateway exposes no
  tools that mutate data. Verified by unit tests and the gateway test.
- **Privacy (LLM02):** every request sends `data_collection: "deny"` + `zdr: true`; prompt
  and reply text are withheld from production logs (`shouldLogText()`), verified by the
  "production log has no prompt/reply text" gateway check.
- **Improper output handling (LLM05):** structured output is validated by a Zod schema (no
  hand-rolled `JSON.parse` trusted blindly); model text is never built into SQL or HTML.
- **Injection / storage:** `llm_runs` writes use the Supabase client's parameterised
  `.insert()`; the table has RLS with per-user select/insert and no update/delete (append-only).

## Observations (outside this task - not changed)
- The full `npm audit` 12 moderate findings are also dev-tree only; production deps are clean.
- Model ids in `config.ts` are unverified defaults; confirm with `npm run llm:models` (needs
  the user's key) before production use. Not a security finding.
