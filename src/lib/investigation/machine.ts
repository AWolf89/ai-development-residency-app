/**
 * The Evidence Investigation Agent finite-state machine (ADR-0017) — a pure
 * `reduce(state, event)` router with no side effects. The orchestrator performs retrieval,
 * the reflect model call, and the assessment UPSERT, then feeds each result back here as the
 * next event. The safety properties live in this one module so they are auditable and
 * unit-tested to 100%:
 *
 *   - HITL isolation (R1 §3.4): `saving` is reachable ONLY from `awaiting_review` on `accept`,
 *     so the agent can surface evidence but never overwrite an assessment without approval.
 *   - Loop bound (R1 §3.5): the `budgetReached` guard caps searches; the budget is clamped to a
 *     hard cap so no configuration can exceed it.
 *   - Circuit breaker (R1 §3.5): consecutive `llm_failed` events trip the loop to `paused`
 *     instead of retrying without end.
 */
import type {
  InvestigationEvent,
  InvestigationState,
  Requirement,
} from "./types";

/** Never run more than this many searches in one investigation, whatever the budget asks for. */
export const SEARCH_HARD_CAP = 5;
/** Default number of searches when the caller does not set one. */
export const DEFAULT_SEARCH_BUDGET = 3;
/** Consecutive model/retrieval failures that trip the circuit breaker. */
export const BREAKER_THRESHOLD = 3;

type Counters = Pick<
  InvestigationState,
  "searchBudget" | "searchCount" | "failureCount"
>;

/** Start a fresh investigation in `planning`, clamping the budget to [1, hard cap]. */
export function createInvestigation(
  requirement: Requirement,
  opts?: { searchBudget?: number }
): InvestigationState {
  const requested = opts?.searchBudget ?? DEFAULT_SEARCH_BUDGET;
  const searchBudget = Math.min(
    SEARCH_HARD_CAP,
    Math.max(1, Math.floor(requested))
  );
  return {
    status: "planning",
    requirement,
    searchBudget,
    searchCount: 0,
    failureCount: 0,
  };
}

/** True once as many searches have been spent as the budget allows. */
export function budgetReached(c: Counters): boolean {
  return c.searchCount >= c.searchBudget;
}

/**
 * A failure during `searching` (retrieval) or `reflecting` (model): count it and trip the
 * breaker at the threshold, degrading to `paused` so the loop stops instead of spinning.
 */
function onFailure(
  state: Extract<InvestigationState, { status: "searching" | "reflecting" }>,
  c: Counters
): InvestigationState {
  const failureCount = c.failureCount + 1;
  if (failureCount >= BREAKER_THRESHOLD) {
    return {
      status: "paused",
      requirement: state.requirement,
      reason: "circuit_breaker",
      query: state.query,
      searchBudget: c.searchBudget,
      searchCount: c.searchCount,
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
  state: InvestigationState,
  event: InvestigationEvent
): InvestigationState {
  const c: Counters = {
    searchBudget: state.searchBudget,
    searchCount: state.searchCount,
    failureCount: state.failureCount,
  };

  switch (state.status) {
    case "planning":
      if (event.type === "search_planned") {
        return {
          status: "searching",
          requirement: state.requirement,
          query: event.query,
          ...c,
        };
      }
      return state;

    case "searching":
      if (event.type === "retrieved") {
        // One search spent: count it before reflecting on the results.
        return {
          status: "reflecting",
          requirement: state.requirement,
          query: state.query,
          searchBudget: c.searchBudget,
          searchCount: c.searchCount + 1,
          failureCount: c.failureCount,
        };
      }
      if (event.type === "llm_failed") return onFailure(state, c);
      return state;

    case "reflecting":
      if (event.type === "substantiated") {
        return {
          status: "awaiting_review",
          requirement: state.requirement,
          finding: event.finding,
          searchBudget: c.searchBudget,
          searchCount: c.searchCount,
          failureCount: 0, // a successful reflect resets the breaker
        };
      }
      if (event.type === "insufficient") {
        const next = event.nextQuery?.trim();
        // Stop searching when the budget is spent or the model has no further query to try.
        if (budgetReached(c) || !next) {
          return {
            status: "exhausted",
            requirement: state.requirement,
            searchBudget: c.searchBudget,
            searchCount: c.searchCount,
            failureCount: 0,
          };
        }
        return {
          status: "searching",
          requirement: state.requirement,
          query: next,
          searchBudget: c.searchBudget,
          searchCount: c.searchCount,
          failureCount: 0,
        };
      }
      if (event.type === "llm_failed") return onFailure(state, c);
      return state;

    case "exhausted":
      if (event.type === "finding_ready") {
        return {
          status: "awaiting_review",
          requirement: state.requirement,
          finding: event.finding,
          ...c,
        };
      }
      return state;

    case "awaiting_review":
      // HITL gate: accept is the ONLY edge into `saving`.
      if (event.type === "accept") {
        return {
          status: "saving",
          requirement: state.requirement,
          finding: state.finding,
          ...c,
        };
      }
      // Edit updates the proposed finding in place; still no save.
      if (event.type === "edit") {
        return {
          status: "awaiting_review",
          requirement: state.requirement,
          finding: event.finding,
          ...c,
        };
      }
      if (event.type === "reject") {
        return { status: "complete", requirement: state.requirement, ...c };
      }
      return state;

    case "saving":
      if (event.type === "saved") {
        return { status: "complete", requirement: state.requirement, ...c };
      }
      return state;

    case "paused":
      if (event.type === "resume") {
        return {
          status: "searching",
          requirement: state.requirement,
          query: state.query,
          ...c,
        };
      }
      return state;

    case "complete":
      return state; // terminal
  }
}
