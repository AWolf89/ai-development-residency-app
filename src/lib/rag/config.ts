/**
 * Retrieval settings for the Evidence Search Pipeline. One place to tune search; change
 * these only after running tools/rag/eval_retrieval.py and reporting hit rate before/after
 * (closed-rag skill: "measure, don't guess"). No feature code hard-codes these numbers.
 */
export const RAG_CONFIG = {
  /** How many hits a hybrid_search RPC returns. */
  matchCount: 8,
  /**
   * Below this cosine similarity, a vector-only hit (no keyword match) is treated as
   * "not found" rather than guessed. Tuned with tools/rag/eval_retrieval.py against the full
   * O*NET + framework corpus: unanswerable questions top out at ~0.347 and answerable ones
   * start at ~0.480, so 0.41 separates them (the eval's own suggestion). See
   * docs/rag/retrieval-report.md.
   */
  minSimilarity: 0.41,
  /** Hard cap on characters of context passed downstream (keeps prompts bounded). */
  maxContextChars: 6_000,
  /** Reciprocal-rank-fusion weights/constant, mirrored by the SQL function defaults. */
  fullTextWeight: 1,
  semanticWeight: 1,
  rrfK: 50,
} as const;

/** Sentinel contexts returned when nothing clears the bar — the bot must say it can't answer. */
export const NOT_FOUND = {
  reference: "NO_MATCHING_REFERENCE_DATA",
  evidence: "NO_MATCHING_EVIDENCE_DATA",
} as const;

export type Corpus = keyof typeof NOT_FOUND;
