/**
 * Pure assembly of claims from the raw rows `queries.ts` reads (ADR-0015). Turns a
 * decision_records row + its embedded relations into a `Claim`: distinct source files,
 * derived status, ordered version history, and real "used in" usage. No Supabase, no React,
 * so it is unit-tested with plain inputs (Humble Object, CLAUDE.md §3).
 */
import { claimCategorySchema } from "./types";
import type { Claim, ClaimCategory, ClaimRecordRow } from "./types";
import { deriveStatus } from "./status";

/** A DB category string → the typed facet, or null when unset/unknown (defensive). */
function toCategory(value: string | null): ClaimCategory | null {
  if (value === null) {
    return null;
  }
  const parsed = claimCategorySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Distinct, non-null supporting file ids for a record (order preserved). */
function distinctFileIds(links: { file_id: string | null }[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const link of links) {
    if (link.file_id !== null && !seen.has(link.file_id)) {
      seen.add(link.file_id);
      ids.push(link.file_id);
    }
  }
  return ids;
}

/** Assemble one claim from its record row. */
export function toClaim(row: ClaimRecordRow): Claim {
  const sourceFileIds = distinctFileIds(row.evidence_links ?? []);
  const history = [...(row.record_versions ?? [])]
    .map((v) => ({ versionNumber: v.version_number, createdAt: v.created_at }))
    .sort((a, b) => b.versionNumber - a.versionNumber);
  return {
    id: row.id,
    title: row.title,
    decision: row.decision,
    category: toCategory(row.category),
    isMetric: row.is_metric,
    status: deriveStatus({
      sourceCount: sourceFileIds.length,
      isMetric: row.is_metric,
    }),
    sourceFileIds,
    sourceCount: sourceFileIds.length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history,
    usage: {
      requirementMatches: (row.record_requirement_links ?? []).length,
      fromInterview: (row.interview_turns ?? []).length > 0,
    },
  };
}

/** Assemble a list of claims (rows arrive newest-first from the query; order is preserved). */
export function toClaims(rows: ClaimRecordRow[]): Claim[] {
  return rows.map(toClaim);
}
