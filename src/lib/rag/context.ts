/**
 * Pure context builder — the closed-RAG safety boundary (R3 §2 flavour). Given hybrid-search
 * hits, it keeps only those that actually matched (a keyword hit, or similarity at/above the
 * threshold), formats each as a citable line, caps total length, and — when nothing
 * qualifies — returns a NOT_FOUND sentinel so the caller says "I don't know" instead of
 * falling back to the model's general knowledge. No IO, no SDK: fully unit-tested.
 */
import { RAG_CONFIG, NOT_FOUND, type Corpus } from "./config";
import type { Hit, Retrieval, Citation } from "./types";

type BuildOptions = {
  corpus: Corpus;
  minSimilarity?: number;
  maxContextChars?: number;
};

/** A hit counts as relevant if it matched a keyword OR cleared the similarity threshold. */
export function isRelevant(hit: Hit, minSimilarity: number): boolean {
  return hit.keyword_rank !== null || (hit.similarity ?? 0) >= minSimilarity;
}

/** Render one hit as a citable context line: "[source · id · section] content". */
export function formatHit(hit: Hit): string {
  const parts = [hit.source, hit.ref_id];
  // "entity" is a pseudo-section for framework rows that have no real sub-section.
  if (hit.section && hit.section !== "entity") parts.push(hit.section);
  return `[${parts.join(" · ")}] ${hit.content}`;
}

export function buildContext(hits: Hit[], options: BuildOptions): Retrieval {
  const minSimilarity = options.minSimilarity ?? RAG_CONFIG.minSimilarity;
  const maxContextChars = options.maxContextChars ?? RAG_CONFIG.maxContextChars;

  const relevant = hits.filter((h) => isRelevant(h, minSimilarity));
  if (relevant.length === 0) {
    return {
      found: false,
      context: NOT_FOUND[options.corpus],
      sources: [],
      hits,
    };
  }

  // Take whole blocks until the char budget is reached (never split a block mid-way).
  const blocks: string[] = [];
  const used: Hit[] = [];
  let length = 0;
  for (const hit of relevant) {
    const block = formatHit(hit);
    const added = length === 0 ? block.length : length + 2 + block.length; // "\n\n"
    if (used.length > 0 && added > maxContextChars) break;
    blocks.push(block);
    used.push(hit);
    length = added;
  }

  // Dedup citations by source+id, keeping the first title seen.
  const seen = new Map<string, Citation>();
  for (const hit of used) {
    const key = `${hit.source}:${hit.ref_id}`;
    if (!seen.has(key)) {
      seen.set(key, { source: hit.source, id: hit.ref_id, title: hit.title });
    }
  }

  return {
    found: true,
    context: blocks.join("\n\n"),
    sources: [...seen.values()],
    hits,
  };
}
