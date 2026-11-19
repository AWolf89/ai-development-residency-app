/**
 * Shared types for the Reviewer Agent Check (ADR-0016). Zod is the single source of truth and
 * the TS types are inferred from it, so the FSM's state/event unions, the per-dimension model
 * output, and a resolved review flag are validated the same way everywhere. Pure data shapes,
 * free of Supabase and the AI SDK, so the router in machine.ts and the grounding logic in
 * grounding.ts are unit-tested with plain inputs (Humble Object, CLAUDE.md §3).
 */
import { z } from "zod";
import type { Citation } from "@/lib/rag/types";

/** The fixed review dimensions (ADR-0016). Order is the order the loop runs them. */
export const REVIEW_DIMENSIONS = [
  "support",
  "accuracy",
  "specificity",
  "completeness",
] as const;
export const reviewDimensionSchema = z.enum(REVIEW_DIMENSIONS);
export type ReviewDimension = z.infer<typeof reviewDimensionSchema>;

/** Dimensions that judge the record against retrieved evidence (need a retrieval call). */
export const EVIDENCE_DIMENSIONS = ["support", "accuracy"] as const;
/** Dimensions that judge the record text itself (no retrieval, no evidence citation). */
export const INTRINSIC_DIMENSIONS = ["specificity", "completeness"] as const;

/** True when a dimension is evidence-grounded (needs retrieval before the model call). */
export function isEvidenceDimension(d: ReviewDimension): boolean {
  return d === "support" || d === "accuracy";
}

/** How serious a flag is. `serious` is reserved for grounded, high-impact issues. */
export const FLAG_SEVERITIES = ["info", "caution", "serious"] as const;
export const flagSeveritySchema = z.enum(FLAG_SEVERITIES);
export type FlagSeverity = z.infer<typeof flagSeveritySchema>;

/** The user's disposition of a flag. New flags start `pending`; accept promotes them. */
export const FLAG_DISPOSITIONS = ["pending", "accepted", "dismissed"] as const;
export const flagDispositionSchema = z.enum(FLAG_DISPOSITIONS);
export type FlagDisposition = z.infer<typeof flagDispositionSchema>;

/** Which part of the record a flag is about: a CDM field, or the record as a whole. */
export const REVIEW_TARGET_FIELDS = [
  "title",
  "situation",
  "cue",
  "decision",
  "why",
  "outcome",
  "record",
] as const;
export const reviewTargetFieldSchema = z.enum(REVIEW_TARGET_FIELDS);
export type ReviewTargetField = z.infer<typeof reviewTargetFieldSchema>;

/** A validated citation (same shape as the RAG `Citation`): source + id + title. */
export const citationSchema = z.object({
  source: z.string().min(1),
  id: z.string().min(1),
  title: z.string().min(1),
});

/** A citation the model returns: source + id pointing into the retrieved sources (no title). */
export const modelCitationSchema = z.object({
  source: z.string().min(1),
  id: z.string().min(1),
});
export type ModelCitation = z.infer<typeof modelCitationSchema>;

/** One flag the model proposes for a single dimension (validated by Zod before use). */
export const modelFlagSchema = z.object({
  severity: flagSeveritySchema,
  targetField: reviewTargetFieldSchema,
  message: z.string().min(1).max(600),
  citations: z.array(modelCitationSchema).max(20),
});
export type ModelFlag = z.infer<typeof modelFlagSchema>;

/** The structured output contract for one per-dimension review call. */
export const reviewModelOutputSchema = z.object({
  flags: z.array(modelFlagSchema).max(20),
});
export type ReviewModelOutput = z.infer<typeof reviewModelOutputSchema>;

/**
 * A resolved review flag: the model's proposal after grounding (citations validated, an uncited
 * overstatement downgraded), carried in FSM state and persisted on accept. `citations` carries
 * the title from the retrieved source and is empty for intrinsic / absence flags.
 */
export const reviewFlagSchema = z.object({
  dimension: reviewDimensionSchema,
  severity: flagSeveritySchema,
  targetField: reviewTargetFieldSchema,
  message: z.string().min(1),
  citations: z.array(citationSchema),
  disposition: flagDispositionSchema,
});
export type ReviewFlag = z.infer<typeof reviewFlagSchema> & {
  citations: Citation[];
};

/** Why a review is paused: the user asked, or the circuit breaker tripped. */
export const REVIEW_PAUSED_REASONS = ["user", "circuit_breaker"] as const;
export const reviewPausedReasonSchema = z.enum(REVIEW_PAUSED_REASONS);
export type ReviewPausedReason = z.infer<typeof reviewPausedReasonSchema>;

// Counters shared by every state: the loop bound (budget), progress (checksDone), and the
// consecutive-failure counter that drives the circuit breaker.
const counters = {
  checkBudget: z.number().int().positive(),
  checksDone: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
};

const flagList = z.array(reviewFlagSchema);

/** The FSM state: a discriminated union on `status` (ADR-0016). */
export const reviewStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("planning"), ...counters }),
  z.object({ status: z.literal("reviewing"), flags: flagList, ...counters }),
  z.object({
    status: z.literal("awaiting_review"),
    flags: flagList,
    ...counters,
  }),
  z.object({ status: z.literal("saving"), flags: flagList, ...counters }),
  z.object({
    status: z.literal("paused"),
    reason: reviewPausedReasonSchema,
    flags: flagList,
    ...counters,
  }),
  z.object({ status: z.literal("discarded"), ...counters }),
  z.object({ status: z.literal("complete"), flags: flagList, ...counters }),
]);
export type ReviewState = z.infer<typeof reviewStateSchema>;

/** The set of state names (for exhaustive handling and tests). */
export const REVIEW_STATUSES = [
  "planning",
  "reviewing",
  "awaiting_review",
  "saving",
  "paused",
  "discarded",
  "complete",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** The FSM input events: user actions and the orchestrator's IO results. */
export const reviewEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("plan_ready") }),
  z.object({ type: z.literal("flags_ready"), flags: flagList }),
  z.object({ type: z.literal("llm_failed") }),
  z.object({ type: z.literal("accept") }),
  z.object({ type: z.literal("edit"), flags: flagList }),
  z.object({ type: z.literal("reject") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("saved") }),
]);
export type ReviewEvent = z.infer<typeof reviewEventSchema>;
