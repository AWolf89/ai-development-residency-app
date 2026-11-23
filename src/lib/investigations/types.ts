/**
 * Types for the Investigation Queue (MVP 2 Phase 3, §8). A read-only projection: "what to
 * investigate next," derived on read by unioning signals that already exist, each carrying its own
 * status. There is NO queue table — an item disappears when its source signal clears, and history
 * lives in the source rows. Pure data shapes, free of Supabase, so the assembler (build.ts) is
 * unit-tested with canned inputs (Humble Object / Dependency Inversion, CLAUDE.md §3).
 */

/** The kinds of outstanding work the queue surfaces, in rough order of integrity impact. */
export const INVESTIGATION_KINDS = [
  "document_conflict", // a new upload contradicts existing evidence (ADR-0023)
  "overclaim_flag", // the reviewer flagged an unsupported/overstated claim
  "unsupported_claim", // a claim with no supporting evidence (lifecycle needs_investigation)
  "unverified_requirement", // a role requirement the evidence can't yet verify (gap/unknown)
  "missing_info", // a recorded "still unknown" item (missing_info_items, open)
  "link_suggestion", // a complementary match: link rather than duplicate (reconciliation)
  "unreviewed_file", // an uploaded file not yet analysed/reviewed
  "unfinished_interview", // an interview started but not completed
] as const;
export type InvestigationKind = (typeof INVESTIGATION_KINDS)[number];

/**
 * Priority by kind — lower sorts first. Integrity risks (something could be WRONG) before evidence
 * gaps before nudges. Secondary sort is newest-first within a kind.
 */
export const KIND_PRIORITY: Record<InvestigationKind, number> = {
  document_conflict: 10,
  overclaim_flag: 20,
  unsupported_claim: 30,
  unverified_requirement: 40,
  missing_info: 50,
  link_suggestion: 55,
  unreviewed_file: 60,
  unfinished_interview: 70,
};

/** One derived, display-ready queue item. `id` is derived (`<kind>:<sourceId>`), not a DB id. */
export type InvestigationItem = {
  id: string;
  kind: InvestigationKind;
  /** The unknown, in a few words. */
  title: string;
  /** Why it matters / the stakes. */
  detail: string;
  /** What it affects (a short human label for the record / file / requirement / claim). */
  subjectLabel: string;
  /** The single next action: a deep-link into the right existing surface. */
  action: { label: string; href: string };
  priority: number;
  /** ISO timestamp for the newest-first secondary sort (optional; absent sorts last within a kind). */
  createdAt?: string;
};

// ── The raw signals the queries collect (normalised; build.ts turns these into items) ───────────

export type UnverifiedRequirementSignal = {
  requirementId: string;
  targetRoleId: string;
  label: string;
  verdict: "gap" | "unknown";
  updatedAt: string;
};

export type OverclaimFlagSignal = {
  flagId: string;
  decisionRecordId: string;
  recordTitle: string;
  message: string;
  createdAt: string;
};

export type ReconciliationSignal = {
  flagId: string;
  fileId: string;
  fileName: string;
  /** 'date' | 'metric' | 'ownership' = a conflict; 'complementary' = a link suggestion. */
  kind: "date" | "metric" | "ownership" | "complementary";
  message: string;
  createdAt: string;
};

export type UnsupportedClaimSignal = {
  recordId: string;
  title: string;
};

export type MissingInfoSignal = {
  itemId: string;
  description: string;
  decisionRecordId: string | null;
  claimId: string | null;
  roleRequirementId: string | null;
  createdAt: string;
};

export type UnreviewedFileSignal = {
  fileId: string;
  fileName: string;
};

export type UnfinishedInterviewSignal = {
  sessionId: string;
  title: string | null;
  status: "active" | "paused";
  updatedAt: string;
};

/** Everything the queries collect, passed to the pure assembler. */
export type InvestigationSignals = {
  unverifiedRequirements: UnverifiedRequirementSignal[];
  overclaimFlags: OverclaimFlagSignal[];
  reconciliation: ReconciliationSignal[];
  unsupportedClaims: UnsupportedClaimSignal[];
  missingInfo: MissingInfoSignal[];
  unreviewedFiles: UnreviewedFileSignal[];
  unfinishedInterviews: UnfinishedInterviewSignal[];
};

/** An empty signal set — the honest "nothing outstanding" input. */
export const EMPTY_SIGNALS: InvestigationSignals = {
  unverifiedRequirements: [],
  overclaimFlags: [],
  reconciliation: [],
  unsupportedClaims: [],
  missingInfo: [],
  unreviewedFiles: [],
  unfinishedInterviews: [],
};
