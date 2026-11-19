/**
 * Shared types for the Evidence Investigation Agent (ADR-0017). Zod is the single source of
 * truth and the TS types are inferred from it, so the FSM's state/event unions, the reflect
 * model-output contract, and the proposed `Finding` are validated the same way everywhere.
 * Pure data shapes, free of Supabase and the AI SDK, so the router in machine.ts is unit-tested
 * with plain inputs (Humble Object / Dependency Inversion, CLAUDE.md §3).
 *
 * Grounded-verdict vocabulary is reused from Gap Classification (ADR-0011): the model emits
 * only `met | partial | gap`, and a citation is a `{ source, id }` pointer the orchestrator
 * validates against really-retrieved snippets.
 */
import { z } from "zod";
import { modelVerdictSchema, modelCitationSchema } from "@/lib/gap/types";
import type { Citation } from "@/lib/rag/types";

/** The requirement under investigation (shape matches a `role_requirements` row's essentials). */
export const requirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});
export type Requirement = z.infer<typeof requirementSchema>;

/** A validated citation carried on a finding (shape matches rag `Citation`). */
export const citationSchema = z.object({
  source: z.string().min(1),
  id: z.string().min(1),
  title: z.string().min(1),
});
export type InvestigationCitation = z.infer<typeof citationSchema>;

/** The agent's self-reported confidence for a finding (stored as `confidence` text). */
export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export const confidenceSchema = z.enum(CONFIDENCE_LEVELS);
export type Confidence = z.infer<typeof confidenceSchema>;

/**
 * The structured output of one reflect call (validated by Zod). The model judges whether the
 * retrieved snippets substantiate the requirement and, when they do not, proposes a reformulated
 * query. Citations are `{ source, id }` pointers the orchestrator validates against what was
 * actually retrieved — never trusted as-is.
 */
export const reflectOutputSchema = z.object({
  sufficient: z.boolean(),
  /** A reformulated query to try next when `sufficient` is false; null when the model has none. */
  nextQuery: z.string().nullable(),
  verdict: modelVerdictSchema, // met | partial | gap
  rationale: z.string().min(1).max(600),
  citations: z.array(modelCitationSchema).max(20),
  confidence: confidenceSchema,
});
export type ReflectOutput = z.infer<typeof reflectOutputSchema>;

/**
 * A proposed finding shown to the user for review. Its `citations` are already validated
 * (carry titles from the retrieved sources), and `verdict` is the resolved verdict
 * (met | partial | gap — never `unknown`, which only applies when nothing was ever searched).
 */
export const findingSchema = z.object({
  requirementId: z.string().min(1),
  verdict: modelVerdictSchema,
  rationale: z.string().min(1),
  citations: z.array(citationSchema),
  confidence: confidenceSchema,
  /** How many searches this investigation spent before proposing the finding (provenance). */
  searchCount: z.number().int().nonnegative(),
});
export type Finding = z.infer<typeof findingSchema>;

/** Why an investigation is paused — only ever the circuit breaker (no user-initiated pause). */
export const PAUSED_REASONS = ["circuit_breaker"] as const;
export const pausedReasonSchema = z.enum(PAUSED_REASONS);
export type PausedReason = z.infer<typeof pausedReasonSchema>;

// Counters shared by every state: the loop bound (searchBudget), progress (searchCount), and
// the consecutive-failure counter that drives the circuit breaker.
const counters = {
  searchBudget: z.number().int().positive(),
  searchCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
};

/** The FSM state: a discriminated union on `status` (ADR-0017). */
export const investigationStateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("planning"),
    requirement: requirementSchema,
    ...counters,
  }),
  z.object({
    status: z.literal("searching"),
    requirement: requirementSchema,
    query: z.string().min(1),
    ...counters,
  }),
  z.object({
    status: z.literal("reflecting"),
    requirement: requirementSchema,
    query: z.string().min(1),
    ...counters,
  }),
  z.object({
    status: z.literal("exhausted"),
    requirement: requirementSchema,
    ...counters,
  }),
  z.object({
    status: z.literal("awaiting_review"),
    requirement: requirementSchema,
    finding: findingSchema,
    ...counters,
  }),
  z.object({
    status: z.literal("saving"),
    requirement: requirementSchema,
    finding: findingSchema,
    ...counters,
  }),
  z.object({
    status: z.literal("paused"),
    requirement: requirementSchema,
    reason: pausedReasonSchema,
    query: z.string().min(1),
    ...counters,
  }),
  z.object({
    status: z.literal("complete"),
    requirement: requirementSchema,
    ...counters,
  }),
]);
export type InvestigationState = z.infer<typeof investigationStateSchema>;

/** The set of state names (for exhaustive handling and tests). */
export const INVESTIGATION_STATUSES = [
  "planning",
  "searching",
  "reflecting",
  "exhausted",
  "awaiting_review",
  "saving",
  "paused",
  "complete",
] as const;
export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number];

/** The FSM input events: the orchestrator's IO results and the user's review decision. */
export const investigationEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("search_planned"), query: z.string().min(1) }),
  z.object({ type: z.literal("retrieved") }),
  z.object({ type: z.literal("substantiated"), finding: findingSchema }),
  z.object({
    type: z.literal("insufficient"),
    nextQuery: z.string().nullable(),
  }),
  z.object({ type: z.literal("finding_ready"), finding: findingSchema }),
  z.object({ type: z.literal("llm_failed") }),
  z.object({ type: z.literal("accept") }),
  z.object({ type: z.literal("edit"), finding: findingSchema }),
  z.object({ type: z.literal("reject") }),
  z.object({ type: z.literal("saved") }),
  z.object({ type: z.literal("resume") }),
]);
export type InvestigationEvent = z.infer<typeof investigationEventSchema>;

/** Export the validated-citation helper type under the rag name for orchestrator reuse. */
export type { Citation };
