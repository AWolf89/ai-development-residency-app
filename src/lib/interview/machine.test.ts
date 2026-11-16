import { describe, it, expect } from "vitest";
import type {
  CdmDraft,
  GroundedQuestion,
  InterviewEvent,
  InterviewState,
  InterviewStatus,
} from "./types";
import {
  createInterview,
  reduce,
  budgetReached,
  QUESTION_HARD_CAP,
  DEFAULT_QUESTION_BUDGET,
  BREAKER_THRESHOLD,
} from "./machine";

const QUESTION: GroundedQuestion = {
  text: "Walk me through a decision you made on this project.",
  citation: { source: "file", id: "slide-7", title: "Migration plan" },
};

const DRAFT: CdmDraft = {
  title: "Chose Postgres",
  situation: "Needed a datastore.",
  cue: null,
  decision: "Picked Postgres.",
  why: null,
  outcome: "Shipped on time.",
};

/** Fold a list of events onto a fresh interview (default or given budget). */
function drive(
  events: InterviewEvent[],
  opts?: { questionBudget?: number }
): InterviewState {
  return events.reduce(reduce, createInterview(opts));
}

const toAwaitingAnswer: InterviewEvent[] = [
  { type: "plan_ready" },
  { type: "question_ready", question: QUESTION },
];
const toParaphrasing: InterviewEvent[] = [
  ...toAwaitingAnswer,
  {
    type: "answer_submitted",
    answer: "We chose Postgres because of reporting.",
  },
];
const toConfirmation: InterviewEvent[] = [
  ...toParaphrasing,
  { type: "paraphrase_ready", draft: DRAFT },
];

describe("createInterview", () => {
  it("starts in planning with zeroed counters and the default budget", () => {
    const s = createInterview();
    expect(s.status).toBe("planning");
    expect(s.askedCount).toBe(0);
    expect(s.failureCount).toBe(0);
    expect(s.questionBudget).toBe(DEFAULT_QUESTION_BUDGET);
  });

  it("clamps a too-large budget down to the hard cap", () => {
    expect(createInterview({ questionBudget: 50 }).questionBudget).toBe(
      QUESTION_HARD_CAP
    );
  });

  it("clamps a zero or negative budget up to at least one", () => {
    expect(createInterview({ questionBudget: 0 }).questionBudget).toBe(1);
    expect(createInterview({ questionBudget: -5 }).questionBudget).toBe(1);
  });

  it("keeps a budget within range unchanged", () => {
    expect(createInterview({ questionBudget: 4 }).questionBudget).toBe(4);
  });
});

describe("happy-path transitions", () => {
  it("planning --plan_ready--> asking", () => {
    expect(reduce(createInterview(), { type: "plan_ready" }).status).toBe(
      "asking"
    );
  });

  it("asking --question_ready--> awaiting_answer and increments asked_count", () => {
    const s = drive(toAwaitingAnswer);
    expect(s.status).toBe("awaiting_answer");
    expect(s.askedCount).toBe(1);
  });

  it("awaiting_answer --answer_submitted--> paraphrasing", () => {
    const s = drive(toParaphrasing);
    expect(s.status).toBe("paraphrasing");
  });

  it("paraphrasing --paraphrase_ready--> awaiting_confirmation", () => {
    const s = drive(toConfirmation);
    expect(s.status).toBe("awaiting_confirmation");
    if (s.status === "awaiting_confirmation") {
      expect(s.draft).toEqual(DRAFT);
    }
  });

  it("awaiting_confirmation --accept--> saving (the ONLY way in)", () => {
    const s = drive([...toConfirmation, { type: "accept" }]);
    expect(s.status).toBe("saving");
  });

  it("saving --saved--> asking (next question) when budget remains", () => {
    const s = drive(
      [...toConfirmation, { type: "accept" }, { type: "saved" }],
      {
        questionBudget: 6,
      }
    );
    expect(s.status).toBe("asking");
    expect(s.askedCount).toBe(1);
  });
});

