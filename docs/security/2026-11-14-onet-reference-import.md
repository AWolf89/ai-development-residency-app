# Security review: O*NET full import + RAG backfill

Date: 2026-11-14
Mode: Task
Scope: The reference-data load and RAG backfill changes — `scripts/index-reference-chunks.ts`
(keyset pagination + retrying upsert), `src/lib/rag/config.ts` (`minSimilarity` tune),
`tests/rag/retrieval_questions.json`, and the generated `docs/rag/retrieval-report.md`. The
O*NET `reference_items` load itself is an ops run (no code change) using the existing importer.
Tools: npm audit (prod), manual review.

## Summary
| Severity | Open | Fixed | Accepted |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 0 | 0 | 0 |

## Findings

None.

Areas reviewed and why each is clear:

- **Injection.** All database access goes through the Supabase client's parameterized
  builders (`.eq`, `.gt`, `.order`, `.range`); the keyset cursor is a UUID read back from the
  database, never user-supplied, and `payload->>onetsoc_code` is a fixed select expression. No
  string-built SQL. No runtime user input is introduced by these changes.
- **Secrets.** The backfill and eval use the service-role (secret) key read from the
  environment only, never hard-coded, never logged, never exposed through a `NEXT_PUBLIC_`
  variable. The script header documents its server-only/CI use. `npm audit --omit=dev`:
  0 vulnerabilities; dependencies unchanged (no `package.json`/lock diff).
- **Access control / RLS.** Unchanged. `reference_chunks` stays read-only to authenticated
  users with service-role writes (ADR-0010 migration). Raising `minSimilarity` from 0.30 to
  0.41 is security-positive: it makes the closed-RAG layer abstain on off-topic queries that
  previously could clear the lower bar, reducing the chance of surfacing irrelevant context.
- **Resource exhaustion / DoS.** Pagination advances by a strictly-increasing primary-key
  cursor and stops on an empty page (no unbounded loop); writes are bounded (50-row batches)
  and the retry wrapper is capped at 5 attempts with linear backoff.
- **Sensitive data exposure.** No PII. O*NET is public reference data; the regenerated report
  contains only developer-authored question text and aggregate metrics.

## Observations (outside this task - not changed)
- `tsc` reports a missing `LayoutProps` global in `src/app/layout.tsx` — a pre-existing
  Next.js 16 generated-types gap (`.next/types` is produced by `next build`, which CI runs
  first). Not a security issue and unrelated to this change.
