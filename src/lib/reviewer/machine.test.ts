import { describe, it, expect } from "vitest";
import type { ReviewEvent, ReviewFlag, ReviewState } from "./types";
import {
  createReview,
  reduce,
  budgetReached,
  downgradeSeverity,
  CHECK_HARD_CAP,
  DEFAULT_CHECK_BUDGET,
  BREAKER_THRESHOLD,
} from "./machine";

const flag = (over: Partial<ReviewFlag> = {}): ReviewFlag => ({
  dimension: "specificity",
  severity: "caution",
  targetField: "outcome",
  message: "Too vague to be credible.",
  citations: [],
  disposition: "pending",
  ...over,
});

/** Fold a list of events onto a fresh review (default or given budget). */
function drive(
  events: ReviewEvent[],
  opts?: { checkBudget?: number }
): ReviewState {
  return events.reduce(reduce, createReview(opts));
}

describe("createReview", () => {
  it("starts in planning with zeroed counters and the default budget", () => {
    const s = createReview();
    expect(s.status).toBe("planning");
    expect(s.checksDone).toBe(0);
    expect(s.failureCount).toBe(0);
    expect(s.checkBudget).toBe(DEFAULT_CHECK_BUDGET);
  });

  it("clamps the budget to the hard cap and to a floor of 1", () => {
    expect(createReview({ checkBudget: 999 }).checkBudget).toBe(CHECK_HARD_CAP);
    expect(createReview({ checkBudget: 0 }).checkBudget).toBe(1);
    expect(createReview({ checkBudget: -5 }).checkBudget).toBe(1);
    expect(createReview({ checkBudget: 2.9 }).checkBudget).toBe(2);
  });
});

describe("budgetReached", () => {
  it("is true only once checksDone reaches the budget", () => {
    expect(
      budgetReached({ checkBudget: 4, checksDone: 3, failureCount: 0 })
    ).toBe(false);
    expect(
      budgetReached({ checkBudget: 4, checksDone: 4, failureCount: 0 })
    ).toBe(true);
    expect(
      budgetReached({ checkBudget: 4, checksDone: 5, failureCount: 0 })
    ).toBe(true);
  });
});

describe("downgradeSeverity", () => {
  it("softens serious to caution and leaves the rest", () => {
    expect(downgradeSeverity("serious")).toBe("caution");
    expect(downgradeSeverity("caution")).toBe("caution");
    expect(downgradeSeverity("info")).toBe("info");
  });
});

describe("reduce — the review loop", () => {
  it("planning → reviewing on plan_ready with an empty flag list", () => {
    const s = reduce(createReview(), { type: "plan_ready" });
    expect(s.status).toBe("reviewing");
    expect(s.status === "reviewing" && s.flags).toEqual([]);
  });

  it("accumulates flags across review passes and reaches the gate at the budget", () => {
    const f1 = flag({ dimension: "support", message: "a" });
    const f2 = flag({ dimension: "accuracy", message: "b" });
    const s = drive(
      [
        { type: "plan_ready" },
        { type: "flags_ready", flags: [f1] },
        { type: "flags_ready", flags: [f2] },
        { type: "flags_ready", flags: [] },
        { type: "flags_ready", flags: [] },
      ],
      { checkBudget: 4 }
    );
    expect(s.status).toBe("awaiting_review");
    expect(
      s.status === "awaiting_review" && s.flags.map((f) => f.message)
    ).toEqual(["a", "b"]);
    expect(s.checksDone).toBe(4);
  });

  it("stops at the budget even with fewer dimensions configured", () => {
    const s = drive(
      [{ type: "plan_ready" }, { type: "flags_ready", flags: [] }],
      { checkBudget: 1 }
    );
    expect(s.status).toBe("awaiting_review");
    expect(s.checksDone).toBe(1);
  });

  it("a successful pass resets the failure counter", () => {
    const afterOneFail = drive([
      { type: "plan_ready" },
      { type: "llm_failed" },
    ]);
    expect(afterOneFail.failureCount).toBe(1);
    const afterSuccess = reduce(afterOneFail, {
      type: "flags_ready",
      flags: [],
    });
    expect(afterSuccess.failureCount).toBe(0);
  });
});

describe("reduce — circuit breaker", () => {
  it("pauses after the threshold of consecutive failures, never losing accumulated flags", () => {
    const f = flag({ dimension: "support", message: "keep me" });
    let s = drive([
      { type: "plan_ready" },
      { type: "flags_ready", flags: [f] },
    ]);
    for (let i = 0; i < BREAKER_THRESHOLD; i++) {
      s = reduce(s, { type: "llm_failed" });
    }
    expect(s.status).toBe("paused");
    expect(s.status === "paused" && s.reason).toBe("circuit_breaker");
    expect(s.status === "paused" && s.flags.map((x) => x.message)).toEqual([
      "keep me",
    ]);
  });

  it("one fewer than the threshold stays recoverable (still reviewing)", () => {
    let s: ReviewState = drive([{ type: "plan_ready" }]);
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) {
      s = reduce(s, { type: "llm_failed" });
    }
    expect(s.status).toBe("reviewing");
    expect(s.failureCount).toBe(BREAKER_THRESHOLD - 1);
  });
});

