/**
 * Shared types for the Claims / Evidence Profile. Since ADR-0022 a claim is its own
 * aggregate (`claims`) joined to its evidence record(s) through `claim_evidence`; this module
 * reads a claim with its backing `decision_records` row embedded. Zod is the single source of
 * truth for the small enums; the rest are plain data shapes, free of Supabase and React, so
 * status derivation, assembly, and presentation are unit-tested with plain inputs (Humble
 * Object / Dependency Inversion, CLAUDE.md §3). See docs/design/claims-evidence-profile.md.
 */
import { z } from "zod";
import type { ClaimLifecycleState } from "./lifecycle";

/** The facet a claim is filed under (the profile's filter tabs). Mirrors the DB CHECK. */
export const CLAIM_CATEGORIES = [
  "leadership",
  "delivery",
  "stakeholders",
  "technical",
] as const;
export const claimCategorySchema = z.enum(CLAIM_CATEGORIES);
export type ClaimCategory = z.infer<typeof claimCategorySchema>;

/**
 * The derived evidence *strength* shown as a chip. Never stored — computed on read from real
 * signals. Orthogonal to the claim lifecycle (ADR-0022 §3): strength answers "how is this
 * backed?", lifecycle answers "where is this claim in its life?".
 */
export const CLAIM_STATUSES = [
  "evidence_linked",
  "recollection",
  "self_reported_metric",
] as const;
export const claimStatusSchema = z.enum(CLAIM_STATUSES);
export type ClaimStatus = z.infer<typeof claimStatusSchema>;

/** One prior version of a claim (from `record_versions`). */
export type ClaimHistoryEntry = {
  versionNumber: number;
  createdAt: string;
};

/** Where a claim is "used in" — real, existing usages only (no résumé bullets yet). */
export type ClaimUsage = {
  /** Gap-check matches: `record_requirement_links` rows pointing at the record. */
  requirementMatches: number;
  /** True when the claim originated in a Reasoning Interview turn. */
  fromInterview: boolean;
};

/** A claim: its backing decision record plus derived status, lifecycle, sources, and usage. */
export type Claim = {
  /**
   * The backing decision record's id. Kept as `id` (not the claim aggregate's id) so record
   * navigation and the /dashboard output are unchanged across the ADR-0022 split; the claim
   * aggregate's own id is `claimId`.
   */
  id: string;
  /** The `claims` aggregate id (ADR-0022). */
  claimId: string;
  title: string;
  decision: string | null;
  category: ClaimCategory | null;
  isMetric: boolean;
  /** Derived evidence strength (computed, never stored). */
  status: ClaimStatus;
  /** Computed lifecycle state (ADR-0022 §3) — alongside, not replacing, `status`. */
  lifecycle: ClaimLifecycleState;
  /** Distinct supporting files (deduped); `sourceCount` is its length. */
  sourceFileIds: string[];
  sourceCount: number;
  createdAt: string;
  updatedAt: string;
  history: ClaimHistoryEntry[];
  usage: ClaimUsage;
};

/**
 * The embedded `decision_records` row (with its relations) that a claim projects over. Kept
 * as a named shape so the pure assembler (`assemble.ts`) can be tested without the server-only
 * Supabase client.
 */
export type ClaimRecordRow = {
  id: string;
  title: string;
  decision: string | null;
  category: string | null;
  is_metric: boolean;
  created_at: string;
  updated_at: string;
  evidence_links: { file_id: string | null }[];
  record_versions: { version_number: number; created_at: string }[];
  record_requirement_links: { id: string }[];
  interview_turns: { id: string }[];
  /** Reviewer-check reviews with their flags; a pending flag is an open challenge (ADR-0016). */
  record_reviews: { record_review_flags: { disposition: string }[] }[];
};

/**
 * The raw shape `queries.ts` reads from Supabase: a `claims` row with its backing
 * decision record embedded through `claim_evidence`. Phase 1 is strictly 1:1, so there is one
 * `claim_evidence` entry; the shape is an array so the later fan-out needs no type change.
 */
export type ClaimRow = {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  claim_evidence: { decision_records: ClaimRecordRow | null }[];
};
