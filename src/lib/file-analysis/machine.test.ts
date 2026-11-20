import { describe, it, expect } from "vitest";
import type {
  AnalysisEvent,
  AnalysisState,
  AnalysisStatus,
  ClarifyingQuestion,
  ProposedTag,
} from "./types";
import {
  createAnalysis,
  reduce,
  budgetReached,
  QUESTION_HARD_CAP,
  DEFAULT_QUESTION_BUDGET,
  BREAKER_THRESHOLD,
} from "./machine";

const TAG: ProposedTag = {
  referenceItemId: "11111111-1111-4111-8111-111111111111",
  source: "techfleet-spf",
  entityType: "skills",
  externalId: "customer-journey-mapping",
  name: "Customer Journey Mapping",
  confidence: "high",
  rationale: "The file maps a customer's experience across touchpoints.",
};

const EDITED: ProposedTag = {
  ...TAG,
  referenceItemId: "22222222-2222-4222-8222-222222222222",
  externalId: "service-blueprinting",
  name: "Service Blueprinting",
  confidence: "medium",
};

const QUESTIONS: ClarifyingQuestion[] = [
  { text: "Which project was this for, and did you build it or review it?" },
];

const FILE = { fileId: "file-1" };

/** Fold a list of events onto a fresh analysis (default or given budget). */
function drive(
  events: AnalysisEvent[],
  opts?: { questionBudget?: number }
): AnalysisState {
  return events.reduce(reduce, createAnalysis({ ...FILE, ...opts }));
}

const analyzedConfident: AnalysisEvent = {
  type: "analyzed",
  summary: "A customer journey map for the OUAT project.",
  tags: [TAG],
  questions: [],
};
const analyzedAmbiguous: AnalysisEvent = {
  type: "analyzed",
  summary: "A diagram that could be a journey map or a service blueprint.",
  tags: [TAG],
  questions: QUESTIONS,
};

describe("createAnalysis", () => {
  it("starts in analyzing with zeroed counters and the default budget", () => {
    const s = createAnalysis(FILE);
    expect(s.status).toBe("analyzing");
    expect(s.fileId).toBe("file-1");
    expect(s.askedCount).toBe(0);
    expect(s.failureCount).toBe(0);
    expect(s.questionBudget).toBe(DEFAULT_QUESTION_BUDGET);
  });

  it("clamps a too-large budget down to the hard cap", () => {
    expect(createAnalysis({ ...FILE, questionBudget: 50 }).questionBudget).toBe(
      QUESTION_HARD_CAP
    );
  });

  it("clamps a zero or negative budget up to at least one", () => {
    expect(createAnalysis({ ...FILE, questionBudget: 0 }).questionBudget).toBe(1);
    expect(createAnalysis({ ...FILE, questionBudget: -5 }).questionBudget).toBe(1);
  });

  it("keeps a budget within range unchanged", () => {
    expect(createAnalysis({ ...FILE, questionBudget: 2 }).questionBudget).toBe(2);
  });
});

describe("happy-path transitions", () => {
  it("analyzing --analyzed (no questions)--> awaiting_review with tags + summary", () => {
    const s = drive([analyzedConfident]);
    expect(s.status).toBe("awaiting_review");
    if (s.status === "awaiting_review") {
      expect(s.tags).toEqual([TAG]);
      expect(s.summary).toContain("journey map");
      expect(s.askedCount).toBe(0);
    }
  });

  it("analyzing --analyzed (with questions)--> awaiting_clarification, asked_count+1", () => {
    const s = drive([analyzedAmbiguous]);
    expect(s.status).toBe("awaiting_clarification");
    if (s.status === "awaiting_clarification") {
      expect(s.questions).toEqual(QUESTIONS);
      expect(s.tags).toEqual([TAG]);
      expect(s.askedCount).toBe(1);
    }
  });

  it("awaiting_clarification --answers_submitted--> analyzing (re-run)", () => {
    const s = drive([
      analyzedAmbiguous,
      { type: "answers_submitted", answers: ["Built it for OUAT."] },
    ]);
    expect(s.status).toBe("analyzing");
    expect(s.askedCount).toBe(1); // the round is preserved across the re-run
  });

  it("awaiting_clarification --skip_clarification--> awaiting_review with provisional tags", () => {
    const s = drive([analyzedAmbiguous, { type: "skip_clarification" }]);
    expect(s.status).toBe("awaiting_review");
    if (s.status === "awaiting_review") expect(s.tags).toEqual([TAG]);
  });

  it("awaiting_review --accept--> saving (the ONLY way in)", () => {
    const s = drive([analyzedConfident, { type: "accept" }]);
    expect(s.status).toBe("saving");
    if (s.status === "saving") expect(s.tags).toEqual([TAG]);
  });

  it("saving --saved--> complete", () => {
    const s = drive([analyzedConfident, { type: "accept" }, { type: "saved" }]);
    expect(s.status).toBe("complete");
  });
});

describe("review branches other than accept", () => {
  it("awaiting_review --edit--> awaiting_review with the edited tag set (no save)", () => {
    const s = drive([analyzedConfident, { type: "edit", tags: [EDITED] }]);
    expect(s.status).toBe("awaiting_review");
    if (s.status === "awaiting_review") expect(s.tags).toEqual([EDITED]);
  });

  it("awaiting_review --reject--> complete, nothing saved", () => {
    const s = drive([analyzedConfident, { type: "reject" }]);
    expect(s.status).toBe("complete");
  });
});

