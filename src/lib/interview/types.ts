/**
 * Shared types for the Reasoning Interview (ADR-0013). Zod is the single source of truth and
 * the TS types are inferred from it, so the FSM's state/event unions, the grounded-question
 * shape, and the CDM paraphrase draft are validated the same way everywhere (and can be used
 * to rehydrate a persisted session — ADR-0014). Pure data shapes, free of Supabase and the AI
 * SDK, so the router in machine.ts is unit-tested with plain inputs (Humble Object, CLAUDE.md §3).
 */
import { z } from "zod";
import { timelineSchema } from "./timeline";

/** A retrieved source the question was grounded in (shape matches rag `Citation`). */
export const groundingCitationSchema = z.object({
  source: z.string().min(1),
  id: z.string().min(1),
  title: z.string().min(1),
});
export type GroundingCitation = z.infer<typeof groundingCitationSchema>;

/** One grounded question: the text to ask + the snippet it cites (null = open CDM question). */
export const groundedQuestionSchema = z.object({
  text: z.string().min(1),
  citation: groundingCitationSchema.nullable(),
});
export type GroundedQuestion = z.infer<typeof groundedQuestionSchema>;

/**
 * The CDM draft a paraphrase produces — the decision-record fields in the user's own words.
 * Mirrors the required/optional split of `decision_records` validation: title/situation/
 * decision/outcome are required, cue/why are optional (nullable so the model emits them
 * explicitly as the structured-output contract). `source` is stamped by the orchestrator.
 */
export const cdmDraftSchema = z.object({
  title: z.string().trim().min(1),
  situation: z.string().trim().min(1),
  cue: z.string().trim().min(1).nullable(),
  decision: z.string().trim().min(1),
  why: z.string().trim().min(1).nullable(),
  outcome: z.string().trim().min(1),
});
export type CdmDraft = z.infer<typeof cdmDraftSchema>;

/** Why an interview is paused: the user asked, or the circuit breaker tripped. */
export const PAUSED_REASONS = ["user", "circuit_breaker"] as const;
export const pausedReasonSchema = z.enum(PAUSED_REASONS);
export type PausedReason = z.infer<typeof pausedReasonSchema>;

// Counters shared by every state: the loop bound (budget), progress (askedCount), and the
// consecutive-failure counter that drives the circuit breaker.
const counters = {
  questionBudget: z.number().int().positive(),
  askedCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
};

/** The FSM state: a discriminated union on `status` (ADR-0013, timeline states ADR-0021). */
export const interviewStateSchema = z.discriminatedUnion("status", [
  // Pre-interview timeline phase (ADR-0021): draft from files, then let the user correct it.
  z.object({ status: z.literal("drafting_timeline"), ...counters }),
  z.object({
    status: z.literal("awaiting_timeline"),
    timeline: timelineSchema,
    ...counters,
  }),
  z.object({ status: z.literal("planning"), ...counters }),
  z.object({ status: z.literal("asking"), ...counters }),
  z.object({
    status: z.literal("awaiting_answer"),
    question: groundedQuestionSchema,
    // Set when a conclusion answer was sent back for a re-ask (ADR-0021); UI coaching only.
    redirectHint: z.string().optional(),
    ...counters,
  }),
  z.object({
    status: z.literal("paraphrasing"),
    question: groundedQuestionSchema,
    answer: z.string(),
    ...counters,
  }),
  z.object({
    status: z.literal("awaiting_confirmation"),
    question: groundedQuestionSchema,
    answer: z.string(),
    draft: cdmDraftSchema,
    ...counters,
  }),
  z.object({
    status: z.literal("saving"),
    question: groundedQuestionSchema,
    answer: z.string(),
    draft: cdmDraftSchema,
    ...counters,
  }),
  z.object({
    status: z.literal("paused"),
    reason: pausedReasonSchema,
    ...counters,
  }),
  z.object({ status: z.literal("complete"), ...counters }),
]);
export type InterviewState = z.infer<typeof interviewStateSchema>;

/** The set of state names (for exhaustive handling and tests). */
export const INTERVIEW_STATUSES = [
  "drafting_timeline",
  "awaiting_timeline",
  "planning",
  "asking",
  "awaiting_answer",
  "paraphrasing",
  "awaiting_confirmation",
  "saving",
  "paused",
  "complete",
] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

/** The FSM input events: user actions and the orchestrator's IO results. */
export const interviewEventSchema = z.discriminatedUnion("type", [
  // Timeline phase (ADR-0021): the drafted timeline, then the user's confirmed correction.
  z.object({ type: z.literal("timeline_drafted"), timeline: timelineSchema }),
  z.object({ type: z.literal("timeline_confirmed") }),
  z.object({ type: z.literal("plan_ready") }),
  z.object({
    type: z.literal("question_ready"),
    question: groundedQuestionSchema,
  }),
  // A conclusion was given instead of an account of events: re-ask without spending budget.
  z.object({ type: z.literal("needs_redirect"), hint: z.string() }),
  z.object({ type: z.literal("answer_submitted"), answer: z.string() }),
  z.object({ type: z.literal("answer_skipped") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("paraphrase_ready"), draft: cdmDraftSchema }),
  z.object({ type: z.literal("llm_failed") }),
  z.object({ type: z.literal("accept") }),
  z.object({ type: z.literal("edit") }),
  z.object({ type: z.literal("reject") }),
  z.object({ type: z.literal("saved") }),
  z.object({ type: z.literal("resume") }),
]);
export type InterviewEvent = z.infer<typeof interviewEventSchema>;
