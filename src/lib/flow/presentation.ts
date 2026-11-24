/**
 * Pure presentation helpers for the guided-flow wizard UI (MVP 2 Phase 4 follow-up). These map the
 * orchestrator's durable `OrchestrationState` (src/lib/orchestrator) to display models — the step
 * rail and which panel to show — with NO Supabase, NO React, and NO server imports, so they are
 * unit-tested with canned inputs (Humble Object / CLAUDE.md §3). They add no reasoning and no new
 * state: every input is already decided by the tested orchestrator FSM; this is view logic only.
 */
import {
  STEP_ORDER,
  type OrchestrationState,
  type StepKey,
} from "@/lib/orchestrator/types";

/** The visual marker a rail node draws. */
export type RailMarker =
  | "done" // a ✓
  | "current" // the numbered, in-focus step
  | "in_review" // the numbered step waiting for the user's gate
  | "failed" // a !
  | "skipped" // a – (step was skipped)
  | "pending" // a number, not yet reached
  | "star"; // the terminal Map / Investigation-Queue node

/** A rail node is one of the four agent steps, or the terminal read-only "map" surface. */
export type RailNodeKey = StepKey | "map";

/** One node in the 5-node progress rail. */
export type RailNode = {
  key: RailNodeKey;
  /** 1-based position, used for numbered markers and the ordered-list semantics. */
  index: number;
  label: string;
  /** The short status word under the label ("Saved", "In review", "Up next", …). */
  caption: string;
  marker: RailMarker;
  /** True for the single node the user is on now (drives `aria-current="step"`). */
  active: boolean;
};

/** Which panel the wizard body renders for the current run state. */
export type FlowPanel =
  | "run" // the cursor step is ready; offer to run its propose entry point
  | "review" // the cursor step is proposed; render its existing review component
  | "interview" // the cursor step is the interview sub-flow; hand off to its UI
  | "failed" // a step failed; offer Retry / Skip / Leave
  | "complete"; // every step done/skipped; show the Investigation Queue

export const STEP_LABEL: Record<StepKey, string> = {
  reconcile: "Reconcile",
  propose: "Propose records",
  interview: "Interview",
  review: "Review",
};

/** The terminal node's label — the read-only Map / Investigation-Queue surface (not a StepKey). */
export const MAP_LABEL = "Map";

/** The caption for a step that has reached `done`. Review reads "Done"; the rest "Saved". */
function doneCaption(step: StepKey): string {
  return step === "review" ? "Done" : "Saved";
}

/**
 * Build the display status for ONE agent step. `isCursor` is whether the run's cursor points here
 * and `running` whether the run is actively advancing (so a pending cursor reads "Up next").
 */
function stepNode(
  state: OrchestrationState,
  step: StepKey,
  index: number
): RailNode {
  const status = state.steps[step];
  const isCursor = state.cursor === step;
  const base = { key: step, index, label: STEP_LABEL[step] };

  switch (status) {
    case "done":
      return {
        ...base,
        caption: doneCaption(step),
        marker: "done",
        active: false,
      };
    case "skipped":
      return { ...base, caption: "Skipped", marker: "skipped", active: false };
    case "failed":
      return { ...base, caption: "Failed", marker: "failed", active: true };
    case "awaiting_review":
      return {
        ...base,
        caption: "In review",
        marker: "in_review",
        active: true,
      };
    case "pending":
    default: {
      const atCursorRunning = isCursor && state.status === "running";
      return {
        ...base,
        caption: atCursorRunning ? "Up next" : "Pending",
        marker: atCursorRunning ? "current" : "pending",
        active: atCursorRunning,
      };
    }
  }
}

/** The terminal Map node: lit ("You are here") once the run is complete, else a dim signpost. */
function mapNode(state: OrchestrationState, index: number): RailNode {
  const complete = state.status === "complete";
  return {
    key: "map",
    index,
    label: MAP_LABEL,
    caption: complete ? "You are here" : "Investigation queue",
    marker: "star",
    active: complete,
  };
}

/**
 * The full 5-node rail model: the four ordered agent steps plus the terminal Map node. Exactly one
 * node is `active` (the cursor step, a failed step, or Map when complete) so screen readers and
 * `aria-current` have a single focus point (AC5).
 */
export function railModel(state: OrchestrationState): RailNode[] {
  const steps = STEP_ORDER.map((step, i) => stepNode(state, step, i + 1));
  return [...steps, mapNode(state, STEP_ORDER.length + 1)];
}

/**
 * Which body panel to show for a run. `interviewComplete` is read from the linked interview
 * session's status (the sub-FSM owns its own completion); it does not change the rail, only whether
 * the interview hand-off offers "mark done" vs "continue the interview".
 */
export function activePanel(state: OrchestrationState): FlowPanel {
  switch (state.status) {
    case "complete":
      return "complete";
    case "failed":
      return "failed";
    case "awaiting_review":
      return state.cursor === "interview" ? "interview" : "review";
    case "running":
    default:
      return "run";
  }
}

/** A human label for a step, for alerts/headings ("the interview step", etc.). Falls back safely. */
export function stepLabel(step: StepKey | null): string {
  return step ? STEP_LABEL[step] : "this step";
}
