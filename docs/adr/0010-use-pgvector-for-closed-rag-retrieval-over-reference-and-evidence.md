---
status: proposed
date: 2026-11-14
decision-makers: Amanda Wolf
---

# 0010. Use pgvector for closed-RAG retrieval over the reference corpus and user evidence

## Context and Problem Statement

Build order 8, **Evidence Search Pipeline v1**, is the retrieval half of the job-seeker Gap
Check and a dependency of Gap Classification (build order 10). The trusted reference corpus
(Tech Fleet Skills & Practices Framework + O*NET) is already in `reference_items`
([ADR-0008](0008-store-reference-data-in-one-generic-read-only-table.md)); the user's own
evidence is in `file_text` / `decision_records`. The existing deterministic matching in
`src/lib/target-roles/` is lexical (exact / trigram **name** match) and cannot retrieve by
**meaning** when the wording differs.

We need closed-RAG retrieval: chunk and embed both corpora into a vector store, search with
hybrid keyword + vector search, and return only **retrieved, cited** text (so a later step
is grounded or says "I don't know"). It must reuse the Week-4 gateway
([ADR-0009](0009-use-openrouter-and-the-vercel-ai-sdk-as-the-model-gateway.md)) and its
`llm_runs` logging — not add a second model path — and must not change the existing matching
or the shape of `reference_items`. This realises the **"R3 schema validation / closed RAG —
ACTIVATES Week 4"** direction of the [applicability matrix](../../.claude/rules/README.md)
for retrieval, translated to this one Next.js + Supabase app (CLAUDE.md anti-cargo-cult
clause: no separate vector service, no Python/LangGraph).

## Decision Drivers

* Retrieve by meaning **and** exact term, over structured reference data and free-text evidence
* Reference data is public-read; evidence is private — each needs the right RLS
* One model path: embeddings go through `src/lib/llm/`, logged in `llm_runs`, same privacy routing
* Pure, testable decision logic (chunker, ranker, citation) behind a thin model/DB boundary (CLAUDE.md §3)
* Additive only: do not touch `matchFramework`, O*NET name search, or `reference_items`' shape
* Cost-aware: ~316k raw O*NET rows must not be embedded 1:1
* Right-sized: no second datastore or service (would need its own ADR)

## Considered Options

* **pgvector in the existing Supabase Postgres**, two chunk tables, hybrid search in SQL
* A dedicated vector database (Pinecone / Qdrant / Weaviate) alongside Supabase
* Vector-only search in pgvector (no keyword/full-text leg)
* Lexical search only (extend the existing trigram/`matchFramework` matching)

## Decision Outcome

Chosen option: **"pgvector in the existing Supabase Postgres, two chunk tables, hybrid
search in SQL"**, because it keeps embeddings under the same database, RLS, and backups as
the rest of the app (no new service to run or secure), gives both a meaning search and an
exact-term search, and reuses the gateway for embeddings so cost and privacy stay in one
place.

1. **pgvector, additive tables.** Enable `vector`; add `reference_chunks` (shared,
   read-only) and `evidence_chunks` (per-user, own-rows RLS). `reference_items` and the
   existing matching modules are untouched.
2. **Chunk at a sensible grain (pure).** `rag/chunk.ts` groups O*NET rows by occupation into
   section chunks (overview/tasks/skills/knowledge/abilities/activities) and maps each
   techfleet-spf entity to one chunk, each prefixed with its title/code so it stands alone.
   A `content_hash` makes re-indexing skip unchanged chunks.
