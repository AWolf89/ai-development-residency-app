/**
 * Pure presentation mapping for the Gap Check screen (ADR-0024, superseding ADR-0012).
 * Turns a stored four-verdict assessment (ADR-0011) into the four product categories
 * — Demonstrated / Partially demonstrated / Unverified / Development opportunity — the
 * summary counts, and the "evidence or next step" cell.
 *
 * The core framing (docs/evidence-foundation-assessment.md §6.5): a lack of evidence is
 * not a lack of skill, so `unknown` reads as **Unverified** and routes to investigation,
 * never to training or a hiring verdict.
 *
 * No React, no Supabase — so the mapping is unit-tested to the 80% floor behind the
 * page / Server Action boundary (Humble Object / Dependency Inversion, CLAUDE.md §3).
 */
import type { GapVerdict } from "./types";
import type { Citation } from "@/lib/rag/types";
import type { TagTone } from "@/theme-tokens";

/** The four categories, one per stored verdict (ADR-0024). */
export type GapCategory =
  "demonstrated" | "partial" | "unverified" | "development";

export type CategoryDisplay = {
  category: GapCategory;
  /** Chip text shown in the Status column and the tile. */
  label: string;
  /** Reuses the existing StatusChip tones. */
  tone: TagTone;
};

const CATEGORIES: Record<GapCategory, CategoryDisplay> = {
  demonstrated: {
    category: "demonstrated",
    label: "Demonstrated",
    tone: "green",
  },
  partial: {
    category: "partial",
    label: "Partially demonstrated",
    tone: "blue",
  },
  unverified: { category: "unverified", label: "Unverified", tone: "orange" },
  development: {
    category: "development",
    label: "Development opportunity",
    tone: "gray",
  },
};

/**
 * Map a stored verdict to its display category (ADR-0024). Each verdict gets its own
 * category so a chip never conflates full with partial coverage: `met` → Demonstrated,
 * `partial` → Partially demonstrated, `unknown` (no evidence retrieved) → the actionable
 * Unverified, `gap` → Development opportunity (never a hiring verdict).
 */
export function verdictToCategory(verdict: GapVerdict): CategoryDisplay {
  switch (verdict) {
    case "met":
      return CATEGORIES.demonstrated;
    case "partial":
      return CATEGORIES.partial;
    case "unknown":
      return CATEGORIES.unverified;
    case "gap":
      return CATEGORIES.development;
  }
}

export type GapSummary = {
  demonstrated: number;
  partiallyDemonstrated: number;
  unverified: number;
  development: number;
  /** How many requirements have been assessed (the summary is over these only). */
  assessed: number;
};

/** Count assessed requirements per category for the four summary tiles. */
export function summarize(verdicts: GapVerdict[]): GapSummary {
  const summary: GapSummary = {
    demonstrated: 0,
    partiallyDemonstrated: 0,
    unverified: 0,
    development: 0,
    assessed: verdicts.length,
  };
  for (const verdict of verdicts) {
    const { category } = verdictToCategory(verdict);
    switch (category) {
      case "demonstrated":
        summary.demonstrated += 1;
        break;
      case "partial":
        summary.partiallyDemonstrated += 1;
        break;
      case "unverified":
        summary.unverified += 1;
        break;
      case "development":
        summary.development += 1;
        break;
    }
  }
  return summary;
}

/** The "Evidence or next step" column, shaped by category. */
export type EvidenceCell =
  | { kind: "evidence"; text: string }
  | { kind: "next_step"; text: string; href: string | null }
  | { kind: "none"; text: string };

const UNVERIFIED_NEXT_STEP =
  "Not found in your evidence yet — investigate what you've done before treating it as a gap";
const DEVELOPMENT_FALLBACK = "No evidence or recollection found";

function citationSummary(citations: Citation[]): string {
  // Defensive: the backend downgrades an uncited met/partial to gap (ADR-0011), so a
  // cited row should always carry ≥1 citation — but never render an empty cell.
  if (citations.length === 0) {
    return "Supported by your evidence";
  }
  const primary = citations[0].title;
  const count = citations.length;
  return `${primary} · ${count} source${count === 1 ? "" : "s"}`;
}

/**
 * Build the evidence/next-step cell for one assessed requirement. Demonstrated and
 * Partially demonstrated rows show the validated citation(s) (the category label already
 * carries the full-vs-partial nuance); Unverified rows route to investigation, never a
 * course; Development opportunities show the honest rationale (or a standard line).
 */
export function evidenceCell(input: {
  verdict: GapVerdict;
  citations: Citation[];
  rationale: string;
}): EvidenceCell {
  const { category } = verdictToCategory(input.verdict);
  if (category === "demonstrated" || category === "partial") {
    return { kind: "evidence", text: citationSummary(input.citations) };
  }
  if (category === "unverified") {
    return {
      kind: "next_step",
      text: UNVERIFIED_NEXT_STEP,
      href: "/dashboard/investigations",
    };
  }
  return { kind: "none", text: input.rationale.trim() || DEVELOPMENT_FALLBACK };
}

/**
 * Pick which target role the Gap Check page shows: the one named by the `?role=` param if
 * it is one the user actually owns, otherwise the first (newest) role. Returns undefined
 * only when the user has no roles. Kept pure so the page boundary stays logic-free and the
 * selection is unit-tested (ADR-0024).
 */
export function selectActiveRole<T extends { id: string }>(
  roles: T[],
  roleParam: string | undefined
): T | undefined {
  if (roleParam) {
    const match = roles.find((role) => role.id === roleParam);
    if (match) {
      return match;
    }
  }
  return roles[0];
}
