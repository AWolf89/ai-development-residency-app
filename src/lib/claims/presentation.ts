/**
 * Pure presentation mapping for the Evidence Profile (ADR-0015): status → chip, the summary
 * line, the facet tabs, and claim filtering. No React, no Supabase, so it is unit-tested to
 * the 80% floor behind the page boundary (Humble Object, CLAUDE.md §3).
 */
import { CLAIM_CATEGORIES } from "./types";
import type { Claim, ClaimCategory, ClaimStatus } from "./types";
import type { TagTone } from "@/theme-tokens";

/** The chip label + tone for each derived status (reuses the existing StatusChip tones). */
export type StatusDisplay = { label: string; tone: TagTone };

const STATUS_DISPLAY: Record<ClaimStatus, StatusDisplay> = {
  evidence_linked: { label: "Evidence-linked", tone: "green" },
  recollection: { label: "Your recollection", tone: "blue" },
  self_reported_metric: { label: "Self-reported metric", tone: "orange" },
};

export function statusDisplay(status: ClaimStatus): StatusDisplay {
  return STATUS_DISPLAY[status];
}

/** Human label for a facet (used on tabs and the record form). */
const CATEGORY_LABELS: Record<ClaimCategory, string> = {
  leadership: "Leadership",
  delivery: "Delivery",
  stakeholders: "Stakeholders",
  technical: "Technical",
};

export function categoryLabel(category: ClaimCategory): string {
  return CATEGORY_LABELS[category];
}

/** The summary line: claim count, distinct supporting files, and the last-updated date. */
export type ClaimSummary = {
  claimCount: number;
  sourceCount: number;
  /** ISO string of the most recently updated claim, or null when there are none. */
  lastUpdated: string | null;
};

export function summarize(claims: Claim[]): ClaimSummary {
  const files = new Set<string>();
  let lastUpdated: string | null = null;
  for (const claim of claims) {
    for (const id of claim.sourceFileIds) {
      files.add(id);
    }
    if (lastUpdated === null || claim.updatedAt > lastUpdated) {
      lastUpdated = claim.updatedAt;
    }
  }
  return { claimCount: claims.length, sourceCount: files.size, lastUpdated };
}

/** Render the summary line as text, e.g. "24 claims · 9 sources · last updated 11/17/2026". */
export function summaryLine(summary: ClaimSummary): string {
  const parts = [
    `${summary.claimCount} claim${summary.claimCount === 1 ? "" : "s"}`,
    `${summary.sourceCount} source${summary.sourceCount === 1 ? "" : "s"}`,
  ];
  if (summary.lastUpdated !== null) {
    parts.push(
      `last updated ${new Date(summary.lastUpdated).toLocaleDateString()}`
    );
  }
  return parts.join(" · ");
}

/** A filter facet is a category or the catch-all "all". */
export type Facet = ClaimCategory | "all";

export type FacetTab = { key: Facet; label: string; count: number };

/**
 * Build the filter tabs: "All" plus the four fixed facets (matching the prototype), each
 * with its claim count. The four always show so the tabs are stable; unfiled claims appear
 * only under "All".
 */
export function buildFacetTabs(claims: Claim[]): FacetTab[] {
  const counts = new Map<ClaimCategory, number>();
  for (const claim of claims) {
    if (claim.category !== null) {
      counts.set(claim.category, (counts.get(claim.category) ?? 0) + 1);
    }
  }
  const tabs: FacetTab[] = [{ key: "all", label: "All", count: claims.length }];
  for (const category of CLAIM_CATEGORIES) {
    tabs.push({
      key: category,
      label: CATEGORY_LABELS[category],
      count: counts.get(category) ?? 0,
    });
  }
  return tabs;
}

/** Validate a raw `?facet=` value into a Facet, defaulting to "all". */
export function parseFacet(value: string | undefined): Facet {
  if (value === "all") {
    return "all";
  }
  return (CLAIM_CATEGORIES as readonly string[]).includes(value ?? "")
    ? (value as ClaimCategory)
    : "all";
}

/** Claims shown for a facet: "all" shows everything; a category shows only its claims. */
export function filterClaims(claims: Claim[], facet: Facet): Claim[] {
  if (facet === "all") {
    return claims;
  }
  return claims.filter((claim) => claim.category === facet);
}

/** The "used in" line for a claim's detail panel; null when it is not used anywhere yet. */
export function usageLine(claim: Claim): string | null {
  const parts: string[] = [];
  if (claim.usage.fromInterview) {
    parts.push("1 interview");
  }
  if (claim.usage.requirementMatches > 0) {
    const n = claim.usage.requirementMatches;
    parts.push(`${n} gap-check match${n === 1 ? "" : "es"}`);
  }
  return parts.length > 0 ? `Used in: ${parts.join(", ")}` : null;
}
