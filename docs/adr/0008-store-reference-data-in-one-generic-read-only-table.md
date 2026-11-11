---
status: proposed
date: 2026-11-11
decision-makers: Amanda Wolf
---

# 0008. Store reference data in one generic read-only table

## Context and Problem Statement

E4 adds a reference-data layer so every future gap check has a defined target to compare a user's evidence against. The data comes from two external sources with very different shapes: the Tech Fleet Skills & Practices Framework (≈450 records across ~10 entity types, published as JSON, CC BY 4.0) and O\*NET (occupations plus rated skill/ability/knowledge/activity tables and tasks, distributed as JSON in release 31.0, under the O\*NET license). This is shared, read-only lookup data — the same for every user — not per-user state. We need to decide how to model it in Supabase, how to load it repeatably, and how to keep it read-only, without over-building for data no feature queries relationally yet (CLAUDE.md anti-cargo-cult clause).

## Decision Drivers

* Two sources with different and evolving schemas must coexist and be told apart
* The data is read-only reference material looked up by the app, not state the app mutates
* Loading must be repeatable and safe to re-run (network delivery and manual re-runs are at-least-once)
* Embeddings/retrieval are deferred to the RAG week (ADR-0005); the schema must not block adding them later
* Keep it right-sized: no premature per-entity normalization for data nothing queries relationally yet
* Must honor source licenses (attribution) and not commit the large, licensed O\*NET files

## Considered Options

* One generic `reference_items` table
* A faithful table-per-entity schema
* Static files bundled with the app, no table

## Decision Outcome

Chosen option: "One generic `reference_items` table", because it holds both sources uniformly, is trivial to load and extend, and defers relational modeling until a feature actually needs it.

1. **Schema.** A single `public.reference_items` table: `id`, `source` (`'techfleet-spf'` | `'onet'`), `entity_type`, `external_id`, `name`, `description`, `payload jsonb` (the full source record, preserving relations and O\*NET ratings), `source_version`, timestamps, with a unique constraint on `(source, entity_type, external_id)`.
2. **Read-only ownership (CLAUDE.md rule 6).** Row-Level Security is enabled with a single SELECT policy for authenticated users and no insert/update/delete policies, so the app can only read it. Writes happen solely through the import script using the Supabase secret (service-role) key, which bypasses RLS and is server-only (ADR-0007, ADR-0003).
3. **Repeatable, idempotent import.** A standalone script (`scripts/import-reference-data.ts`) reads the sources and upserts on the unique key, so re-running never duplicates rows. All parsing/mapping/validation lives in pure, unit-tested functions behind the SDK boundary (Humble Object; CLAUDE.md rules 3–4), with each mapped row validated by a Zod schema before insert.
4. **Sourcing.** The Skills & Practices Framework snapshot is vendored into the repo (small, openly licensed, pinned to a commit) for reproducible, offline imports and tests. O\*NET files are large and licensed, so they are provided locally by the developer in a git-ignored folder and never committed.

### Consequences

* Good, because both sources load through one schema and one code path, and new entity types need no migration
* Good, because the full source record is preserved in `payload`, so no data is lost before we know what we need
* Good, because idempotent upsert makes refreshes safe and the pure mappers are cheap to test
* Bad, because relationships between entities live in `payload` rather than foreign keys, so relational queries need a later join table
* Bad, because a generic table gives up column-level typing and constraints that a per-entity schema would provide
* Neutral, because embeddings are added later as a column or companion table when the RAG week lands

### Confirmation

Enforced three ways: (1) the migration review confirms `reference_items` has RLS enabled with a SELECT-only policy and the unique upsert key; (2) unit tests cover the pure mappers/parsers to the 80% coverage floor; (3) the rule below keeps the Supabase secret key out of browser-exposed (`NEXT_PUBLIC_`) configuration, checked in CI once this ADR is accepted.

```adr-rules
[
  {"id": "secret-key-never-public",
   "description": "The Supabase secret/service-role key must never be exposed via a NEXT_PUBLIC_ variable.",
   "files": ["**/*.ts", "**/*.tsx", "**/*.mjs", "**/*.js"],
   "forbid": "NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE_ROLE)",
   "allow_in": []}
]
```

## Pros and Cons of the Options

### One generic `reference_items` table

* Good, because it handles multiple sources uniformly and extends to new entity types with no schema change
* Good, because it is simple to load idempotently and keeps the full record for later use
* Bad, because cross-entity relationships are not enforced by the database and typing is weaker

### A faithful table-per-entity schema

* Good, because it gives strong typing, foreign keys, and natural relational queries
* Bad, because it is ~20 tables and migrations for data no feature queries relationally yet, and it must change whenever a source changes — premature normalization the anti-cargo-cult clause warns against

### Static files bundled with the app, no table

* Good, because there is nothing to migrate or load
* Bad, because it cannot be queried or joined server-side, scales poorly to O\*NET's size, and has no path to the RAG week's embeddings

## More Information

Related: [ADR-0003](0003-use-supabase-for-the-database-with-row-level-security.md) (RLS and per-user ownership), [ADR-0005](0005-defer-ai-agent-features-to-later-weeks-for-the-week-3-releas.md) (AI/embeddings deferred), and [ADR-0007](0007-handle-user-career-data-with-a-privacy-by-default-policy.md) (service-role key is server-only). Attribution for both sources is recorded in [`docs/reference-data-attributions.md`](../reference-data-attributions.md). Revisit when the RAG week adds embeddings (a column or companion chunk table) and if a feature needs relational queries across entities (introduce a join table then).
