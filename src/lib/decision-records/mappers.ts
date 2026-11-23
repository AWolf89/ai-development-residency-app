/**
 * Pure mapping from a *validated* decision record to the database row shape.
 *
 * Kept separate from the Server Action (Humble Object) so the column mapping is
 * unit-testable with no network. Optional fields that were left blank are stored
 * as SQL NULL rather than an empty string, and the row is marked `confirmed`
 * because a record only reaches the save step after the user confirms it (AC3).
 */
import type { DecisionRecordInput, DecisionSource } from "./validation";
import type { ClaimCategory } from "@/lib/claims/types";
import type { Contribution } from "@/lib/provenance/types";

export type DecisionRecordRow = {
  user_id: string;
  title: string;
  situation: string;
  cue: string | null;
  decision: string;
  why: string | null;
  outcome: string;
  source: DecisionSource;
  status: string;
  category: ClaimCategory | null;
  is_metric: boolean;
  /** Attribution — who did the work (ADR-0022 §5.2); null = unspecified. */
  contribution: Contribution | null;
  attribution_note: string | null;
  project_id: string | null;
};

export function mapDecisionRecordToRow(
  input: DecisionRecordInput,
  userId: string,
  projectId: string | null = null
): DecisionRecordRow {
  return {
    user_id: userId,
    title: input.title,
    situation: input.situation,
    cue: input.cue ?? null,
    decision: input.decision,
    why: input.why ?? null,
    outcome: input.outcome,
    source: input.source,
    status: "confirmed",
    category: input.category ?? null,
    is_metric: input.isMetric,
    contribution: input.contribution ?? null,
    attribution_note: input.attributionNote ?? null,
    project_id: projectId,
  };
}
