/**
 * The claim lifecycle (ADR-0022 §3). A claim's lifecycle status is computed on read
 * from (the stored human decision + live evidence signals) by this pure reducer, so it can
 * never silently disagree with the evidence (ADR-0012/0015). Only the two irreducible human
 * decisions — `user_confirmed` and `archived` — are stored on `claims.status`; every
 * evidence-derived state (`draft` / `needs_investigation` / `supported` / `challenged`) is
 * recomputed here. No Supabase, no React: a Humble Object unit-tested with plain inputs
 * (CLAUDE.md §3).
 */
import { z } from "zod";

/** The six lifecycle states (mirrors the `claims.status` CHECK). */
export const CLAIM_LIFECYCLE_STATES = [
  "draft",
  "needs_investigation",
  "supported",
  "user_confirmed",
  "challenged",
  "archived",
] as const;
export const claimLifecycleStateSchema = z.enum(CLAIM_LIFECYCLE_STATES);
export type ClaimLifecycleState = z.infer<typeof claimLifecycleStateSchema>;

/**
 * The only states the app ever authoritatively stores on `claims.status`: the two deliberate
 * human decisions, plus the `draft` baseline a claim is created with. Every other value read
 * from the DB is treated as the `draft` baseline (the computed signals take over), so a stale
 * computed value can never masquerade as an authoritative decision.
 */
export const STORED_CLAIM_DECISIONS = [
  "draft",
  "user_confirmed",
  "archived",
] as const;
export type StoredClaimDecision = (typeof STORED_CLAIM_DECISIONS)[number];

/**
 * Live, evidence-derived signals for one claim. Each is computed from real rows
 * (evidence links, gap verdicts, missing-info items, reviewer flags) by the read layer; the
 * reducer itself stays pure.
 */
export type ClaimEvidenceSignals = {
  /** At least one linked evidence record is backed by a validated source file. */
  hasSupportingEvidence: boolean;
  /**
   * An open evidence gap stands against the claim: no linked source, a linked requirement
   * with a `gap`/`unknown` verdict (ADR-0011), or an open missing-info item.
   */
  hasOpenGap: boolean;
  /**
   * An open challenge stands against the claim: an unresolved reviewer flag (ADR-0016) or an
   * ingest-time cross-document contradiction.
   */
  hasOpenChallenge: boolean;
};

/**
 * Narrow any value read from `claims.status` to the authoritative stored decision. Only
 * `user_confirmed` and `archived` survive; anything else (including a persisted computed
 * state) collapses to the `draft` baseline so the computed signals decide the rest.
 */
export function normalizeStoredDecision(status: string): StoredClaimDecision {
  return status === "user_confirmed" || status === "archived"
    ? status
    : "draft";
}

/**
 * Compute a claim's effective lifecycle status from its stored human decision and live
 * evidence signals. Precedence (ADR-0022 §3):
 *  1. `archived` (stored) — retired; excluded from the active profile, so it wins outright.
 *  2. `challenged` (computed) — an open challenge surfaces even over a confirmed claim.
 *  3. `user_confirmed` (stored) — the user's explicit HITL affirmation.
 *  4. `supported` (computed) — supporting evidence and no open gap.
 *  5. `needs_investigation` (computed) — an open evidence gap.
 *  6. `draft` — the baseline (nothing substantiated, confirmed, or flagged).
 */
export function computeLifecycleStatus(
  stored: StoredClaimDecision,
  signals: ClaimEvidenceSignals
): ClaimLifecycleState {
  if (stored === "archived") {
    return "archived";
  }
  if (signals.hasOpenChallenge) {
    return "challenged";
  }
  if (stored === "user_confirmed") {
    return "user_confirmed";
  }
  if (signals.hasSupportingEvidence && !signals.hasOpenGap) {
    return "supported";
  }
  if (signals.hasOpenGap) {
    return "needs_investigation";
  }
  return "draft";
}

/** Whether a computed lifecycle status should appear in the active (non-archived) profile. */
export function isActiveLifecycle(status: ClaimLifecycleState): boolean {
  return status !== "archived";
}
