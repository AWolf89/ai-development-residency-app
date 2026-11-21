/**
 * The Reasoning Interview finite-state machine (ADR-0013) — a pure `reduce(state, event)`
 * router with no side effects. The orchestrator performs retrieval, model calls, and DB
 * writes, then feeds each result back here as the next event. All the Week-6 safety
 * properties live in this one module so they are auditable and unit-tested to 100%:
 *
 *   - HITL isolation (R1 §3.4): `saving` is reachable ONLY from `awaiting_confirmation` on
 *     `accept`, so a paraphrase and a save can never share a step.
 *   - Loop bound (R1 §3.5): the `budget_reached` guard ends the loop at `complete`; the
 *     budget is clamped to a hard cap so no configuration can exceed it.
 *   - Circuit breaker (R1 §3.5): consecutive `llm_failed` events trip the loop to `paused`
 *     instead of retrying without end.
 */
import type { InterviewEvent, InterviewState } from "./types";

/** Never ask more than this many questions in one interview, whatever the budget asks for. */
export const QUESTION_HARD_CAP = 10;
/** Default number of questions when the caller does not set one. */
export const DEFAULT_QUESTION_BUDGET = 6;
/** Default budget for a timeline-anchored decision-point interview (ADR-0021): 5–8 → 8. */
export const DEFAULT_TIMELINE_QUESTION_BUDGET = 8;
/** Consecutive model failures that trip the circuit breaker. */
export const BREAKER_THRESHOLD = 3;

type Counters = Pick<
  InterviewState,
  "questionBudget" | "askedCount" | "failureCount"
>;

/** Clamp a requested budget to [1, hard cap] so no configuration can exceed the cap. */
function clampBudget(requested: number): number {
  return Math.min(QUESTION_HARD_CAP, Math.max(1, Math.floor(requested)));
}

/** Start a fresh interview in `planning`, clamping the budget to [1, hard cap]. */
export function createInterview(opts?: {
  questionBudget?: number;
}): InterviewState {
  const questionBudget = clampBudget(
    opts?.questionBudget ?? DEFAULT_QUESTION_BUDGET
  );
  return { status: "planning", questionBudget, askedCount: 0, failureCount: 0 };
}

/**
 * Start a timeline-anchored decision-point interview (ADR-0021) in `drafting_timeline` — the
 * pre-interview phase that builds a project timeline and lets the user correct it before the
 * question loop begins. Same counters and the same clamped budget as `createInterview`.
 */
export function createTimelineInterview(opts?: {
  questionBudget?: number;
}): InterviewState {
  const questionBudget = clampBudget(
    opts?.questionBudget ?? DEFAULT_TIMELINE_QUESTION_BUDGET
  );
  return {
    status: "drafting_timeline",
    questionBudget,
    askedCount: 0,
    failureCount: 0,
  };
}

/** True once as many questions have been asked as the budget allows. */
export function budgetReached(state: Counters): boolean {
  return state.askedCount >= state.questionBudget;
}

/** After a turn ends, either ask the next question or finish when the budget is spent. */
function continueOrComplete(c: Counters): InterviewState {
  return budgetReached(c)
    ? { status: "complete", ...c }
    : { status: "asking", ...c };
}

/** A model failure during `asking`/`paraphrasing`: count it and trip the breaker at the cap. */
function onFailure(state: InterviewState, c: Counters): InterviewState {
  const failureCount = c.failureCount + 1;
  if (failureCount >= BREAKER_THRESHOLD) {
    return {
      status: "paused",
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
  state: InterviewState,
  event: InterviewEvent
): InterviewState {
  const c: Counters = {
    questionBudget: state.questionBudget,
    askedCount: state.askedCount,
    failureCount: state.failureCount,
  };

  switch (state.status) {
    case "drafting_timeline":
      // The orchestrator drafted the timeline from the project's files; show it for review.
      if (event.type === "timeline_drafted") {
        return { status: "awaiting_timeline", timeline: event.timeline, ...c };
      }
      return state;

    case "awaiting_timeline":
      // The user confirmed (and possibly corrected) the timeline; start the question loop.
      if (event.type === "timeline_confirmed") return continueOrComplete(c);
      return state;

    case "planning":
      if (event.type === "plan_ready") return continueOrComplete(c);
      return state;

    case "asking":
      if (event.type === "question_ready") {
        // The hard loop bound: never consume a question past the budget.
        if (budgetReached(c)) return { status: "complete", ...c };
        return {
          status: "awaiting_answer",
          question: event.question,
          questionBudget: c.questionBudget,
          askedCount: c.askedCount + 1,
          failureCount: 0, // a successful question resets the breaker
        };
      }
      if (event.type === "llm_failed") return onFailure(state, c);
      return state;

    case "awaiting_answer":
      if (event.type === "answer_submitted") {
        // An empty / whitespace-only answer is a skip — no paraphrase call.
        if (event.answer.trim() === "") return continueOrComplete(c);
        return {
          status: "paraphrasing",
          question: state.question,
          answer: event.answer,
          ...c,
        };
      }
      if (event.type === "answer_skipped") return continueOrComplete(c);
      if (event.type === "pause")
        return { status: "paused", reason: "user", ...c };
      return state;

    case "paraphrasing":
      if (event.type === "paraphrase_ready") {
        return {
          status: "awaiting_confirmation",
          question: state.question,
          answer: state.answer,
          draft: event.draft,
          questionBudget: c.questionBudget,
          askedCount: c.askedCount,
          failureCount: 0, // a successful paraphrase resets the breaker
        };
      }
      // The answer was a conclusion, not an account of events (ADR-0021): re-ask the SAME
      // question with a redirect hint and DO NOT spend a question — budget-neutral by design.
      if (event.type === "needs_redirect") {
        return {
          status: "awaiting_answer",
          question: state.question,
          redirectHint: event.hint,
          questionBudget: c.questionBudget,
          askedCount: c.askedCount,
          failureCount: 0, // a successful classification resets the breaker
        };
      }
      if (event.type === "llm_failed") return onFailure(state, c);
      return state;

    case "awaiting_confirmation":
      // HITL gate: accept is the ONLY edge into `saving`.
      if (event.type === "accept") {
        return {
          status: "saving",
          question: state.question,
          answer: state.answer,
          draft: state.draft,
          ...c,
        };
      }
      // Edit re-asks the SAME question (no re-count).
      if (event.type === "edit")
        return { status: "awaiting_answer", question: state.question, ...c };
      if (event.type === "reject") return continueOrComplete(c);
      return state;

    case "saving":
      if (event.type === "saved") return continueOrComplete(c);
      return state;

    case "paused":
      if (event.type === "resume") return continueOrComplete(c);
      return state;

    case "complete":
      return state; // terminal
  }
}