describe("confirmation branches other than accept", () => {
  it("awaiting_confirmation --edit--> awaiting_answer with the same question (no re-count)", () => {
    const s = drive([...toConfirmation, { type: "edit" }]);
    expect(s.status).toBe("awaiting_answer");
    expect(s.askedCount).toBe(1);
    if (s.status === "awaiting_answer") {
      expect(s.question).toEqual(QUESTION);
    }
  });

  it("awaiting_confirmation --reject--> asking (next question), nothing saved", () => {
    const s = drive([...toConfirmation, { type: "reject" }], {
      questionBudget: 6,
    });
    expect(s.status).toBe("asking");
  });
});

describe("skip and pause / resume", () => {
  it("awaiting_answer --answer_skipped--> asking", () => {
    const s = drive([...toAwaitingAnswer, { type: "answer_skipped" }], {
      questionBudget: 6,
    });
    expect(s.status).toBe("asking");
  });

  it("treats an empty answer as a skip (no paraphrasing)", () => {
    const s = drive(
      [...toAwaitingAnswer, { type: "answer_submitted", answer: "   " }],
      {
        questionBudget: 6,
      }
    );
    expect(s.status).toBe("asking");
  });

  it("awaiting_answer --pause--> paused (reason: user)", () => {
    const s = drive([...toAwaitingAnswer, { type: "pause" }]);
    expect(s.status).toBe("paused");
    if (s.status === "paused") expect(s.reason).toBe("user");
  });

  it("paused --resume--> asking, preserving asked_count", () => {
    const s = drive(
      [...toAwaitingAnswer, { type: "pause" }, { type: "resume" }],
      { questionBudget: 6 }
    );
    expect(s.status).toBe("asking");
    expect(s.askedCount).toBe(1);
  });
});

describe("budget cap (hard loop bound)", () => {
  it("budgetReached is true only at or above the budget", () => {
    const base = createInterview({ questionBudget: 2 });
    expect(budgetReached({ ...base, askedCount: 1 })).toBe(false);
    expect(budgetReached({ ...base, askedCount: 2 })).toBe(true);
    expect(budgetReached({ ...base, askedCount: 3 })).toBe(true);
  });

  it("ends at complete after the saved question reaches the budget", () => {
    const s = drive(
      [...toConfirmation, { type: "accept" }, { type: "saved" }],
      {
        questionBudget: 1,
      }
    );
    expect(s.status).toBe("complete");
  });

  it("one below the budget continues to asking", () => {
    const s = drive(
      [...toConfirmation, { type: "accept" }, { type: "saved" }],
      {
        questionBudget: 2,
      }
    );
    expect(s.status).toBe("asking");
  });

  it("asking --question_ready--> complete when the budget is already spent", () => {
    // Build an asking state that already has askedCount === budget.
    const spent: InterviewState = {
      status: "asking",
      questionBudget: 1,
      askedCount: 1,
      failureCount: 0,
    };
    const s = reduce(spent, { type: "question_ready", question: QUESTION });
    expect(s.status).toBe("complete");
  });

  it("a skip that hits the budget ends the interview", () => {
    const atLimit: InterviewState = {
      status: "awaiting_answer",
      question: QUESTION,
      questionBudget: 1,
      askedCount: 1,
      failureCount: 0,
    };
    expect(reduce(atLimit, { type: "answer_skipped" }).status).toBe("complete");
  });
});

