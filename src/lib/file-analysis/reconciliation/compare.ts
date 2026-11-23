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
import type { Citation } from "@/lib/rag/types";
import type {
  ModelCitation,
  ReconciliationFlag,
  ReconciliationOutput,
} from "./types";

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
