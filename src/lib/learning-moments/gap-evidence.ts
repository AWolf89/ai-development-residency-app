/**
 * Pure relevance logic for surfacing learning-agility evidence next to true gaps in the Gap
 * Check (card: Learning Evidence in the Gap Check). Given the user's learning moments and the
 * role being checked, it selects and orders the ones worth showing as evidence a gap can be
 * closed. Deliberately deterministic — no AI, no fabrication: a moment is "relevant" only when
 * the user already tagged it to this role or left it general (`target_role_id` null). Free of
 * Supabase and React so it is unit-tested with plain inputs (Humble Object, CLAUDE.md §3).
 */
import type { LearningMomentKind } from "./types";

/** A learning moment as read for display (the write row plus id/created_at). */
export type LearningMomentRecord = {
  id: string;
  kind: LearningMomentKind;
  context: string;
  shift: string;
  result: string;
  duration: string | null;
  targetRoleId: string | null;
  createdAt: string;
};

/** True when a moment is relevant to this role: tagged to it, or general (no role). */
function isRelevant(moment: LearningMomentRecord, roleId: string): boolean {
  return moment.targetRoleId === roleId || moment.targetRoleId === null;
}

/**
 * The learning moments to show beside this role's gaps, best first:
 *   1. role-matched before general (null-role) evidence,
 *   2. `speed` ("how fast you learned") before the other kinds,
 *   3. newest before older.
 * Moments tagged to a *different* role are dropped — they are not evidence for this one.
 */
export function selectGapLearningEvidence(
  moments: LearningMomentRecord[],
  roleId: string
): LearningMomentRecord[] {
  const rank = (m: LearningMomentRecord): [number, number, number] => [
    m.targetRoleId === roleId ? 0 : 1,
    m.kind === "speed" ? 0 : 1,
    -Date.parse(m.createdAt),
  ];
  return moments
    .filter((m) => isRelevant(m, roleId))
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
    });
}