describe("circuit breaker", () => {
  it("stays recoverable below the threshold, counting consecutive failures", () => {
    let s: InterviewState = drive(toParaphrasing);
    for (let i = 1; i < BREAKER_THRESHOLD; i++) {
      s = reduce(s, { type: "llm_failed" });
      expect(s.status).toBe("paraphrasing");
      expect(s.failureCount).toBe(i);
    }
  });

  it("trips to paused (circuit_breaker) at the threshold", () => {
    let s: InterviewState = drive(toParaphrasing);
    for (let i = 0; i < BREAKER_THRESHOLD; i++) {
      s = reduce(s, { type: "llm_failed" });
    }
    expect(s.status).toBe("paused");
    if (s.status === "paused") expect(s.reason).toBe("circuit_breaker");
  });

  it("also trips during question generation (asking)", () => {
    let s: InterviewState = drive([{ type: "plan_ready" }]);
    for (let i = 0; i < BREAKER_THRESHOLD; i++) {
      s = reduce(s, { type: "llm_failed" });
    }
    expect(s.status).toBe("paused");
  });

  it("resets the failure counter on a successful question", () => {
    let s: InterviewState = drive([{ type: "plan_ready" }]);
    s = reduce(s, { type: "llm_failed" });
    expect(s.failureCount).toBe(1);
    s = reduce(s, { type: "question_ready", question: QUESTION });
    expect(s.failureCount).toBe(0);
  });

  it("resets the failure counter on a successful paraphrase", () => {
    let s: InterviewState = drive(toParaphrasing);
    s = reduce(s, { type: "llm_failed" });
    expect(s.failureCount).toBe(1);
    s = reduce(s, { type: "paraphrase_ready", draft: DRAFT });
    expect(s.failureCount).toBe(0);
  });
});

describe("invalid events are ignored (no throw, state unchanged)", () => {
  it("returns the same state for an event that does not apply", () => {
    const planning = createInterview();
    expect(reduce(planning, { type: "accept" })).toBe(planning);
    const asking = drive([{ type: "plan_ready" }]);
    expect(reduce(asking, { type: "paraphrase_ready", draft: DRAFT })).toBe(
      asking
    );
  });

  it("complete is terminal — every event leaves it unchanged", () => {
    const complete = drive(
      [...toConfirmation, { type: "accept" }, { type: "saved" }],
      { questionBudget: 1 }
    );
    expect(complete.status).toBe("complete");
    const events: InterviewEvent[] = [
      { type: "plan_ready" },
      { type: "resume" },
      { type: "accept" },
      { type: "saved" },
    ];
    for (const e of events) expect(reduce(complete, e)).toBe(complete);
  });
});

describe("HITL isolation invariant (R1 §3.4)", () => {
  // Build one representative state per status.
  const states: Record<InterviewStatus, InterviewState> = {
    planning: createInterview(),
    asking: drive([{ type: "plan_ready" }]),
    awaiting_answer: drive(toAwaitingAnswer),
    paraphrasing: drive(toParaphrasing),
    awaiting_confirmation: drive(toConfirmation),
    saving: drive([...toConfirmation, { type: "accept" }]),
    paused: drive([...toAwaitingAnswer, { type: "pause" }]),
    complete: drive(
      [...toConfirmation, { type: "accept" }, { type: "saved" }],
      {
        questionBudget: 1,
      }
    ),
  };

  const allEvents: InterviewEvent[] = [
    { type: "plan_ready" },
    { type: "question_ready", question: QUESTION },
    { type: "answer_submitted", answer: "something" },
    { type: "answer_skipped" },
    { type: "pause" },
    { type: "paraphrase_ready", draft: DRAFT },
    { type: "llm_failed" },
    { type: "accept" },
    { type: "edit" },
    { type: "reject" },
    { type: "saved" },
    { type: "resume" },
  ];

  it("saving is reachable ONLY from awaiting_confirmation on accept", () => {
    for (const [status, state] of Object.entries(states)) {
      for (const event of allEvents) {
        const next = reduce(state, event);
        // We care about *entering* saving (a transition), not a saving state that
        // ignored an inapplicable event and returned itself unchanged.
        const enteredSaving =
          next.status === "saving" && state.status !== "saving";
        if (enteredSaving) {
          expect(status).toBe("awaiting_confirmation");
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
