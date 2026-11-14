# Test Plan — Evidence Search Pipeline v1

Size: **new tech** (design approved: [evidence-search-pipeline.md](../design/evidence-search-pipeline.md),
[ADR-0010](../adr/0010-use-pgvector-for-closed-rag-retrieval-over-reference-and-evidence.md)).
Testing strategy was part of the approved design; this records the critical paths and cases.

## Framework & external services

- **Framework:** Vitest (pure logic, repo default) + `tsx --conditions=react-server` for the
  server-only boundary (matches `tests/llm/`). No new framework.
- **External services:** never hit live OpenRouter or Supabase. Embeddings and DB calls are
  injected fakes (fake `fetch`, fake Supabase client, fake embed function). Rule 1: no
  production data, keys, or accounts in any test.

## Critical paths (100% coverage target)

1. **Closed retrieval / grounding** — `context.ts buildContext()`: a hit is kept only on a
   keyword match **or** similarity ≥ threshold; when nothing qualifies, the context is the
   `NO_MATCHING_*` sentinel (never the model's general knowledge). This is the safety
   boundary that keeps answers grounded.
2. **Citation integrity** — every kept hit is rendered `[source · id · section]` and the
   deduped `sources` list carries source + id, so downstream can cite or refuse.
3. **Chunking correctness** — `chunk.ts`: O*NET rows group by occupation into the right
   sections; framework rows become one chunk each; `content_hash` is stable for identical
   content and changes when content changes (drives idempotent re-indexing).
4. **Embedding boundary** — `embed.ts`: sends privacy routing (`data_collection: deny`,
   `zdr: true`), applies retry cap, rejects a wrong-dimension vector, writes one `llm_runs`
   row via the shared sink, never logs text in production.

## Cases

### `context.ts` (pure, Vitest)
- keeps a keyword-only hit (similarity null) ·
- keeps a vector hit at/above threshold; drops one below with no keyword ·
- all-below → `found:false` + sentinel (reference and evidence variants) ·
- caps context at `maxContextChars`, never splitting mid-block ·
- citation line format incl. omitting the `entity` pseudo-section ·
- dedups sources by source+id, preserves first title · empty hits → sentinel.

### `chunk.ts` (pure, Vitest)
- groups several O*NET rows of one SOC into overview/tasks/skills/knowledge/abilities/
  activities chunks, each prefixed with title + code ·
- two SOCs don't bleed into each other ·
- framework row → one `entity` chunk; pulls text from name/description/payload, drops
  slug/id/url noise · skips `content_model_element` and empty sections ·
- `content_hash`: identical content → same hash; changed content → different hash ·
- `chunkEvidenceText`: splits long text on boundaries into indexed chunks; short text → one
  chunk; empty/whitespace → none.

### `config.ts` / `types.ts` (pure, Vitest)
- config constants in sane ranges · Zod schemas accept a valid chunk and reject a
  wrong-dimension / missing-field one.

### `embed.ts` + `retrieve.ts` (boundary, tsx)
- `embed.ts`: privacy body, dim check throws on mismatch, `llm_runs` row written, prod logs
  no text, missing key → clear error ·
- `retrieve.ts`: `retrieveReference`/`retrieveEvidence` embed the query, call the right RPC,
  pass results through `buildContext`; RPC error surfaced; not-found → sentinel.

### Retrieval eval (`tools/rag/eval_retrieval.py`)
- hit rate @5 ≥ 80% and unanswerable questions return the sentinel; reports MRR and a
  suggested `minSimilarity` (run against a loaded DB, not in CI).

## Cards
Covered by the single board card **Evidence Search Pipeline v1** (build order 8); the build
breakdown is in the design's Kanban-cards section.
