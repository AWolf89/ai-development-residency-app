/**
 * Shared types for Gap Classification (build order 10). Pure data shapes with Zod as the
 * single source of truth, free of Supabase and the AI SDK so the decision logic can be
 * unit-tested with plain inputs (Humble Object / Dependency Inversion, CLAUDE.md §3).
 * See docs/design/gap-classification.md and ADR-0011.
 */
import { z } from "zod";
import type { Citation } from "@/lib/rag/types";

/** The four gap verdicts. `unknown` is set by our code when no evidence is retrieved. */
export const GAP_VERDICTS = ["met", "partial", "gap", "unknown"] as const;
export const gapVerdictSchema = z.enum(GAP_VERDICTS);
export type GapVerdict = z.infer<typeof gapVerdictSchema>;

/** The verdicts the model may emit — never `unknown` (ADR-0011: that stays out of its hands). */
export const MODEL_VERDICTS = ["met", "partial", "gap"] as const;
export const modelVerdictSchema = z.enum(MODEL_VERDICTS);
export type ModelVerdict = z.infer<typeof modelVerdictSchema>;

/** A citation the model returns: source + id pointing into the retrieved sources. */
export const modelCitationSchema = z.object({
  source: z.string().min(1),
  id: z.string().min(1),
});
export type ModelCitation = z.infer<typeof modelCitationSchema>;

/** The structured output contract for one classification call (validated by Zod). */
export const gapModelOutputSchema = z.object({
  verdict: modelVerdictSchema,
  rationale: z.string().min(1).max(600),
  citations: z.array(modelCitationSchema).max(20),
});
export type GapModelOutput = z.infer<typeof gapModelOutputSchema>;

/** The final per-requirement classification result. */
export type RequirementGap = {
  requirementId: string;
  requirementText: string;
  verdict: GapVerdict;
  rationale: string;
  /** Validated citations (carry the title from the retrieved source); empty for unknown/gap. */
  citations: Citation[];
  evidenceFound: boolean;
  referenceUsed: boolean;
  /** Model calls spent; 0 when short-circuited to `unknown` without a call. */
  modelAttempts: number;
  truncated: boolean;
};

/** A row destined for `requirement_gap_assessments` (own-rows RLS). */
export type AssessmentRow = {
  user_id: string;
  role_requirement_id: string;
  target_role_id: string;
  verdict: GapVerdict;
  rationale: string;
  citations: Citation[]; // jsonb
  evidence_found: boolean;
  model_used: string;
  prompt_version: string;
};
