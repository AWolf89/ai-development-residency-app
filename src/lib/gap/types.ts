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

/**
 * The structured output contract for one classification call (validated by Zod).
 *
 * Citations are parsed TOLERANTLY (ADR-0011 fail-safe). The model sometimes returns a
 * citation with a missing/blank `id` — most often when it is asked to echo a file's
 * filename-as-id (evidence_hybrid_search uses the filename as `ref_id`), unlike the clean
 * O*NET codes it cites reliably. Failing the whole structured parse on that would — after
 * the correction budget is spent — throw and 500 the entire gap check (every requirement),
 * which is exactly what happened in production. Instead we DROP malformed citation entries
 * here and keep the well-formed ones. A met/partial verdict left with no valid citation is
 * then downgraded to `gap` by resolveVerdict (classify.ts): the system under-claims, never
 * over-claims, preserving the closed-RAG honesty guarantee.
 */
export const gapModelOutputSchema = z.object({
  verdict: modelVerdictSchema,
  rationale: z.string().min(1).max(600),
  citations: z
    .array(z.unknown())
    .catch([]) // citations missing or not an array → treat as none, don't fail the call
    .transform((arr) =>
      arr.slice(0, 50).flatMap((c) => {
        const parsed = modelCitationSchema.safeParse(c);
        return parsed.success ? [parsed.data] : [];
      })
    ),
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