describe("reduce — HITL gate", () => {
  const atGate = (flags: ReviewFlag[]): ReviewState => ({
    status: "awaiting_review",
    flags,
    checkBudget: 4,
    checksDone: 4,
    failureCount: 0,
  });

  it("accept is the only path into saving and promotes pending flags to accepted", () => {
    const s = reduce(atGate([flag(), flag({ disposition: "dismissed" })]), {
      type: "accept",
    });
    expect(s.status).toBe("saving");
    expect(s.status === "saving" && s.flags.map((f) => f.disposition)).toEqual([
      "accepted",
      "dismissed",
    ]);
  });

  it("edit replaces the flag set and stays at the gate", () => {
    const edited = [flag({ message: "edited", disposition: "dismissed" })];
    const s = reduce(atGate([flag()]), { type: "edit", flags: edited });
    expect(s.status).toBe("awaiting_review");
    expect(s.status === "awaiting_review" && s.flags).toEqual(edited);
  });

  it("reject goes to discarded (nothing to persist)", () => {
    const s = reduce(atGate([flag()]), { type: "reject" });
    expect(s.status).toBe("discarded");
  });

  it("pause from the gate is a user pause that keeps the flags", () => {
    const s = reduce(atGate([flag()]), { type: "pause" });
    expect(s.status).toBe("paused");
    expect(s.status === "paused" && s.reason).toBe("user");
  });

  it("saving → complete on saved; complete and discarded are terminal", () => {
    const saved = reduce(reduce(atGate([flag()]), { type: "accept" }), {
      type: "saved",
    });
    expect(saved.status).toBe("complete");
    expect(reduce(saved, { type: "accept" })).toBe(saved);
    const discarded = reduce(atGate([]), { type: "reject" });
    expect(reduce(discarded, { type: "accept" })).toBe(discarded);
  });
});

describe("reduce — resume", () => {
  it("resumes to reviewing when checks remain, or to the gate when done", () => {
    const paused = (checksDone: number): ReviewState => ({
      status: "paused",
      reason: "user",
      flags: [],
      checkBudget: 4,
      checksDone,
      failureCount: 1,
    });
    expect(reduce(paused(2), { type: "resume" }).status).toBe("reviewing");
    expect(reduce(paused(4), { type: "resume" }).status).toBe(
      "awaiting_review"
    );
  });
});

// The load-bearing invariant (R1 §3.4): `saving` is reachable ONLY from awaiting_review on accept.
describe("HITL isolation: no path reaches saving except awaiting_review --accept-->", () => {
  const everyState: ReviewState[] = [
    { status: "planning", checkBudget: 4, checksDone: 0, failureCount: 0 },
    {
      status: "reviewing",
      flags: [],
      checkBudget: 4,
      checksDone: 1,
      failureCount: 0,
    },
    {
      status: "awaiting_review",
      flags: [flag()],
      checkBudget: 4,
      checksDone: 4,
      failureCount: 0,
    },
    {
      status: "saving",
      flags: [flag()],
      checkBudget: 4,
      checksDone: 4,
      failureCount: 0,
    },
    {
      status: "paused",
      reason: "user",
      flags: [],
      checkBudget: 4,
      checksDone: 2,
      failureCount: 0,
    },
    { status: "discarded", checkBudget: 4, checksDone: 4, failureCount: 0 },
    {
      status: "complete",
      flags: [],
      checkBudget: 4,
      checksDone: 4,
      failureCount: 0,
    },
  ];
  const everyEvent: ReviewEvent[] = [
    { type: "plan_ready" },
    { type: "flags_ready", flags: [flag()] },
    { type: "llm_failed" },
    { type: "accept" },
    { type: "edit", flags: [flag()] },
    { type: "reject" },
    { type: "pause" },
    { type: "resume" },
    { type: "saved" },
  ];

  it("only awaiting_review + accept produces saving", () => {
    for (const s of everyState) {
      for (const e of everyEvent) {
        const next = reduce(s, e);
        if (next.status === "saving" && s.status !== "saving") {
          expect(s.status).toBe("awaiting_review");
          expect(e.type).toBe("accept");
        }
      }
    }
  });

  it("every (state, event) pair returns a valid known status and never throws", () => {
    for (const s of everyState) {
      for (const e of everyEvent) {
        expect(() => reduce(s, e)).not.toThrow();
        expect(reduce(s, e).status).toBeTypeOf("string");
      }
    }
  });
});

describe("reduce — invalid events are ignored", () => {
  it("returns the same state object for an event that does not apply", () => {
    const planning = createReview();
    expect(reduce(planning, { type: "accept" })).toBe(planning);
    expect(reduce(planning, { type: "saved" })).toBe(planning);
  });
});
