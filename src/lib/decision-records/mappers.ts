/**
 * Pure mapping from a *validated* decision record to the database row shape.
 *
 * Kept separate from the Server Action (Humble Object) so the column mapping is
 * unit-testable with no network. Optional fields that were left blank are stored
 * as SQL NULL rather than an empty string, and the row is marked `confirmed`
 * because a record only reaches the save step after the user confirms it (AC3).
 */
import type { DecisionRecordInput, DecisionSource } from "./validation";

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
};

export function mapDecisionRecordToRow(
  input: DecisionRecordInput,
  userId: string
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
  };
}
