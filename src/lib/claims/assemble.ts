/**
 * Pure assembly of claims from the raw rows `queries.ts` reads (ADR-0015, ADR-0022). Turns a
 * `claims` row + its backing `decision_records` embed into a `Claim`: distinct source files,
 * derived evidence strength, computed lifecycle, ordered version history, and real "used in"
 * usage. No Supabase, no React, so it is unit-tested with plain inputs (Humble Object,
 * CLAUDE.md §3).
 */
import { claimCategorySchema } from "./types";
import type { Claim, ClaimCategory, ClaimRecordRow, ClaimRow } from "./types";
import { deriveStatus } from "./status";
import { computeLifecycleStatus, normalizeStoredDecision } from "./lifecycle";

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

/** True when any reviewer flag on the record is still pending (an open challenge, ADR-0016). */
function hasOpenChallenge(record: ClaimRecordRow): boolean {
  return (record.record_reviews ?? []).some((review) =>
    (review.record_review_flags ?? []).some((f) => f.disposition === "pending")
  );
}

/** The backing decision record for a claim (Phase 1 is 1:1), or null if none is linked. */
function backingRecord(row: ClaimRow): ClaimRecordRow | null {
  for (const link of row.claim_evidence ?? []) {
    if (link.decision_records !== null) {
      return link.decision_records;
    }
  }
  return null;
}

/**
 * Assemble one claim from its `claims` row and backing record. Returns null when the claim has
 * no backing evidence record (shouldn't happen in the 1:1 world — defended against so a
 * dangling row can never crash the profile).
 */
export function toClaim(row: ClaimRow): Claim | null {
  const record = backingRecord(row);
  if (record === null) {
    return null;
  }

  const sourceFileIds = distinctFileIds(record.evidence_links ?? []);
  const history = [...(record.record_versions ?? [])]
    .map((v) => ({ versionNumber: v.version_number, createdAt: v.created_at }))
    .sort((a, b) => b.versionNumber - a.versionNumber);

  const lifecycle = computeLifecycleStatus(
    normalizeStoredDecision(row.status),
    {
      // An evidence record backed by a validated source file.
      hasSupportingEvidence: sourceFileIds.length > 0,
      // No linked source is a real open gap today; richer gap/missing-info signals arrive with
      // the structured-provenance and investigation-queue cards.
      hasOpenGap: sourceFileIds.length === 0,
      hasOpenChallenge: hasOpenChallenge(record),
    }
  );

  return {
    id: record.id,
    claimId: row.id,
    title: record.title,
    decision: record.decision,
    category: toCategory(record.category),
    isMetric: record.is_metric,
    status: deriveStatus({
      sourceCount: sourceFileIds.length,
      isMetric: record.is_metric,
    }),
    lifecycle,
    sourceFileIds,
    sourceCount: sourceFileIds.length,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    history,
    usage: {
      requirementMatches: (record.record_requirement_links ?? []).length,
      fromInterview: (record.interview_turns ?? []).length > 0,
    },
  };
}

/**
 * Assemble a list of claims (rows arrive newest-first from the query; order is preserved).
 * Claims with no backing record are skipped.
 */
export function toClaims(rows: ClaimRow[]): Claim[] {
  const claims: Claim[] = [];
  for (const row of rows) {
    const claim = toClaim(row);
    if (claim !== null) {
      claims.push(claim);
    }
  }
  return claims;
}