describe("clarification budget (hard loop bound)", () => {
  it("budgetReached is true only at or above the budget", () => {
    const base = createAnalysis({ ...FILE, questionBudget: 2 });
    expect(budgetReached({ ...base, askedCount: 1 })).toBe(false);
    expect(budgetReached({ ...base, askedCount: 2 })).toBe(true);
    expect(budgetReached({ ...base, askedCount: 3 })).toBe(true);
  });

  it("stops asking once the budget is spent — proposes instead of a further question", () => {
    // budget 1: the first ambiguous pass asks; a second ambiguous pass must propose.
    const s = drive(
      [
        analyzedAmbiguous, // -> awaiting_clarification, askedCount 1
        { type: "answers_submitted", answers: ["still unclear"] }, // -> analyzing
        analyzedAmbiguous, // budget spent -> awaiting_review
      ],
      { questionBudget: 1 }
    );
    expect(s.status).toBe("awaiting_review");
    if (s.status === "awaiting_review") expect(s.askedCount).toBe(1);
  });
});

describe("ask-don't-guess / honesty floor", () => {
  it("proposes no tags rather than forcing them when the model is confident but found none", () => {
    const s = drive([
      { type: "analyzed", summary: "A file with no clear framework match.", tags: [], questions: [] },
    ]);
    expect(s.status).toBe("awaiting_review");
    if (s.status === "awaiting_review") expect(s.tags).toEqual([]);
  });
});

describe("circuit breaker", () => {
  it("stays recoverable below the threshold, counting consecutive failures", () => {
    let s: AnalysisState = createAnalysis(FILE);
    for (let i = 1; i < BREAKER_THRESHOLD; i++) {
      s = reduce(s, { type: "llm_failed" });
      expect(s.status).toBe("analyzing");
      expect(s.failureCount).toBe(i);
    }
  });

  it("trips to paused (circuit_breaker) at the threshold", () => {
    let s: AnalysisState = createAnalysis(FILE);
    for (let i = 0; i < BREAKER_THRESHOLD; i++) s = reduce(s, { type: "llm_failed" });
    expect(s.status).toBe("paused");
    if (s.status === "paused") expect(s.reason).toBe("circuit_breaker");
  });

  it("resets the failure counter on a successful analysis", () => {
    let s: AnalysisState = reduce(createAnalysis(FILE), { type: "llm_failed" });
    expect(s.failureCount).toBe(1);
    s = reduce(s, analyzedConfident);
    expect(s.status).toBe("awaiting_review");
    expect(s.failureCount).toBe(0);
  });

  it("paused --resume--> analyzing, preserving asked_count", () => {
    let s: AnalysisState = drive([analyzedAmbiguous]); // askedCount 1
    for (let i = 0; i < BREAKER_THRESHOLD; i++) {
      // failures only count in analyzing; move back there first
      s = reduce(s, { type: "answers_submitted", answers: ["x"] });
      s = reduce(s, { type: "llm_failed" });
    }
    expect(s.status).toBe("paused");
    const resumed = reduce(s, { type: "resume" });
    expect(resumed.status).toBe("analyzing");
    expect(resumed.askedCount).toBe(1);
  });
});

describe("invalid events are ignored (no throw, state unchanged)", () => {
  it("returns the same state object for an event that does not apply", () => {
    const analyzing = createAnalysis(FILE);
    expect(reduce(analyzing, { type: "accept" })).toBe(analyzing);
    const review = drive([analyzedConfident]);
    expect(reduce(review, { type: "saved" })).toBe(review);
  });

  it("complete is terminal — every event leaves it unchanged", () => {
    const complete = drive([
      analyzedConfident,
      { type: "accept" },
      { type: "saved" },
    ]);
    expect(complete.status).toBe("complete");
    const events: AnalysisEvent[] = [
      analyzedConfident,
      { type: "accept" },
      { type: "saved" },
      { type: "resume" },
      { type: "reject" },
    ];
    for (const e of events) expect(reduce(complete, e)).toBe(complete);
  });
});

describe("HITL isolation invariant (R1 §3.4)", () => {
  const states: Record<AnalysisStatus, AnalysisState> = {
    analyzing: createAnalysis(FILE),
    awaiting_clarification: drive([analyzedAmbiguous]),
    awaiting_review: drive([analyzedConfident]),
    saving: drive([analyzedConfident, { type: "accept" }]),
    paused: (() => {
      let s: AnalysisState = createAnalysis(FILE);
      for (let i = 0; i < BREAKER_THRESHOLD; i++) s = reduce(s, { type: "llm_failed" });
      return s;
    })(),
    complete: drive([analyzedConfident, { type: "accept" }, { type: "saved" }]),
  };

  const allEvents: AnalysisEvent[] = [
    analyzedConfident,
    analyzedAmbiguous,
    { type: "answers_submitted", answers: ["x"] },
    { type: "skip_clarification" },
    { type: "llm_failed" },
    { type: "accept" },
    { type: "edit", tags: [EDITED] },
    { type: "reject" },
    { type: "saved" },
    { type: "resume" },
  ];

  it("saving is reachable ONLY from awaiting_review on accept", () => {
    for (const [status, state] of Object.entries(states)) {
      for (const event of allEvents) {
        const next = reduce(state, event);
        const enteredSaving =
          next.status === "saving" && state.status !== "saving";
        if (enteredSaving) {
          expect(status).toBe("awaiting_review");
          expect(event.type).toBe("accept");
        }
      }
    }
  });

  it("every representative state actually has its own status", () => {
    for (const [status, state] of Object.entries(states)) {
      expect(state.status).toBe(status);
    }
  });
});
