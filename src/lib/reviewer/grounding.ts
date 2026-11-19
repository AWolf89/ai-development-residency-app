/**
 * Pure closed-RAG grounding for the Reviewer Agent Check (ADR-0016). No IO and no `server-only`
 * import, so it is unit-tested with plain inputs (Humble Object, CLAUDE.md §3). Mirrors the Gap
 * Check's grounding (gap/classify.ts): the honesty guards live here, not in the prompt.
 *
 * A flag may never cite evidence that was not actually retrieved:
 *  - every model citation is validated against the retrieved sources (invalid ones stripped);
 *  - an `accuracy` (overstatement) flag that cites sources which do not exist is DROPPED — it was
 *    built on invented evidence and cannot be trusted;
 *  - an `accuracy` flag that cites nothing is DOWNGRADED to a `support` flag ("unsupported"), the
 *    honest weaker claim, with its severity softened;
 *  - `support` flags assert absence and carry no citation by nature;
 *  - intrinsic flags (`specificity`, `completeness`) judge the record text only and carry none.
 */
import type { Citation } from "@/lib/rag/types";
import { downgradeSeverity } from "./machine";
import type {
  ModelCitation,
  ModelFlag,
  ReviewDimension,
  ReviewFlag,
} from "./types";

/** Keep only citations that point at a really-retrieved source; dedup by source+id. */
export function validateFlagCitations(
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

/**
 * Resolve one model flag for a dimension into a final, grounded `ReviewFlag`, or `null` when it
 * must be dropped (an overstatement claim built on citations that do not exist).
 */
export function resolveFlag(
  dimension: ReviewDimension,
  flag: ModelFlag,
  retrievedSources: Citation[]
): ReviewFlag | null {
  const base = {
    targetField: flag.targetField,
    message: flag.message,
    disposition: "pending" as const,
  };

  // Intrinsic dimensions judge the record text; any citation the model offered is ignored.
  if (dimension === "specificity" || dimension === "completeness") {
    return { dimension, severity: flag.severity, citations: [], ...base };
  }

  const valid = validateFlagCitations(flag.citations, retrievedSources);

  // Support flags assert absence of evidence; keep whatever real citation (if any) was offered.
  if (dimension === "support") {
    return {
      dimension: "support",
      severity: flag.severity,
      citations: valid,
      ...base,
    };
  }

  // Accuracy (overstatement): must be grounded in really-retrieved evidence.
  if (valid.length > 0) {
    return {
      dimension: "accuracy",
      severity: flag.severity,
      citations: valid,
      ...base,
    };
  }
  if (flag.citations.length > 0) {
    // The model cited sources that were not retrieved — invented evidence. Drop it.
    return null;
  }
  // No citation attempted: recast as the honest weaker claim (unsupported), severity softened.
  return {
    dimension: "support",
    severity: downgradeSeverity(flag.severity),
    citations: [],
    ...base,
  };
}

/** Resolve every model flag for one dimension, dropping any that cannot be grounded. */
export function resolveFlags(
  dimension: ReviewDimension,
  flags: ModelFlag[],
  retrievedSources: Citation[]
): ReviewFlag[] {
  const out: ReviewFlag[] = [];
  for (const f of flags) {
    const resolved = resolveFlag(dimension, f, retrievedSources);
    if (resolved) out.push(resolved);
  }
  return out;
}

/** The message for the deterministic "no evidence on file" flag (no model call — honest absence). */
export const NO_EVIDENCE_FLAG_MESSAGE =
  "No supporting evidence was found on file for this record's claims.";

/** The single flag emitted for the `support` dimension when retrieval finds nothing. */
export function noEvidenceFlag(): ReviewFlag {
  return {
    dimension: "support",
    severity: "caution",
    targetField: "record",
    message: NO_EVIDENCE_FLAG_MESSAGE,
    citations: [],
    disposition: "pending",
  };
}
