/**
 * The File Analysis finite-state machine (ADR-0020) — a pure `reduce(state, event)` router with
 * no side effects. The orchestrator performs text extraction, the vision/analysis model calls,
 * tag validation, and DB writes, then feeds each result back here as the next event. All the
 * safety properties live in this one module so they are auditable and unit-tested to 100%:
 *
 *   - Ask-don't-guess + HITL isolation (R1 §3.4): `saving` is reachable ONLY from
 *     `awaiting_review` on `accept`, so proposing tags and saving them can never share a step;
 *     and an ambiguous file routes to `awaiting_clarification` (ask) instead of guessing.
 *   - Loop bound (R1 §3.5): the `budgetReached` guard stops asking once the question budget is
 *     spent; the budget is clamped to a hard cap so no configuration can exceed it.
 *   - Circuit breaker (R1 §3.5): consecutive `llm_failed` events trip the loop to `paused`
 *     instead of retrying without end.
 */
import type { AnalysisEvent, AnalysisState } from "./types";

/** Never ask more than this many clarification questions, whatever the budget asks for. */
export const QUESTION_HARD_CAP = 5;
/** Default number of clarification rounds when the caller does not set one. */
export const DEFAULT_QUESTION_BUDGET = 3;
/** Consecutive model failures that trip the circuit breaker. */
export const BREAKER_THRESHOLD = 3;

type Counters = Pick<
  AnalysisState,
  "questionBudget" | "askedCount" | "failureCount"
>;

/** Start a fresh analysis in `analyzing`, clamping the budget to [1, hard cap]. */
export function createAnalysis(opts: {
  fileId: string;
  questionBudget?: number;
}): AnalysisState {
  const requested = opts.questionBudget ?? DEFAULT_QUESTION_BUDGET;
  const questionBudget = Math.min(
    QUESTION_HARD_CAP,
    Math.max(1, Math.floor(requested))
  );
  return {
    status: "analyzing",
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

/** A model failure during `analyzing`: count it and trip the breaker at the cap. */
function onFailure(
  state: AnalysisState,
  fileId: string,
  c: Counters
): AnalysisState {
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
  state: AnalysisState,
  event: AnalysisEvent
): AnalysisState {
  const fileId = state.fileId;
  const c: Counters = {
    questionBudget: state.questionBudget,
    askedCount: state.askedCount,
    failureCount: state.failureCount,
  };

  switch (state.status) {
    case "analyzing":
      if (event.type === "analyzed") {
        // Ask-don't-guess: when the file is ambiguous (the model returned questions) and the
        // budget still allows, pause to ask instead of proposing a guess. Otherwise propose
        // whatever tags survived validation (possibly none — never forced).
        if (event.questions.length > 0 && !budgetReached(c)) {
          return {
            status: "awaiting_clarification",
            fileId,
            summary: event.summary,
            tags: event.tags,
            questions: event.questions,
            questionBudget: c.questionBudget,
            askedCount: c.askedCount + 1,
            failureCount: 0, // a successful analysis resets the breaker
          };
        }
        return {
          status: "awaiting_review",
          fileId,
          summary: event.summary,
          tags: event.tags,
          questionBudget: c.questionBudget,
          askedCount: c.askedCount,
          failureCount: 0,
        };
      }
      if (event.type === "llm_failed") return onFailure(state, fileId, c);
      return state;

    case "awaiting_clarification":
      // The user answered → re-run the analysis with their answers (orchestrator holds them).
      if (event.type === "answers_submitted") {
        return { status: "analyzing", fileId, ...c };
      }
      // The user declined to answer → propose the tags we already have.
      if (event.type === "skip_clarification") {
        return {
          status: "awaiting_review",
          fileId,
          summary: state.summary,
          tags: state.tags,
          ...c,
        };
      }
      return state;

    case "awaiting_review":
      // HITL gate: accept is the ONLY edge into `saving`.
      if (event.type === "accept") {
        return {
          status: "saving",
          fileId,
          summary: state.summary,
          tags: state.tags,
          ...c,
        };
      }
      // Edit adjusts the proposed tag set and re-enters the review gate (no save).
      if (event.type === "edit") {
        return {
          status: "awaiting_review",
          fileId,
          summary: state.summary,
          tags: event.tags,
          ...c,
        };
      }
      if (event.type === "reject") return { status: "complete", fileId, ...c };
      return state;

    case "saving":
      if (event.type === "saved") return { status: "complete", fileId, ...c };
      return state;

    case "paused":
      if (event.type === "resume") return { status: "analyzing", fileId, ...c };
      return state;

    case "complete":
      return state; // terminal
  }
}
