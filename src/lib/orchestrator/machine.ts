/**
 * The thin orchestration finite-state machine (ADR-0026) — a pure `reduce(state, event)` router
 * with no side effects, mirroring the per-agent FSMs (interview/machine.ts). The server boundary
 * (orchestrator.ts) calls the existing agent PROPOSE entry points, observes each agent's own save,
 * and feeds the result back here as the next event. All composition invariants live in this one
 * module so they are auditable and unit-tested to 100%:
 *
 *   - Review gate at every step (AC2): a step reaches `done` ONLY via `step_accepted` from
 *     `awaiting_review`. The orchestrator never saves; each agent's own accept-only action does.
 *   - Resume after failure (AC4): `step_failed` records the position; `resume` re-opens exactly
 *     that step while every prior `done`/`skipped` step is left untouched.
 *   - Force-stop: the cursor only ever advances forward through the fixed `STEP_ORDER`, so the flow
 *     is bounded by its length — no configuration can loop it (R1 §3.5, as a finite sequence).
 *
 * This module introduces NO distributed-systems machinery (no bus/saga/outbox/CDC/LangGraph); the
 * durable state is this discriminated union, persisted in one row (CLAUDE.md §2.1, matrix R2 rows
 * stay DORMANT).
 */
import {
  STEP_ORDER,
  type OrchestrationEvent,
  type OrchestrationState,
  type StepKey,
  type StepLedger,
  type StepStatus,
} from "./types";

/** Start a fresh run: running at the first step, every step pending. */
export function createRun(): OrchestrationState {
  const steps = Object.fromEntries(
    STEP_ORDER.map((key) => [key, "pending"])
  ) as StepLedger;
  return {
    status: "running",
    steps,
    cursor: STEP_ORDER[0],
    failureStep: null,
  };
}

/** True once the run has reached its terminal `complete` state. */
export function isTerminal(state: OrchestrationState): boolean {
  return state.status === "complete";
}

/** Return the ledger with one step's status replaced (pure). */
function setStep(
  steps: StepLedger,
  key: StepKey,
  status: StepStatus
): StepLedger {
  return { ...steps, [key]: status };
}

/** The next step after `from` that is still `pending` (skips done/skipped), or null if none. */
function nextPending(steps: StepLedger, from: StepKey): StepKey | null {
  for (let i = STEP_ORDER.indexOf(from) + 1; i < STEP_ORDER.length; i++) {
    if (steps[STEP_ORDER[i]] === "pending") return STEP_ORDER[i];
  }
  return null;
}

/** After the cursor step finished (done/skipped), move to the next pending step or complete. */
function advanceFrom(steps: StepLedger, cursor: StepKey): OrchestrationState {
  const next = nextPending(steps, cursor);
  if (next === null) {
    return { status: "complete", steps, cursor: null, failureStep: null };
  }
  return { status: "running", steps, cursor: next, failureStep: null };
}

/**
 * The pure transition function. Any (state, event) pair that is not an allowed transition returns
 * the same state unchanged — invalid events are ignored, never thrown (mirrors interview/machine.ts).
 */
export function reduce(
  state: OrchestrationState,
  event: OrchestrationEvent
): OrchestrationState {
  switch (state.status) {
    case "running": {
      if (state.cursor === null) return state;
      // The cursor step's propose entry point ran — hand it to the user's review gate.
      if (event.type === "step_proposed") {
        return {
          ...state,
          status: "awaiting_review",
          steps: setStep(state.steps, state.cursor, "awaiting_review"),
        };
      }
      // The user skipped the step before proposing it.
      if (event.type === "step_skipped") {
        return advanceFrom(
          setStep(state.steps, state.cursor, "skipped"),
          state.cursor
        );
      }
      // The propose entry point threw — record the position for resume (AC4).
      if (event.type === "step_failed") {
        return {
          status: "failed",
          steps: setStep(state.steps, state.cursor, "failed"),
          cursor: state.cursor,
          failureStep: state.cursor,
        };
      }
      return state;
    }

    case "awaiting_review": {
      if (state.cursor === null) return state;
      // The ONLY edge into `done`: the agent's own accept-only save succeeded (AC2).
      if (event.type === "step_accepted") {
        return advanceFrom(
          setStep(state.steps, state.cursor, "done"),
          state.cursor
        );
      }
      if (event.type === "step_skipped") {
        return advanceFrom(
          setStep(state.steps, state.cursor, "skipped"),
          state.cursor
        );
      }
      if (event.type === "step_failed") {
        return {
          status: "failed",
          steps: setStep(state.steps, state.cursor, "failed"),
          cursor: state.cursor,
          failureStep: state.cursor,
        };
      }
      return state;
    }

    case "failed": {
      // Resume re-opens exactly the failed step; prior done/skipped steps are untouched (AC4).
      if (event.type === "resume" && state.failureStep !== null) {
        return {
          status: "running",
          steps: setStep(state.steps, state.failureStep, "pending"),
          cursor: state.failureStep,
          failureStep: null,
        };
      }
      return state;
    }

    case "complete":
      return state; // terminal
  }
}
