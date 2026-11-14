# Security review: Evidence Search Pipeline v1 (closed-RAG retrieval)

Date: 2026-11-14
Mode: Task
Scope: The new retrieval layer — `src/lib/rag/` (types, embedding, config, context, chunk,
retrieve, evidence-index), the gateway embeddings module `src/lib/llm/embed.ts` and the
`embeddingModel` addition to `src/lib/llm/config.ts`, the `20261114130000_add_rag_chunks.sql`
migration (reference_chunks, evidence_chunks, the two `*_hybrid_search` functions), the
`scripts/index-reference-chunks.ts` backfill, `tools/rag/eval_retrieval.py`, `tests/rag/`,
and the `package.json` / `vitest.config.ts` edits.
Tools: npm audit (dependency scan), `tools/llm/check_llm_usage.py` (static key/boundary
checker, PASS), manual review against OWASP Top 10 (incl. LLM Applications 2025) focused on
input handling, data storage, and access control.

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
- Location: `node_modules/tinypool` (via `vitest`), `@typescript-eslint/*`, `test-exclude`
  (glob/minimatch) — all devDependencies, pre-existing, not introduced by this change.
- Risk: `npm audit` reports 2 critical + 12 moderate, but every one is in the test runner or
  linter. `npm audit --omit=dev` reports **0** — nothing ships to production or sits in the
  request path, and this feature adds no new runtime dependency (it reuses `ai`,
  `@openrouter/ai-sdk-provider`, `@supabase/supabase-js`, `zod`).
- How an attacker could use it: they would need to already control the build/test machine or
  the test inputs; there is no path from a public app user to this code.
- Analogy: a recalled part found in the factory's own test rig, not in any car that ships.
- Fix: bump the affected dev tools (a breaking `vitest` major) as a separate
  dependency-hygiene ticket; out of scope for this change.

## Notes on controls verified (no finding)
- **Access control / data storage (OWASP A01, A04):** `evidence_chunks` has own-rows RLS
  (select/insert/update/delete gated on `auth.uid() = user_id`), mirroring `file_text`, and
  cascade-deletes with the user, file, and decision record. `reference_chunks` is read-only to
  `authenticated` with **no** write policy (only the service-role backfill writes), mirroring
  `reference_items`. Both `*_hybrid_search` functions are **`security invoker`**, so they run
  under the caller's RLS — `evidence_hybrid_search` therefore returns only the caller's own
  rows, never another user's evidence.
- **SQL injection (A03):** no string-built SQL. The RPCs take typed parameters; `query_text`
  is parsed by `websearch_to_tsquery` (safe) and the embedding is passed as a JSON string cast
  to `vector`. App writes use the Supabase client's parameterised `.insert()` / `.upsert()` /
  `.eq()` / `.in()`. Stored content comes from trusted `reference_items` or the user's own data.
- **Privacy (LLM02 / ADR-0007):** user evidence text is embedded with the same privacy routing
  as chat — `data_collection: "deny"` + `zdr: true` (verified by the "embedding request carries
  privacy routing" boundary check); no user identity is sent; chunk/query text is withheld from
  production logs by `shouldLogText()` (verified by "production embedding log has no text").
- **Secrets (LLM02 / secrets):** `OPENROUTER_API_KEY` and `SUPABASE_SECRET_KEY` are read from
  `process.env` in server-only / ops-script code; `embed.ts` imports `server-only`; no key
  literal and no `NEXT_PUBLIC_*` secret (`check_llm_usage.py` PASS, 191 files). The backfill's
  service-role key never leaves the terminal/CI.
- **Unbounded consumption (LLM10):** embedding input is clipped to 2,000 chars in `embedQuery`
  and `embedBatch`; a blank query short-circuits to "not found" with no embedding spent;
  `match_count` is capped (`least(match_count, 30)`) and context is capped at
  `maxContextChars`. The OpenRouter per-key credit limit is the backstop.
- **Closed-RAG grounding:** `buildContext` returns a `NO_MATCHING_*` sentinel when nothing
  clears the keyword/similarity bar, so a consumer cannot be fed ungrounded context by default
  (verified by context unit tests and the retrieval boundary tests).

## Observations (outside this task - not changed)
- The full `npm audit` moderate findings are dev-tree only; production deps are clean (0).
- When a UI later renders evidence citations, the `title`/`content` fields are user-controlled
  and must be escaped at the display boundary (XSS) — a concern for the consuming UI
  (ui-accessibility), not this retrieval library.
- The embedding model id (`openai/text-embedding-3-small`) is an unverified default; confirm
  with `npm run llm:models` before production use. Not a security finding.
- The downstream consumer (Gap Classification) must wrap retrieved/evidence text with
  `wrapUntrusted()` before placing it in a prompt (prompt injection, LLM01); v1 builds no
  prompt, so there is no injection surface here yet. Documented in the design.
