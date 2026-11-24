import { describe, it, expect } from "vitest";
import { createRun, reduce } from "@/lib/orchestrator/machine";
import type { OrchestrationState } from "@/lib/orchestrator/types";
import {
  activePanel,
  MAP_LABEL,
  railModel,
  stepLabel,
  STEP_LABEL,
} from "./presentation";

/**
 * Pure view-logic tests for the guided-flow wizard. They drive the REAL orchestrator FSM to build
 * states (so the fixtures can never drift from the backend) and assert the rail + panel the UI
 * derives. No IO, no React. These pin the AC3 rail semantics and AC4 failed-step presentation.
 */

/** Propose + accept the cursor step — the happy path for one step. */
function acceptStep(state: OrchestrationState): OrchestrationState {
  return reduce(reduce(state, { type: "step_proposed" }), {
    type: "step_accepted",
  });
}

describe("railModel", () => {
  it("has five nodes: the four ordered steps plus the terminal Map", () => {
    const nodes = railModel(createRun());
    expect(nodes.map((n) => n.key)).toEqual([
      "reconcile",
      "propose",
      "interview",
      "review",
      "map",
    ]);
    expect(nodes.map((n) => n.index)).toEqual([1, 2, 3, 4, 5]);
    expect(nodes[4].label).toBe(MAP_LABEL);
  });

  it("marks the running cursor step as the single active 'Up next' node", () => {
    const nodes = railModel(createRun());
    const active = nodes.filter((n) => n.active);
    expect(active).toHaveLength(1);
    expect(active[0].key).toBe("reconcile");
    expect(active[0].caption).toBe("Up next");
    expect(active[0].marker).toBe("current");
    // Later steps are plain pending, Map is a dim signpost.
    expect(nodes[1].caption).toBe("Pending");
    expect(nodes[4].caption).toBe("Investigation queue");
  });

  it("shows a proposed step as the active 'In review' node", () => {
    const nodes = railModel(reduce(createRun(), { type: "step_proposed" }));
    expect(nodes[0].marker).toBe("in_review");
    expect(nodes[0].caption).toBe("In review");
    expect(nodes[0].active).toBe(true);
  });

  it("captions done steps 'Saved' (and the review step 'Done')", () => {
    // Accept reconcile, propose, interview; then propose+accept review.
    let s = createRun();
    s = acceptStep(s); // reconcile → done, cursor propose
    s = acceptStep(s); // propose → done, cursor interview
    s = acceptStep(s); // interview → done, cursor review
    s = acceptStep(s); // review → done, run complete
    const nodes = railModel(s);
    expect(nodes[0].caption).toBe("Saved");
    expect(nodes[0].marker).toBe("done");
    expect(nodes[3].caption).toBe("Done"); // review
    expect(nodes[3].marker).toBe("done");
  });

  it("lights the Map node once the run is complete (the only active node)", () => {
    let s = createRun();
    s = acceptStep(acceptStep(acceptStep(acceptStep(s))));
    expect(s.status).toBe("complete");
    const nodes = railModel(s);
    const active = nodes.filter((n) => n.active);
    expect(active).toHaveLength(1);
    expect(active[0].key).toBe("map");
    expect(active[0].caption).toBe("You are here");
  });

  it("shows a skipped step with a skipped marker and keeps prior steps intact", () => {
    let s = createRun();
    s = acceptStep(s); // reconcile done
    s = reduce(s, { type: "step_skipped" }); // propose skipped, cursor interview
    const nodes = railModel(s);
    expect(nodes[0].marker).toBe("done");
    expect(nodes[1].marker).toBe("skipped");
    expect(nodes[1].caption).toBe("Skipped");
  });

  it("marks a failed step active with a failed marker, prior saves untouched (AC4)", () => {
    let s = createRun();
    s = acceptStep(s); // reconcile done
    // Advance into propose, then fail it.
    s = reduce(s, { type: "step_proposed" });
    s = reduce(s, { type: "step_failed" });
    expect(s.status).toBe("failed");
    const nodes = railModel(s);
    expect(nodes[0].marker).toBe("done"); // prior save intact
    expect(nodes[1].marker).toBe("failed");
    expect(nodes[1].caption).toBe("Failed");
    expect(nodes[1].active).toBe(true);
    expect(nodes.filter((n) => n.active)).toHaveLength(1);
  });
});

describe("activePanel", () => {
  it("offers to run a step while the run is running", () => {
    expect(activePanel(createRun())).toBe("run");
  });

  it("shows the review panel for a proposed non-interview step", () => {
    const s = reduce(createRun(), { type: "step_proposed" }); // reconcile awaiting_review
    expect(activePanel(s)).toBe("review");
  });

  it("hands off to the interview panel when the interview step is proposed", () => {
    let s = acceptStep(acceptStep(createRun())); // reconcile, propose done → cursor interview
    s = reduce(s, { type: "step_proposed" }); // interview awaiting_review
    expect(s.cursor).toBe("interview");
    expect(activePanel(s)).toBe("interview");
  });

  it("shows the failed panel for a failed run", () => {
    let s = reduce(createRun(), { type: "step_proposed" });
    s = reduce(s, { type: "step_failed" });
    expect(activePanel(s)).toBe("failed");
  });

  it("shows the complete panel once every step is done", () => {
    let s = createRun();
    s = acceptStep(acceptStep(acceptStep(acceptStep(s))));
    expect(activePanel(s)).toBe("complete");
  });
});

describe("stepLabel", () => {
  it("names each step and falls back for a null cursor", () => {
    expect(stepLabel("interview")).toBe(STEP_LABEL.interview);
    expect(stepLabel(null)).toBe("this step");
  });
});
