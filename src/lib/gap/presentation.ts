/**
 * Pure presentation mapping for the Gap Check screen (ADR-0012). Turns a stored
 * four-verdict assessment (ADR-0011) into the prototype's three display buckets, the
 * summary counts, and the "evidence or next step" cell.
 *
 * No React, no Supabase — so the mapping is unit-tested to the 80% floor behind the
 * page / Server Action boundary (Humble Object / Dependency Inversion, CLAUDE.md §3).
 */
import type { GapVerdict } from "./types";
import type { Citation } from "@/lib/rag/types";
import type { TagTone } from "@/theme-tokens";

/** The three buckets the prototype's chips and summary tiles are built from. */
export type GapBucket = "supported" | "undocumented" | "true_gap";

export type BucketDisplay = {
  bucket: GapBucket;
  /** Chip text shown in the Status column and the tile. */
  label: string;
  /** Reuses the existing StatusChip tones. */
  tone: TagTone;
};

const BUCKETS: Record<GapBucket, BucketDisplay> = {
  supported: { bucket: "supported", label: "Supported", tone: "green" },
  undocumented: {
    bucket: "undocumented",
    label: "Undocumented",
    tone: "orange",
  },
  true_gap: { bucket: "true_gap", label: "True gap", tone: "gray" },
};

/**
 * Map a stored verdict to its display bucket (ADR-0012). `met` and `partial` both read
 * as Supported (a partial still rests on a real citation; its nuance is shown in the
 * evidence column, not by demoting it). `unknown` — no evidence retrieved — reads as the
 * actionable Undocumented; `gap` is a True gap.
 */
export function verdictToBucket(verdict: GapVerdict): BucketDisplay {
  switch (verdict) {
    case "met":
    case "partial":
      return BUCKETS.supported;
    case "unknown":
      return BUCKETS.undocumented;
    case "gap":
      return BUCKETS.true_gap;
  }
}

export type GapSummary = {
  supported: number;
  undocumented: number;
  trueGaps: number;
  /** How many requirements have been assessed (the summary is over these only). */
  assessed: number;
};

/** Count assessed requirements per bucket for the three summary tiles. */
export function summarize(verdicts: GapVerdict[]): GapSummary {
  const summary: GapSummary = {
    supported: 0,
    undocumented: 0,
    trueGaps: 0,
    assessed: verdicts.length,
  };
  for (const verdict of verdicts) {
    const { bucket } = verdictToBucket(verdict);
    if (bucket === "supported") {
      summary.supported += 1;
    } else if (bucket === "undocumented") {
      summary.undocumented += 1;
    } else {
      summary.trueGaps += 1;
    }
  }
  return summary;
}

/** The "Evidence or next step" column, shaped by bucket. */
export type EvidenceCell =
  | { kind: "evidence"; text: string }
  | { kind: "next_step"; text: string; href: string | null }
  | { kind: "none"; text: string };

const UNDOCUMENTED_NEXT_STEP =
  "No file shows this yet — upload evidence or add it in an interview";
const TRUE_GAP_FALLBACK = "No evidence or recollection found";

function citationSummary(citations: Citation[], partial: boolean): string {
  const prefix = partial ? "Partial: " : "";
  // Defensive: the backend downgrades an uncited met/partial to gap (ADR-0011), so a
  // Supported row should always carry ≥1 citation — but never render an empty cell.
  if (citations.length === 0) {
    return `${prefix}Supported by your evidence`;
  }
  const primary = citations[0].title;
  const count = citations.length;
  return `${prefix}${primary} · ${count} source${count === 1 ? "" : "s"}`;
}

/**
 * Build the evidence/next-step cell for one assessed requirement. Supported rows show the
 * validated citation(s); Undocumented rows show an actionable next step; True gaps show
 * the honest rationale (or a standard line if none).
 */
export function evidenceCell(input: {
  verdict: GapVerdict;
  citations: Citation[];
  rationale: string;
}): EvidenceCell {
  const { bucket } = verdictToBucket(input.verdict);
  if (bucket === "supported") {
    return {
      kind: "evidence",
      text: citationSummary(input.citations, input.verdict === "partial"),
    };
  }
  if (bucket === "undocumented") {
    return {
      kind: "next_step",
      text: UNDOCUMENTED_NEXT_STEP,
      href: "/dashboard/files",
    };
  }
  return { kind: "none", text: input.rationale.trim() || TRUE_GAP_FALLBACK };
}
