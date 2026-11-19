/**
 * The Reviewer Agent Check finite-state machine (ADR-0016) — a pure `reduce(state, event)` router
 * with no side effects. The orchestrator performs retrieval, model calls, and persistence, then
 * feeds each result back here as the next event. All the Week-6 safety properties live in this one
 * module so they are auditable and unit-tested to 100%:
 *
 *   - HITL isolation (R1 §3.4): `saving` — the only state that persists flags and marks the record
 *     reviewed — is reachable ONLY from `awaiting_review` on `accept`, so a review pass and a save
 *     can never share a step.
 *   - Loop bound (R1 §3.5): the `budgetReached` guard ends the review phase at `awaiting_review`;
 *     the budget is clamped to a hard cap so no configuration can exceed it.
 *   - Circuit breaker (R1 §3.5): consecutive `llm_failed` events trip the loop to `paused` instead
 *     of retrying without end.
 */
import { REVIEW_DIMENSIONS } from "./types";
import type {
  FlagSeverity,
  ReviewEvent,
  ReviewFlag,
  ReviewState,
} from "./types";

/** Never run more than this many review passes, whatever the budget asks for. */
export const CHECK_HARD_CAP = 8;
/** Default number of review passes: the fixed dimension list. */
export const DEFAULT_CHECK_BUDGET = REVIEW_DIMENSIONS.length;
/** Consecutive model failures that trip the circuit breaker. */
export const BREAKER_THRESHOLD = 3;

type Counters = Pick<
  ReviewState,
  "checkBudget" | "checksDone" | "failureCount"
>;

/** Start a fresh review in `planning`, clamping the budget to [1, hard cap]. */
export function createReview(opts?: { checkBudget?: number }): ReviewState {
  const requested = opts?.checkBudget ?? DEFAULT_CHECK_BUDGET;
  const checkBudget = Math.min(
    CHECK_HARD_CAP,
    Math.max(1, Math.floor(requested))
  );
  return { status: "planning", checkBudget, checksDone: 0, failureCount: 0 };
}

/** True once as many review passes have run as the budget allows. */
export function budgetReached(state: Counters): boolean {
  return state.checksDone >= state.checkBudget;
}

/** After a pass, either run the next dimension or move to the user gate when the budget is spent. */
function continueOrAwait(c: Counters, flags: ReviewFlag[]): ReviewState {
  return budgetReached(c)
    ? { status: "awaiting_review", flags, ...c }
    : { status: "reviewing", flags, ...c };
}

/** A model failure during `reviewing`: count it and trip the breaker at the cap. */
function onFailure(
  state: Extract<ReviewState, { status: "reviewing" }>,
  c: Counters
): ReviewState {
  const failureCount = c.failureCount + 1;
  if (failureCount >= BREAKER_THRESHOLD) {
    return {
      status: "paused",
      reason: "circuit_breaker",
      flags: state.flags,
      checkBudget: c.checkBudget,
      checksDone: c.checksDone,
      failureCount,
    };
  }
  return { ...state, failureCount };
}

/** On accept, every pending flag the user did not dismiss becomes accepted. */
function markAccepted(flags: ReviewFlag[]): ReviewFlag[] {
  return flags.map((f) =>
    f.disposition === "pending" ? { ...f, disposition: "accepted" } : f
  );
}

/** Soften a severity when an overstatement claim cannot be grounded (serious → caution). */
export function downgradeSeverity(severity: FlagSeverity): FlagSeverity {
  return severity === "serious" ? "caution" : severity;
}

/**
 * The pure transition function. Any (state, event) pair that is not an allowed transition returns
 * the same state object unchanged — invalid events are ignored, never thrown.
 */
export function reduce(state: ReviewState, event: ReviewEvent): ReviewState {
  const c: Counters = {
    checkBudget: state.checkBudget,
    checksDone: state.checksDone,
    failureCount: state.failureCount,
  };

  switch (state.status) {
    case "planning":
      if (event.type === "plan_ready") return continueOrAwait(c, []);
      return state;

    case "reviewing":
      if (event.type === "flags_ready") {
        const flags = [...state.flags, ...event.flags];
        // A successful pass advances the counter and resets the breaker.
        const next: Counters = {
          checkBudget: c.checkBudget,
          checksDone: c.checksDone + 1,
          failureCount: 0,
        };
        return continueOrAwait(next, flags);
      }
      if (event.type === "llm_failed") return onFailure(state, c);
      return state;

    case "awaiting_review":
      // HITL gate: accept is the ONLY edge into `saving`.
      if (event.type === "accept") {
        return { status: "saving", flags: markAccepted(state.flags), ...c };
      }
      // Edit replaces the flags with the user's re-dispositioned set; stays at the gate.
      if (event.type === "edit") {
        return { status: "awaiting_review", flags: event.flags, ...c };
      }
      if (event.type === "reject") return { status: "discarded", ...c };
      if (event.type === "pause") {
        return { status: "paused", reason: "user", flags: state.flags, ...c };
      }
      return state;

    case "saving":
      if (event.type === "saved") {
        return { status: "complete", flags: state.flags, ...c };
      }
      return state;

    case "paused":
      if (event.type === "resume") return continueOrAwait(c, state.flags);
      return state;

    case "discarded":
      return state; // terminal

    case "complete":
      return state; // terminal
  }
}
