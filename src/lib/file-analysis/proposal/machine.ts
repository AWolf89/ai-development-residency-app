/**
 * The Auto-propose finite-state machine (MVP 2 Phase 2) — a pure `reduce(state, event)` router
 * with no side effects. The orchestrator runs the model call, grounds the output, and performs
 * the deterministic project/record writes, then feeds each result back here as the next event.
 * All the safety properties live in this one module so they are auditable and unit-tested:
 *
 *   - HITL isolation (R1 §3.4, ADR-0013): `persisting` is reachable ONLY from
 *     `awaiting_proposal_review` on `approve`, so proposing a project + records and writing them
 *     can never share a step. `edit` and `reject` can never reach `persisting` (AC3).
 *   - Ask-don't-guess (AC4): an ambiguous file (the model returned questions, typically because
 *     no single project is clear) routes to `awaiting_clarification` instead of inventing one.
 *   - Loop bound (R1 §3.5): the `budgetReached` guard stops asking once the question budget is
 *     spent; the budget is clamped to a hard cap so no configuration can exceed it.
 *   - Circuit breaker + failure safety (R1 §3.5, AC5): consecutive `llm_failed` events trip the
 *     run to `paused` instead of retrying without end; a failure never persists anything.
 *
 * Deliberately mirrors `src/lib/file-analysis/machine.ts` so the two FSMs read identically.
 */
import type { ProposalEvent, ProposalState } from "./types";

/** Never ask more than this many clarification questions, whatever the budget asks for. */
export const QUESTION_HARD_CAP = 5;
/** Default number of clarification rounds when the caller does not set one. */
export const DEFAULT_QUESTION_BUDGET = 3;
/** Consecutive model failures that trip the circuit breaker. */
export const BREAKER_THRESHOLD = 3;

type Counters = Pick<
  ProposalState,
  "questionBudget" | "askedCount" | "failureCount"
>;

/** Start a fresh proposal run in `proposing`, clamping the budget to [1, hard cap]. */
export function createProposal(opts: {
  fileId: string;
  questionBudget?: number;
}): ProposalState {
  const requested = opts.questionBudget ?? DEFAULT_QUESTION_BUDGET;
  const questionBudget = Math.min(
    QUESTION_HARD_CAP,
    Math.max(1, Math.floor(requested))
  );
  return {
    status: "proposing",
    fileId: opts.fileId,
    questionBudget,
    askedCount: 0,
    failureCount: 0,
  };
}

/** True once as many clarification rounds have been asked as the budget allows. */
export function budgetReached(state: Counters): boolean {
  return state.askedCount >= state.questionBudget;
}

/** A model failure during `proposing`: count it and trip the breaker at the cap. */
function onFailure(
  state: ProposalState,
  fileId: string,
  c: Counters
): ProposalState {
  const failureCount = c.failureCount + 1;
  if (failureCount >= BREAKER_THRESHOLD) {
    return {
      status: "paused",
      fileId,
      reason: "circuit_breaker",
      questionBudget: c.questionBudget,
      askedCount: c.askedCount,
      failureCount,
    };
  }
  return { ...state, failureCount };
}

/**
 * The pure transition function. Any (state, event) pair that is not an allowed transition
 * returns the same state object unchanged — invalid events are ignored, never thrown.
 */
export function reduce(
  state: ProposalState,
  event: ProposalEvent
): ProposalState {
  const fileId = state.fileId;
  const c: Counters = {
    questionBudget: state.questionBudget,
    askedCount: state.askedCount,
    failureCount: state.failureCount,
  };

  switch (state.status) {
    case "proposing":
      if (event.type === "proposed") {
        // Ask-don't-guess: when the file is ambiguous (questions returned) and the budget still
        // allows, pause to ask instead of proposing a guess. Otherwise present whatever project
        // and records survived grounding (either may be empty — never forced).
        if (event.questions.length > 0 && !budgetReached(c)) {
          return {
            status: "awaiting_clarification",
            fileId,
            project: event.project,
            records: event.records,
            questions: event.questions,
            questionBudget: c.questionBudget,
            askedCount: c.askedCount + 1,
            failureCount: 0, // a successful pass resets the breaker
          };
        }
        return {
          status: "awaiting_proposal_review",
          fileId,
          project: event.project,
          records: event.records,
          questionBudget: c.questionBudget,
          askedCount: c.askedCount,
          failureCount: 0,
        };
      }
      if (event.type === "llm_failed") return onFailure(state, fileId, c);
      return state;

    case "awaiting_clarification":
      // The user answered → re-run the proposal with their answers (orchestrator holds them).
      if (event.type === "answers_submitted") {
        return { status: "proposing", fileId, ...c };
      }
      // The user declined to answer → present the proposal we already have.
      if (event.type === "skip_clarification") {
        return {
          status: "awaiting_proposal_review",
          fileId,
          project: state.project,
          records: state.records,
          ...c,
        };
      }
      return state;

    case "awaiting_proposal_review":
      // HITL gate: approve is the ONLY edge into `persisting` (AC3).
      if (event.type === "approve") {
        return {
          status: "persisting",
          fileId,
          project: state.project,
          records: state.records,
          ...c,
        };
      }
      // Edit adjusts the proposed project/records and re-enters the review gate (no write).
      if (event.type === "edit") {
        return {
          status: "awaiting_proposal_review",
          fileId,
          project: event.project,
          records: event.records,
          ...c,
        };
      }
      if (event.type === "reject")
        return { status: "complete", fileId, result: null, ...c };
      return state;

    case "persisting":
      if (event.type === "persisted")
        return { status: "complete", fileId, result: event.result, ...c };
      return state;

    case "paused":
      if (event.type === "resume") return { status: "proposing", fileId, ...c };
      return state;

    case "complete":
      return state; // terminal
  }
}
