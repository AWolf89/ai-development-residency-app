/**
 * Shared types for Learning Moment Capture (ADR-0018). Zod is the single source of truth
 * for the `kind` enum; the rest are plain data shapes, free of Supabase and React, so
 * validation, mapping, and presentation are unit-tested with plain inputs (Humble Object,
 * CLAUDE.md §3).
 */
import { z } from "zod";

/**
 * The four learning-agility kinds (ADR-0018). Mirrors the DB CHECK on
 * `learning_moments.kind`. Each kind drives its own capture prompt and field labels.
 */
export const LEARNING_MOMENT_KINDS = [
  "speed",
  "insight",
  "pivot",
  "transfer",
] as const;
export const learningMomentKindSchema = z.enum(LEARNING_MOMENT_KINDS);
export type LearningMomentKind = z.infer<typeof learningMomentKindSchema>;

/**
 * A validated learning moment, ready to map to a row. `duration` is present only when it
 * was supplied (required for `speed` — enforced in validation.ts); `targetRoleId` is the
 * optional role this evidence is aimed at.
 */
export type LearningMomentInput = {
  kind: LearningMomentKind;
  context: string;
  shift: string;
  result: string;
  duration?: string;
  targetRoleId?: string | null;
};
