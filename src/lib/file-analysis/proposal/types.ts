/**
 * Types for Auto-propose project & evidence records (MVP 2 Phase 2, ADR-0020 extended;
 * record/claim model ADR-0022; HITL isolation ADR-0013).
 *
 * This is the "ingestion becomes discovery" step: after a file is analysed, the agent proposes
 * a **project** and a set of **evidence records** (each grounded in a cited passage of the file)
 * for the user to confirm, edit, or reject. Nothing is written until the user approves.
 *
 * Zod is the single source of truth; the TS types are inferred from it, so the model-output
 * contract, the validated proposal, and the FSM's state/event unions are validated the same way
 * everywhere. Pure data shapes, free of Supabase and the AI SDK, so the router (machine.ts) and
 * the grounding validator (validate.ts) are unit-tested with plain inputs (Humble Object /
 * Dependency Inversion, CLAUDE.md §3).
 *
 * Grounding mirrors File Analysis tagging (ADR-0020) and the reviewer (ADR-0016): a proposed
 * record is trusted only when it carries a non-empty citation (`location`) into the file — the
 * model never gets to assert an evidence record with no supporting passage.
 */
import { z } from "zod";
import { CONTRIBUTIONS } from "@/lib/provenance/types";

/**
 * Output-token budget for one proposal call. A confident proposal is the app's largest structured
 * output — a full project plus several multi-field evidence records — so the default 1,500-token
 * cap truncates the reply mid-JSON and the parse fails (this was GF1: answering the clarification
 * questions errored out while "Skip", which makes no second call, worked). 4,000 is the ceiling the
 * LLM_CONFIG runtime-cap test enforces, so this stays within the mandated bound (R3 §1).
 */
export const PROPOSAL_MAX_OUTPUT_TOKENS = 4_000;

/** The model's self-reported confidence for a proposed record (display only, never a gate). */
export const PROPOSAL_CONFIDENCE = ["low", "medium", "high"] as const;
export const proposalConfidenceSchema = z.enum(PROPOSAL_CONFIDENCE);
export type ProposalConfidence = z.infer<typeof proposalConfidenceSchema>;

// A required free-text field: non-empty once trimmed.
const requiredText = z.string().trim().min(1);
// An optional free-text field: a blank value becomes undefined so the mapper stores NULL.
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();
// Attribution is optional and is NEVER defaulted to "individual" (ADR-0022 §5.2).
const optionalContribution = z.preprocess(
  (value) =>
    typeof value === "string" && value.length > 0 ? value : undefined,
  z.enum(CONTRIBUTIONS).optional()
);

/**
 * What the model proposes for the project the file belongs to. `null`/absent fields mean the
 * model could not read them from the file — they are not invented. `name` is required for a
 * project to be proposed at all; an ambiguous file yields `project: null` + questions instead.
 */
export const modelProjectSchema = z.object({
  name: requiredText.max(120),
  organisation: optionalText,
  startedOn: optionalText, // ISO date; validated structurally in validate.ts
  endedOn: optionalText,
  summary: optionalText,
});
export type ModelProject = z.infer<typeof modelProjectSchema>;

/**
 * One proposed evidence record. `location` is the citation — the passage of the file that backs
 * the record — and is REQUIRED: a record with no supporting passage is not grounded (AC2).
 * `source` is always "artifact" (the record is backed by the uploaded file), so the model does
 * not choose it. `contribution` is optional and never defaulted (team work is not shown as solo).
 */
export const modelRecordSchema = z.object({
  title: requiredText.max(200),
  situation: requiredText,
  cue: optionalText,
  decision: requiredText,
  why: optionalText,
  outcome: requiredText,
  contribution: optionalContribution,
  /**
   * The citation — the passage of the file that backs the record. Optional at the model level so
   * one uncited record does not fail the whole parse; grounding (validate.ts) then DROPS any
   * record without a citation, so an uncited record is never proposed (AC2).
   */
  location: z.string().trim().max(600).optional(),
  confidence: proposalConfidenceSchema,
});
export type ModelRecord = z.infer<typeof modelRecordSchema>;

/** The structured output of one proposal call (validated by Zod before it reaches the FSM). */
export const proposalOutputSchema = z.object({
  /** False when the file does not clearly describe a single project (AC4) — ask, don't invent. */
  projectClear: z.boolean(),
  project: modelProjectSchema.nullable(),
  records: z.array(modelRecordSchema).max(20),
  /** Targeted questions when the file is ambiguous; empty when the model is confident. */
  questions: z.array(z.string().trim().min(1).max(300)).max(5),
});
export type ProposalOutput = z.infer<typeof proposalOutputSchema>;

