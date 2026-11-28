/**
 * Pure grounding for cross-document reconciliation (ADR-0023). No IO and no `server-only` import,
 * so it is unit-tested with plain inputs (Humble Object, CLAUDE.md §3). Mirrors the reviewer's
 * grounding (reviewer/grounding.ts): the honesty guard lives here, not in the prompt.
 *
 * A flag may never cite evidence that was not actually retrieved, so a conflict can never be
 * invented against a source that does not exist:
 *  - every model citation is validated against the retrieved existing sources (invalid stripped);
 *  - a flag that cites NO real existing source is DROPPED — a contradiction/complementary match is
 *    meaningless without the existing thing it relates to.
 */
import { buildContext } from "@/lib/rag/context";
import type { Citation, Hit, Retrieval } from "@/lib/rag/types";
import type {
  ModelCitation,
  ReconciliationFlag,
  ReconciliationOutput,
} from "./types";

/**
 * Split a document into up to `max` evenly-spaced query windows of `size` chars each, covering
 * start to end. Reconciliation retrieves the user's existing evidence by querying the NEW file's
 * text; a single first-slice query misses overlaps that sit deeper in a multi-section document
 * (e.g. the second job on a resume), so it reported "no overlaps" for work it clearly repeats
 * (GF3). Querying across the whole file surfaces that evidence. Windows may overlap when the
 * document is short; the hit de-dup in `mergeRetrievals` collapses the duplicates.
 */
export function windowizeForRetrieval(
  text: string,
  size: number,
  max: number
): string[] {
  if (size <= 0 || max <= 0) return [];
  if (text.length <= size) return text.length > 0 ? [text] : [];
  const count = Math.min(max, Math.ceil(text.length / size));
  if (count === 1) return [text.slice(0, size)];
  const lastStart = text.length - size;
  const windows: string[] = [];
  for (let i = 0; i < count; i++) {
    const start = Math.round((lastStart * i) / (count - 1));
    windows.push(text.slice(start, start + size));
  }
  return windows;
}

/**
 * Merge several evidence retrievals into one: union their raw hits, keep the highest-scoring copy
 * of each hit, and rebuild a single capped context + de-duped source list. Lets reconciliation
 * query the whole file across several windows and still present one grounded existing-evidence set.
 */
export function mergeRetrievals(retrievals: Retrieval[]): Retrieval {
  const byId = new Map<string, Hit>();
  for (const r of retrievals) {
    for (const h of r.hits) {
      const prev = byId.get(h.id);
      if (!prev || h.score > prev.score) byId.set(h.id, h);
    }
  }
  const merged = [...byId.values()].sort((a, b) => b.score - a.score);
  return buildContext(merged, { corpus: "evidence" });
}

/** Keep only citations that point at a really-retrieved existing source; dedup by source+id. */
export function validateCitations(
  returned: ModelCitation[],
  retrievedSources: Citation[]
): Citation[] {
  const bySourceId = new Map(
    retrievedSources.map((s) => [`${s.source}:${s.id}`, s])
  );
  const out: Citation[] = [];
  const seen = new Set<string>();
  for (const c of returned) {
    const key = `${c.source}:${c.id}`;
    const match = bySourceId.get(key);
    if (match && !seen.has(key)) {
      out.push(match);
      seen.add(key);
    }
  }
  return out;
}

export type GroundedReconciliation = {
  flags: ReconciliationFlag[];
  /** How many model flags were dropped as ungrounded (cited no real existing source). */
  dropped: number;
};

/**
 * Ground one reconciliation pass into the flags to present. Each kept flag cites at least one
 * really-retrieved existing source and starts `pending` for the user's accept/dismiss decision.
 */
export function groundReconciliation(
  output: ReconciliationOutput,
  retrievedSources: Citation[]
): GroundedReconciliation {
  const flags: ReconciliationFlag[] = [];
  let dropped = 0;

  for (const flag of output.flags) {
    const citations = validateCitations(flag.citations, retrievedSources);
    if (citations.length === 0) {
      dropped += 1;
      continue;
    }
    flags.push({
      kind: flag.kind,
      message: flag.message,
      newValue: flag.newValue ?? null,
      existingValue: flag.existingValue ?? null,
      citations,
      disposition: "pending",
    });
  }

  return { flags, dropped };
}
