/**
 * Types for the thin orchestration layer (MVP 2 Phase 4, ADR-0026). The orchestrator SEQUENCES the
 * existing per-agent entry points — reconcile → propose → interview → review — with a review gate at
 * each step, and surfaces the Investigation Queue when the flow completes. It re-implements NO agent
 * reasoning; it only tracks workflow position. These are pure data shapes, free of Supabase, so the
 * router (machine.ts) is unit-tested with canned inputs (Humble Object / Dependency Inversion,
 * CLAUDE.md §3). The R1 supervisor row is ACTIVE for this module (durable state = a
 * discriminated-union + a pure `reduce(state, event)` router, never a bus/saga/LangGraph).
 */

/**
 * The HITL-gated agent steps the flow sequences, in order. Upload is the anchor (the file already
 * exists); the terminal "map" surface (Gap Check + Investigation Queue) is read-only and is NOT a
 * step here. Each step maps to one existing agent's PROPOSE entry point; the agent's own
 * accept-only SAVE action stays the HITL gate (AC2), untouched by the orchestrator.
 */
export const STEP_ORDER = [
  "reconcile", // reconciliation/orchestrator.ts: reconcileFile → saveReconciliationDecisions
  "propose", // proposal/orchestrator.ts: proposeFromFile → approveProposal
  "interview", // interview/orchestrator.ts: startTimelineInterview → acceptDraft (sub-FSM)
  "review", // reviewer/orchestrator.ts: startReview → acceptReview
] as const;
export type StepKey = (typeof STEP_ORDER)[number];

/**
 * One step's position in the flow:
 *  - `pending`         — not started.
 *  - `awaiting_review` — its propose entry point ran; waiting for the user's HITL decision.
 *  - `done`            — the agent's own save gate accepted and persisted.
 *  - `skipped`         — the user chose to skip this step.
 *  - `failed`          — the propose/advance threw; the run is resumable from here (AC4).
 */
export type StepStatus =
  "pending" | "awaiting_review" | "done" | "skipped" | "failed";

/** The per-step ledger: every step's current status. */
export type StepLedger = Record<StepKey, StepStatus>;

/** The run's overall position. `awaiting_review` and `failed` both wait for the user. */
export type OrchestrationStatus =
  | "running" // advancing: the cursor step is ready to be proposed
  | "awaiting_review" // the cursor step is proposed and waiting for the user's HITL decision
  | "failed" // a step failed; resumable from `failureStep`
  | "complete"; // every step is done/skipped — surface the Investigation Queue

/**
 * The durable, rehydratable workflow state (ADR-0026). A discriminated union over `status`, the
 * same pattern the interview session uses (ADR-0014), so the whole position persists in one row and
 * is rebuilt by `rehydrate`. It carries NO agent data — only position — so nothing is duplicated.
 */
export type OrchestrationState = {
  status: OrchestrationStatus;
  steps: StepLedger;
  /** The step in focus; null only when `complete`. */
  cursor: StepKey | null;
  /** The step that failed, so `resume` knows where to re-enter; null unless `failed`. */
  failureStep: StepKey | null;
};

/**
 * The events the pure router consumes. The server boundary (orchestrator.ts) performs the side
 * effect each one reports (calling an agent's propose entry point, observing its save) and feeds the
 * result back here. Invalid (state, event) pairs are ignored, never thrown (mirrors machine.ts).
 */
export type OrchestrationEvent =
  | { type: "step_proposed" } // the cursor step's propose entry point ran; await the user
  | { type: "step_accepted" } // the agent's own HITL save succeeded for the cursor step
  | { type: "step_skipped" } // the user skipped the cursor step
  | { type: "step_failed" } // the cursor step's propose/advance threw (resumable)
  | { type: "resume" }; // retry the failed step