3. **Hybrid search + RRF in SQL.** `*_hybrid_search` RPCs (security invoker, so RLS applies)
   run Postgres full-text and pgvector cosine search and merge them with reciprocal rank
   fusion (Supabase's documented pattern), returning ranks + similarity.
4. **Closed answers (pure).** `rag/context.ts` keeps a hit only on a keyword match or
   similarity ≥ threshold; otherwise the context is a `NO_MATCHING_*` sentinel. Each line is
   formatted `[source · id · section]` so the consumer can cite and refuse.
5. **Embeddings through the gateway.** `src/lib/llm/embed.ts` wraps the AI SDK `embed()`
   endpoint, reusing `LLM_CONFIG` privacy routing and writing an `llm_runs` row per call.
   It is a sibling of `runLLM` in the same module, not a second model path.
6. **Typed, mockable interface.** Retrieval sits behind a `Retriever` interface; the DB and
   embedding calls are thin (Humble Object) and injected in tests (Dependency Inversion).
7. **Measure, don't guess.** `tools/rag/eval_retrieval.py` + a question set set the
   threshold by hit rate @5 / MRR; changes are reported before → after.

### Consequences

* Good, because embeddings inherit Supabase's RLS, backups, and single connection — private
  evidence and public reference data each get correct isolation with no new service
* Good, because hybrid search handles both exact acronyms and paraphrased meaning, and RRF
  needs no score-scale tuning
* Good, because the pure chunker/context/citation logic is cheap to unit-test to the 80%
  floor, and Gap Classification can reuse `retrieveReference` / `retrieveEvidence` unchanged
* Good, because grouping O*NET into occupation-section chunks cuts embedding volume ~50×
  versus raw rows, and `content_hash` keeps re-indexing cheap
* Bad, because user evidence text is sent to an embedding provider (mitigated by
  `data_collection: "deny"` + `zdr: true`, no text logged in production, no identity sent)
* Bad, because it adds an embedding model id to confirm and keep current (absorbed by
  `llm:models` and a dimension check that fails loudly on a model/size mismatch)
* Neutral, because pgvector at this corpus size needs only an HNSW index; a dedicated vector
  DB would be premature and is deferred to a future ADR if scale demands it

### Confirmation

Enforced four ways: (1) the migration review confirms pgvector is enabled, `evidence_chunks`
has own-rows RLS, and `reference_chunks` has read-only-to-authenticated with no write policy;
(2) unit tests cover the pure chunker, context builder, and citation format to the 80% floor,
and boundary tests cover `embed.ts`/`retrieve.ts` against a fake OpenRouter and a fake
Supabase; (3) `eval_retrieval.py` reports hit rate @5 ≥ 80% and that unanswerable questions
return the not-found sentinel; (4) the CI rules below keep embeddings on the gateway path and
the service-role key out of any `NEXT_PUBLIC_` variable.

```adr-rules
[
  {"id": "embeddings-only-through-gateway",
   "description": "Embeddings are called only through the gateway module (src/lib/llm). Feature code must not import the AI SDK embed() directly.",
   "files": ["src/**/*.ts", "src/**/*.tsx"],
   "forbid": "from \"ai\"",
   "allow_in": ["src/lib/llm/"]},
  {"id": "service-role-key-never-public",
   "description": "The Supabase service-role / secret key must never be exposed via a NEXT_PUBLIC_ variable.",
   "files": ["**/*.ts", "**/*.tsx", "**/*.mjs", "**/*.js"],
   "forbid": "NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE",
   "allow_in": []}
]
```

## Pros and Cons of the Options

### pgvector in Supabase, two chunk tables, hybrid search in SQL

* Good, because embeddings live under the same database, RLS, and backups — no new service
* Good, because keyword + vector in one RPC covers exact terms and meaning
* Bad, because large-scale vector workloads would eventually outgrow a general-purpose
  Postgres (not a concern at this corpus size)

### A dedicated vector database alongside Supabase

* Good, because it is purpose-built for very large vector search and advanced filtering
* Bad, because it is a second datastore to run, secure, and keep in sync, with its own RLS
  story for private evidence — the cargo-cult the CLAUDE.md clause forbids; needs its own ADR

### Vector-only search in pgvector

* Good, because it is the simplest single-leg search to implement
* Bad, because it misses exact acronyms and rare terms ("RLS", a specific O*NET code) that a
  keyword leg catches, lowering recall on the queries Gap Check actually asks

### Lexical search only (extend existing trigram matching)

* Good, because it reuses machinery already in the repo and needs no embeddings
* Bad, because it cannot retrieve by meaning when wording differs — the exact gap this
  feature exists to close

## More Information

Realises retrieval for the Gap Check epic and the closed-RAG direction of the
[applicability matrix](../../.claude/rules/README.md). Builds on
[ADR-0009](0009-use-openrouter-and-the-vercel-ai-sdk-as-the-model-gateway.md) (gateway +
`llm_runs`), [ADR-0008](0008-store-reference-data-in-one-generic-read-only-table.md)
(reference data), [ADR-0003](0003-use-supabase-for-the-database-with-row-level-security.md)
(RLS ownership), and [ADR-0007](0007-handle-user-career-data-with-a-privacy-by-default-policy.md)
(privacy by default). Design:
[`docs/design/evidence-search-pipeline.md`](../design/evidence-search-pipeline.md). Revisit
if corpus scale outgrows pgvector (a dedicated vector DB — new ADR) or when Gap Classification
(build order 10) consumes this retrieval layer.
