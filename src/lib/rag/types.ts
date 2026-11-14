/**
 * Shared types for the Evidence Search Pipeline (closed-RAG retrieval, build order 8).
 *
 * These are pure data shapes with Zod as the single source of truth, kept free of Supabase
 * and the AI SDK so the chunker, context builder, and retriever logic can be unit-tested
 * with plain inputs (Humble Object / Dependency Inversion, CLAUDE.md §3). See
 * docs/design/evidence-search-pipeline.md and ADR-0010.
 */
import { z } from "zod";

export { EMBEDDING_DIM } from "./embedding";

/** One raw row as read from the existing `reference_items` table (ADR-0008). */
export const rawReferenceRowSchema = z.object({
  source: z.string().min(1),
  entity_type: z.string().min(1),
  external_id: z.string().min(1),
  name: z.string(),
  description: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  source_version: z.string().nullable(),
});
export type RawReferenceRow = z.infer<typeof rawReferenceRowSchema>;

/** A chunk destined for `reference_chunks` (shared, read-only reference passage). */
export const referenceChunkSchema = z.object({
  // Stable id: "<source>:<group>:<section>", e.g. "onet:15-2051.00:tasks".
  id: z.string().min(1),
  source: z.string().min(1), // 'techfleet-spf' | 'onet'
  // Citation id: the SOC code (O*NET) or external_id/slug (framework).
  ref_id: z.string().min(1),
  ref_kind: z.string().min(1), // 'occupation' | 'framework_skills' | ...
  title: z.string().min(1),
  section: z.string().min(1), // 'overview'|'tasks'|'skills'|... or 'entity'
  content: z.string().min(1),
  content_hash: z.string().length(64), // sha-256 hex
  source_version: z.string().nullable(),
});
export type ReferenceChunk = z.infer<typeof referenceChunkSchema>;

/** A chunk destined for `evidence_chunks` (per-user, RLS-protected). */
export const evidenceChunkSchema = z.object({
  source_kind: z.enum(["file", "decision_record"]),
  file_id: z.string().uuid().nullable(),
  decision_record_id: z.string().uuid().nullable(),
  title: z.string(),
  chunk_index: z.number().int().nonnegative(),
  content: z.string().min(1),
  content_hash: z.string().length(64),
});
export type EvidenceChunk = z.infer<typeof evidenceChunkSchema>;

/**
 * One row returned by a `*_hybrid_search` RPC. Shared shape for both corpora:
 * `source` and `ref_id` are what a citation is built from (e.g. "onet" + "15-2051.00",
 * or "file" + a document title/id). Ranks and similarity let the app decide "not found".
 */
export type Hit = {
  id: string;
  source: string;
  ref_id: string;
  title: string;
  section: string;
  content: string;
  keyword_rank: number | null;
  semantic_rank: number | null;
  similarity: number | null;
  score: number;
};

export type Citation = { source: string; id: string; title: string };

/** The result of a retrieval: grounded context + citations, or a not-found sentinel. */
export type Retrieval = {
  found: boolean;
  context: string;
  sources: Citation[];
  hits: Hit[];
};
