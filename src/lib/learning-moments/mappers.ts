/**
 * Pure mapping from a *validated* learning moment to the database row shape.
 *
 * Kept separate from the Server Action (Humble Object) so the column mapping is unit-testable
 * with no network. Optional fields left blank are stored as SQL NULL rather than an empty
 * string.
 */
import type { LearningMomentInput, LearningMomentKind } from "./types";

export type LearningMomentRow = {
  user_id: string;
  kind: LearningMomentKind;
  context: string;
  shift: string;
  result: string;
  duration: string | null;
  target_role_id: string | null;
};

export function mapLearningMomentToRow(
  input: LearningMomentInput,
  userId: string
): LearningMomentRow {
  return {
    user_id: userId,
    kind: input.kind,
    context: input.context,
    shift: input.shift,
    result: input.result,
    duration: input.duration ?? null,
    target_role_id: input.targetRoleId ?? null,
  };
}