/** A validated, display-ready proposed project (maps 1:1 to `ProjectInput`). */
export const proposedProjectSchema = z.object({
  name: z.string().min(1),
  organisation: z.string().nullable(),
  startedOn: z.string().nullable(),
  endedOn: z.string().nullable(),
  summary: z.string().nullable(),
});
export type ProposedProject = z.infer<typeof proposedProjectSchema>;

/** A validated, display-ready proposed evidence record (maps to `DecisionRecordInput` + citation). */
export const proposedRecordSchema = z.object({
  title: z.string().min(1),
  situation: z.string().min(1),
  cue: z.string().nullable(),
  decision: z.string().min(1),
  why: z.string().nullable(),
  outcome: z.string().min(1),
  contribution: z.enum(CONTRIBUTIONS).nullable(),
  /** The cited supporting passage; written to `evidence_links.location` (ADR-0022 §5.2). */
  location: z.string().min(1),
  confidence: proposalConfidenceSchema,
});
export type ProposedRecord = z.infer<typeof proposedRecordSchema>;

/** One targeted clarification question shown to the user. */
export const proposalQuestionSchema = z.object({ text: z.string().min(1) });
export type ProposalQuestion = z.infer<typeof proposalQuestionSchema>;

/** Why a proposal run is paused — only ever the circuit breaker (no user-initiated pause). */
export const PROPOSAL_PAUSED_REASONS = ["circuit_breaker"] as const;
export const proposalPausedReasonSchema = z.enum(PROPOSAL_PAUSED_REASONS);
export type ProposalPausedReason = z.infer<typeof proposalPausedReasonSchema>;

// Counters shared by every state: the clarification loop bound, progress, and the
// consecutive-failure counter that drives the circuit breaker.
const counters = {
  questionBudget: z.number().int().positive(),
  askedCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
};

/** What a completed persist produced, for the UI and idempotency. */
export const proposalResultSchema = z.object({
  projectId: z.string().nullable(),
  recordIds: z.array(z.string()),
});
export type ProposalResult = z.infer<typeof proposalResultSchema>;

/** One grounded proposal pass, ready for the HITL review UI. */
export type FileProposal = {
  projectClear: boolean;
  project: ProposedProject | null;
  records: ProposedRecord[];
  questions: ProposalQuestion[];
  /** How many model records were dropped as ungrounded (for the UI note). */
  droppedRecords: number;
};

/** The FSM state: a discriminated union on `status`. Mirrors the File Analysis FSM (ADR-0020). */
export const proposalStateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("proposing"),
    fileId: z.string().min(1),
    ...counters,
  }),
  z.object({
    status: z.literal("awaiting_clarification"),
    fileId: z.string().min(1),
    project: proposedProjectSchema.nullable(),
    records: z.array(proposedRecordSchema),
    questions: z.array(proposalQuestionSchema).min(1),
    ...counters,
  }),
  z.object({
    status: z.literal("awaiting_proposal_review"),
    fileId: z.string().min(1),
    project: proposedProjectSchema.nullable(),
    records: z.array(proposedRecordSchema),
    ...counters,
  }),
  z.object({
    status: z.literal("persisting"),
    fileId: z.string().min(1),
    project: proposedProjectSchema.nullable(),
    records: z.array(proposedRecordSchema),
    ...counters,
  }),
  z.object({
    status: z.literal("paused"),
    fileId: z.string().min(1),
    reason: proposalPausedReasonSchema,
    ...counters,
  }),
  z.object({
    status: z.literal("complete"),
    fileId: z.string().min(1),
    result: proposalResultSchema.nullable(),
    ...counters,
  }),
]);
export type ProposalState = z.infer<typeof proposalStateSchema>;

/** The set of state names (for exhaustive handling and tests). */
export const PROPOSAL_STATUSES = [
  "proposing",
  "awaiting_clarification",
  "awaiting_proposal_review",
  "persisting",
  "paused",
  "complete",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/** The FSM input events: the model result and the user's decisions. */
export const proposalEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("proposed"),
    project: proposedProjectSchema.nullable(),
    records: z.array(proposedRecordSchema),
    questions: z.array(proposalQuestionSchema),
  }),
  z.object({
    type: z.literal("answers_submitted"),
    answers: z.array(z.string()),
  }),
  z.object({ type: z.literal("skip_clarification") }),
  z.object({ type: z.literal("llm_failed") }),
  z.object({ type: z.literal("approve") }),
  z.object({
    type: z.literal("edit"),
    project: proposedProjectSchema.nullable(),
    records: z.array(proposedRecordSchema),
  }),
  z.object({ type: z.literal("reject") }),
  z.object({ type: z.literal("persisted"), result: proposalResultSchema }),
  z.object({ type: z.literal("resume") }),
]);
export type ProposalEvent = z.infer<typeof proposalEventSchema>;
