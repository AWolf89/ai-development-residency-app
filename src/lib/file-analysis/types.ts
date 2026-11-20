/**
 * Shared types for File Analysis & Tagging (ADR-0020). Zod is the single source of truth and the
 * TS types are inferred from it, so the FSM's state/event unions, the analysis model-output
 * contract, and the validated `ProposedTag` are validated the same way everywhere. Pure data
 * shapes, free of Supabase and the AI SDK, so the router in machine.ts and the validator in
 * analyze.ts are unit-tested with plain inputs (Humble Object / Dependency Inversion, CLAUDE.md §3).
 *
 * Grounding mirrors Gap Classification (ADR-0011): the model may only reference candidate
 * `reference_items` by id, and a tag whose id was not a real candidate is dropped (analyze.ts) —
 * never trusted as-is. The model never invents a competency.
 */
import { z } from "zod";

/** The model's self-reported confidence for a proposed tag (stored as `confidence` text). */
export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export const confidenceSchema = z.enum(CONFIDENCE_LEVELS);
export type Confidence = z.infer<typeof confidenceSchema>;

/**
 * One `reference_items` row offered to the analysis as a tagging candidate. The closed-world
 * set: the model may tag the file only with items in this list (the Tech Fleet Skills &
 * Practices framework + O*NET — skills, practices, deliverables, milestones, …).
 */
export const candidateSchema = z.object({
  id: z.string().uuid(),
  source: z.string().min(1), // 'techfleet-spf' | 'onet'
  entityType: z.string().min(1), // 'skills' | 'practices' | 'deliverables' | 'milestones' | ...
  externalId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
});
export type Candidate = z.infer<typeof candidateSchema>;

/** What the model returns per tag: a pointer to a candidate by id, with confidence + rationale. */
export const modelTagSchema = z.object({
  referenceItemId: z.string().min(1),
  confidence: confidenceSchema,
  rationale: z.string().min(1).max(600),
});
export type ModelTag = z.infer<typeof modelTagSchema>;

/** The structured output of one analysis call (validated by Zod). */
export const analysisOutputSchema = z.object({
  /** A short summary of what the file is/evidences; folded into the evidence index on accept. */
  summary: z.string().min(1).max(1200),
  tags: z.array(modelTagSchema).max(30),
  /** Targeted questions to ask when the file is ambiguous; empty when the model is confident. */
  questions: z.array(z.string().min(1).max(300)).max(5),
});
export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

/** A validated, display-ready proposed tag (carries the candidate's identity from the real set). */
export const proposedTagSchema = z.object({
  referenceItemId: z.string().uuid(),
  source: z.string().min(1),
  entityType: z.string().min(1),
  externalId: z.string().min(1),
  name: z.string().min(1),
  confidence: confidenceSchema,
  rationale: z.string().min(1),
});
export type ProposedTag = z.infer<typeof proposedTagSchema>;

/** One targeted clarification question shown to the user. */
export const clarifyingQuestionSchema = z.object({ text: z.string().min(1) });
export type ClarifyingQuestion = z.infer<typeof clarifyingQuestionSchema>;

/** Why an analysis is paused — only ever the circuit breaker (no user-initiated pause). */
export const PAUSED_REASONS = ["circuit_breaker"] as const;
export const pausedReasonSchema = z.enum(PAUSED_REASONS);
export type PausedReason = z.infer<typeof pausedReasonSchema>;

// Counters shared by every state: the clarification loop bound (questionBudget), progress
// (askedCount), and the consecutive-failure counter that drives the circuit breaker.
const counters = {
  questionBudget: z.number().int().positive(),
  askedCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
};

/** The FSM state: a discriminated union on `status` (ADR-0020). */
export const analysisStateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("analyzing"),
    fileId: z.string().min(1),
    ...counters,
  }),
  z.object({
    status: z.literal("awaiting_clarification"),
    fileId: z.string().min(1),
    summary: z.string().min(1),
    tags: z.array(proposedTagSchema),
    questions: z.array(clarifyingQuestionSchema).min(1),
    ...counters,
  }),
  z.object({
    status: z.literal("awaiting_review"),
    fileId: z.string().min(1),
    summary: z.string().min(1),
    tags: z.array(proposedTagSchema),
    ...counters,
  }),
  z.object({
    status: z.literal("saving"),
    fileId: z.string().min(1),
    summary: z.string().min(1),
    tags: z.array(proposedTagSchema),
    ...counters,
  }),
  z.object({
    status: z.literal("paused"),
    fileId: z.string().min(1),
    reason: pausedReasonSchema,
    ...counters,
  }),
  z.object({
    status: z.literal("complete"),
    fileId: z.string().min(1),
    ...counters,
  }),
]);
export type AnalysisState = z.infer<typeof analysisStateSchema>;

/** The set of state names (for exhaustive handling and tests). */
export const ANALYSIS_STATUSES = [
  "analyzing",
  "awaiting_clarification",
  "awaiting_review",
  "saving",
  "paused",
  "complete",
] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

/** The FSM input events: the orchestrator's model result and the user's decisions. */
export const analysisEventSchema = z.discriminatedUnion("type", [
  // The model finished one analysis pass: validated tags + a summary + any questions.
  z.object({
    type: z.literal("analyzed"),
    summary: z.string().min(1),
    tags: z.array(proposedTagSchema),
    questions: z.array(clarifyingQuestionSchema),
  }),
  // The user answered the clarification questions; the orchestrator re-runs the analysis.
  z.object({
    type: z.literal("answers_submitted"),
    answers: z.array(z.string()),
  }),
  // The user declined to answer; propose whatever tags we already have.
  z.object({ type: z.literal("skip_clarification") }),
  z.object({ type: z.literal("llm_failed") }),
  z.object({ type: z.literal("accept") }),
  z.object({ type: z.literal("edit"), tags: z.array(proposedTagSchema) }),
  z.object({ type: z.literal("reject") }),
  z.object({ type: z.literal("saved") }),
  z.object({ type: z.literal("resume") }),
]);
export type AnalysisEvent = z.infer<typeof analysisEventSchema>;

/** A row destined for `file_reference_tags` (own-rows RLS, ADR-0020). */
export type FileReferenceTagRow = {
  user_id: string;
  file_id: string;
  reference_item_id: string;
  entity_type: string;
  confidence: Confidence;
  rationale: string;
};
