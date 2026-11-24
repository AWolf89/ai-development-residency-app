import { describe, it, expect } from "vitest";
import { createRun, reduce, isTerminal } from "./machine";
import { STEP_ORDER, type OrchestrationState, type StepKey } from "./types";

/**
 * Pure router tests for the thin orchestration layer (ADR-0026). No IO: every transition is
 * exercised with canned (state, event) pairs. These pin the composition invariants — a review gate
 * at every step, resume-after-failure with prior steps intact, and the fixed-length force-stop.
 */

/** Drive a run from the start through a list of events, returning the final state. */
function run(events: Parameters<typeof reduce>[1][]): OrchestrationState {
  return events.reduce((s, e) => reduce(s, e), createRun());
}

/** Accept the cursor step (propose → await → accept) — the normal happy path for one step. */
function acceptStep(state: OrchestrationState): OrchestrationState {
  const proposed = reduce(state, { type: "step_proposed" });
  return reduce(proposed, { type: "step_accepted" });
}

describe("createRun", () => {
  it("starts running at the first step with every step pending", () => {
    const s = createRun();
    expect(s.status).toBe("running");
    expect(s.cursor).toBe(STEP_ORDER[0]);
    expect(s.failureStep).toBeNull();
    for (const k of STEP_ORDER) expect(s.steps[k]).toBe("pending");
  });
});

describe("the review gate at every step", () => {
  it("proposing a step moves it to awaiting_review (never straight to done)", () => {
    const s = reduce(createRun(), { type: "step_proposed" });
    expect(s.status).toBe("awaiting_review");
    expect(s.steps.reconcile).toBe("awaiting_review");
  });

  it("a step only becomes done via accept from awaiting_review", () => {
    // accept is ignored while still running (not yet proposed) — the gate can't be skipped.
    const stillRunning = reduce(createRun(), { type: "step_accepted" });
    expect(stillRunning).toEqual(createRun());

    const done = acceptStep(createRun());
    expect(done.steps.reconcile).toBe("done");
    expect(done.cursor).toBe("propose");
    expect(done.status).toBe("running");
  });
});

describe("sequencing through the whole flow", () => {
  it("runs reconcile → propose → interview → review, then completes", () => {
    let s = createRun();
    const seen: StepKey[] = [];
    for (let i = 0; i < STEP_ORDER.length; i++) {
      expect(s.status).toBe("running");
      expect(s.cursor).not.toBeNull();
      seen.push(s.cursor as StepKey);
      s = acceptStep(s);
    }
    expect(seen).toEqual([...STEP_ORDER]);
    expect(s.status).toBe("complete");
    expect(s.cursor).toBeNull();
    for (const k of STEP_ORDER) expect(s.steps[k]).toBe("done");
  });

  it("skips a step and moves on without saving it", () => {
    const skipped = reduce(createRun(), { type: "step_skipped" });
    expect(skipped.steps.reconcile).toBe("skipped");
    expect(skipped.cursor).toBe("propose");
    expect(skipped.status).toBe("running");
  });

  it("completes even when every step is skipped", () => {
    const s = run(STEP_ORDER.map(() => ({ type: "step_skipped" as const })));
    expect(s.status).toBe("complete");
    expect(s.cursor).toBeNull();
  });
});

describe("failure and resume (AC4)", () => {
  it("fails the cursor step and leaves prior done steps intact", () => {
    // Accept reconcile, then fail during propose.
    const afterReconcile = acceptStep(createRun());
    const proposed = reduce(afterReconcile, { type: "step_proposed" });
    const failed = reduce(proposed, { type: "step_failed" });

    expect(failed.status).toBe("failed");
    expect(failed.failureStep).toBe("propose");
    expect(failed.steps.reconcile).toBe("done"); // prior save untouched
    expect(failed.steps.propose).toBe("failed");
    expect(failed.steps.interview).toBe("pending");
  });

  it("can fail directly from running (before the review gate)", () => {
    const failed = reduce(createRun(), { type: "step_failed" });
    expect(failed.status).toBe("failed");
    expect(failed.failureStep).toBe("reconcile");
    expect(failed.steps.reconcile).toBe("failed");
  });

  it("resumes at the failed step, re-opening it as pending to retry", () => {
    const afterReconcile = acceptStep(createRun());
    const failed = reduce(reduce(afterReconcile, { type: "step_proposed" }), {
      type: "step_failed",
    });
    const resumed = reduce(failed, { type: "resume" });

    expect(resumed.status).toBe("running");
    expect(resumed.cursor).toBe("propose");
    expect(resumed.failureStep).toBeNull();
    expect(resumed.steps.propose).toBe("pending"); // ready to be proposed again
    expect(resumed.steps.reconcile).toBe("done"); // the prior step stays saved
  });

  it("completing the retried step continues the flow normally", () => {
    const afterReconcile = acceptStep(createRun());
    const failed = reduce(reduce(afterReconcile, { type: "step_proposed" }), {
      type: "step_failed",
    });
    const retried = acceptStep(reduce(failed, { type: "resume" }));
    expect(retried.cursor).toBe("interview");
    expect(retried.steps.propose).toBe("done");
  });
});

describe("invalid transitions are ignored, never thrown", () => {
  it("ignores resume unless failed", () => {
    const s = createRun();
    expect(reduce(s, { type: "resume" })).toEqual(s);
  });

  it("ignores events on a complete (terminal) run", () => {
    const complete = run(
      STEP_ORDER.map(() => ({ type: "step_skipped" as const }))
    );
    expect(isTerminal(complete)).toBe(true);
    for (const e of [
      { type: "step_proposed" as const },
      { type: "step_accepted" as const },
      { type: "step_failed" as const },
      { type: "resume" as const },
    ]) {
      expect(reduce(complete, e)).toEqual(complete);
    }
  });

  it("ignores accept while failed (must resume first)", () => {
    const failed = reduce(createRun(), { type: "step_failed" });
    expect(reduce(failed, { type: "step_accepted" })).toEqual(failed);
  });
});
