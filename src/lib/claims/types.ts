/**
 * Shared types for the Claims / Evidence Profile (ADR-0015). A "claim" is a
 * `decision_records` row viewed through this module — not a new table. Zod is the single
 * source of truth for the small enums; the rest are plain data shapes, free of Supabase and
 * React, so status derivation, assembly, and presentation are unit-tested with plain inputs
 * (Humble Object / Dependency Inversion, CLAUDE.md §3). See docs/design/claims-evidence-profile.md.
 */
import { z } from "zod";

/** The facet a claim is filed under (the profile's filter tabs). Mirrors the DB CHECK. */
export const CLAIM_CATEGORIES = [
  "leadership",
  "delivery",
  "stakeholders",
  "technical",
] as const;
export const claimCategorySchema = z.enum(CLAIM_CATEGORIES);
export type ClaimCategory = z.infer<typeof claimCategorySchema>;

/** The derived status shown as a chip. Never stored — computed on read from real signals. */
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

/** A claim: a decision record plus its derived status, sources, history, and usage. */
export type Claim = {
  id: string;
  title: string;
  decision: string | null;
  category: ClaimCategory | null;
  isMetric: boolean;
  status: ClaimStatus;
  /** Distinct supporting files (deduped); `sourceCount` is its length. */
  sourceFileIds: string[];
  sourceCount: number;
  createdAt: string;
  updatedAt: string;
  history: ClaimHistoryEntry[];
  usage: ClaimUsage;
};

/**
 * The raw shape `queries.ts` reads from Supabase (decision_records + embedded relations).
 * Kept here so the pure assembler (`assemble.ts`) can be tested without importing the
 * server-only Supabase client.
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
};
