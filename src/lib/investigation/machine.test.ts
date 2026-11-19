import { describe, it, expect } from "vitest";
import type {
  Finding,
  InvestigationEvent,
  InvestigationState,
  InvestigationStatus,
  Requirement,
} from "./types";
import {
  createInvestigation,
  reduce,
  budgetReached,
  SEARCH_HARD_CAP,
  DEFAULT_SEARCH_BUDGET,
  BREAKER_THRESHOLD,
} from "./machine";

const REQ: Requirement = { id: "req-1", text: "Lead a cross-functional team" };

const SUBSTANTIATED: Finding = {
  requirementId: "req-1",
  verdict: "met",
  rationale: "Led the migration team; evidence confirms it.",
  citations: [{ source: "file", id: "doc-3", title: "Project brief" }],
  confidence: "high",
  searchCount: 1,
};

const GAP_FINDING: Finding = {
  requirementId: "req-1",
  verdict: "gap",
  rationale: "No substantiating evidence after exhausting the search budget.",
  citations: [],
  confidence: "low",
  searchCount: 3,
};

/** Fold a list of events onto a fresh investigation (default or given budget). */
function drive(
  events: InvestigationEvent[],
  opts?: { searchBudget?: number }
): InvestigationState {
  return events.reduce(reduce, createInvestigation(REQ, opts));
}

const toSearching: InvestigationEvent[] = [
  { type: "search_planned", query: "cross-functional team leadership" },
];
const toReflecting: InvestigationEvent[] = [
  ...toSearching,
  { type: "retrieved" },
];
const toReview: InvestigationEvent[] = [
  ...toReflecting,
  { type: "substantiated", finding: SUBSTANTIATED },
];

describe("createInvestigation", () => {
  it("starts in planning with zeroed counters and the default budget", () => {
    const s = createInvestigation(REQ);
    expect(s.status).toBe("planning");
    expect(s.searchCount).toBe(0);
    expect(s.failureCount).toBe(0);
    expect(s.searchBudget).toBe(DEFAULT_SEARCH_BUDGET);
    expect(s.requirement).toEqual(REQ);
  });
  it("clamps a too-large budget down to the hard cap", () => {
    expect(createInvestigation(REQ, { searchBudget: 99 }).searchBudget).toBe(
      SEARCH_HARD_CAP
    );
  });
  it("clamps a zero or negative budget up to at least one", () => {
    expect(createInvestigation(REQ, { searchBudget: 0 }).searchBudget).toBe(1);
    expect(createInvestigation(REQ, { searchBudget: -3 }).searchBudget).toBe(1);
  });
  it("keeps an in-range budget unchanged", () => {
    expect(createInvestigation(REQ, { searchBudget: 2 }).searchBudget).toBe(2);
  });
});

describe("happy-path transitions", () => {
  it("planning --search_planned--> searching with the query", () => {
    const s = drive(toSearching);
    expect(s.status).toBe("searching");
    if (s.status === "searching")
      expect(s.query).toBe("cross-functional team leadership");
  });
  it("searching --retrieved--> reflecting and increments searchCount", () => {
    const s = drive(toReflecting);
    expect(s.status).toBe("reflecting");
    expect(s.searchCount).toBe(1);
  });
  it("reflecting --substantiated--> awaiting_review carrying the finding", () => {
    const s = drive(toReview);
    expect(s.status).toBe("awaiting_review");
    if (s.status === "awaiting_review")
      expect(s.finding).toEqual(SUBSTANTIATED);
  });
  it("awaiting_review --accept--> saving (the ONLY way in)", () => {
    const s = drive([...toReview, { type: "accept" }]);
    expect(s.status).toBe("saving");
  });
  it("saving --saved--> complete", () => {
    const s = drive([...toReview, { type: "accept" }, { type: "saved" }]);
    expect(s.status).toBe("complete");
  });
});

describe("reflect branches", () => {
  it("insufficient with budget left --> searching with the reformulated query", () => {
    const s = drive(
      [
        ...toReflecting,
        { type: "insufficient", nextQuery: "led migration project" },
      ],
      {
        searchBudget: 3,
      }
    );
    expect(s.status).toBe("searching");
    if (s.status === "searching") expect(s.query).toBe("led migration project");
  });
  it("insufficient when the budget is spent --> exhausted", () => {
    // Build a reflecting state whose searchCount already equals the budget.
    const spent: InvestigationState = {
      status: "reflecting",
      requirement: REQ,
      query: "q",
      searchBudget: 1,
      searchCount: 1,
      failureCount: 0,
    };
    expect(
      reduce(spent, { type: "insufficient", nextQuery: "another try" }).status
    ).toBe("exhausted");
  });
  it("insufficient with an empty/null nextQuery --> exhausted even with budget left", () => {
    const empty = reduce(drive(toReflecting), {
      type: "insufficient",
      nextQuery: "   ",
    });
    expect(empty.status).toBe("exhausted");
    const nul = reduce(drive(toReflecting), {
      type: "insufficient",
      nextQuery: null,
    });
    expect(nul.status).toBe("exhausted");
  });
  it("exhausted --finding_ready--> awaiting_review with the gap finding", () => {
    const s = reduce(
      {
        status: "exhausted",
        requirement: REQ,
        searchBudget: 3,
        searchCount: 3,
        failureCount: 0,
      },
      { type: "finding_ready", finding: GAP_FINDING }
    );
    expect(s.status).toBe("awaiting_review");
    if (s.status === "awaiting_review") expect(s.finding).toEqual(GAP_FINDING);
  });
});

describe("review branches other than accept", () => {
  it("awaiting_review --edit--> awaiting_review with the updated finding (no save)", () => {
    const edited: Finding = {
      ...SUBSTANTIATED,
      verdict: "partial",
      rationale: "Downgraded by user.",
    };
    const s = drive([...toReview, { type: "edit", finding: edited }]);
    expect(s.status).toBe("awaiting_review");
    if (s.status === "awaiting_review") expect(s.finding).toEqual(edited);
  });
  it("awaiting_review --reject--> complete, nothing saved", () => {
    const s = drive([...toReview, { type: "reject" }]);
    expect(s.status).toBe("complete");
  });
});

describe("search-budget cap (hard loop bound)", () => {
  it("budgetReached is true only at or above the budget", () => {
    const base = createInvestigation(REQ, { searchBudget: 2 });
    expect(budgetReached({ ...base, searchCount: 1 })).toBe(false);
    expect(budgetReached({ ...base, searchCount: 2 })).toBe(true);
    expect(budgetReached({ ...base, searchCount: 3 })).toBe(true);
  });
  it("runs exactly searchBudget searches, then exhausts", () => {
    // budget 2: retrieve, insufficient, retrieve, insufficient -> exhausted
    let s: InvestigationState = drive(toReflecting, { searchBudget: 2 }); // searchCount = 1
    s = reduce(s, { type: "insufficient", nextQuery: "second query" }); // back to searching
    expect(s.status).toBe("searching");
    s = reduce(s, { type: "retrieved" }); // searchCount = 2
    expect(s.searchCount).toBe(2);
    s = reduce(s, { type: "insufficient", nextQuery: "third query" }); // budget spent
    expect(s.status).toBe("exhausted");
  });
});

describe("circuit breaker", () => {
  it("counts consecutive failures during reflecting below the threshold", () => {
    let s: InvestigationState = drive(toReflecting);
    for (let i = 1; i < BREAKER_THRESHOLD; i++) {
      s = reduce(s, { type: "llm_failed" });
      expect(s.status).toBe("reflecting");
      expect(s.failureCount).toBe(i);
    }
  });
  it("trips to paused (circuit_breaker) at the threshold", () => {
    let s: InvestigationState = drive(toReflecting);
    for (let i = 0; i < BREAKER_THRESHOLD; i++)
      s = reduce(s, { type: "llm_failed" });
    expect(s.status).toBe("paused");
    if (s.status === "paused") expect(s.reason).toBe("circuit_breaker");
  });
  it("also trips during searching (retrieval failure)", () => {
    let s: InvestigationState = drive(toSearching);
    for (let i = 0; i < BREAKER_THRESHOLD; i++)
      s = reduce(s, { type: "llm_failed" });
    expect(s.status).toBe("paused");
  });
  it("resets the failure counter on a successful reflect (substantiated/insufficient)", () => {
    let s: InvestigationState = drive(toReflecting);
    s = reduce(s, { type: "llm_failed" });
    expect(s.failureCount).toBe(1);
    s = reduce(s, { type: "insufficient", nextQuery: "retry" });
    expect(s.failureCount).toBe(0);
  });
  it("paused --resume--> searching, retrying the last query, counters preserved", () => {
    let s: InvestigationState = drive(toReflecting, { searchBudget: 3 });
    for (let i = 0; i < BREAKER_THRESHOLD; i++)
      s = reduce(s, { type: "llm_failed" });
    expect(s.status).toBe("paused");
    const resumed = reduce(s, { type: "resume" });
    expect(resumed.status).toBe("searching");
    expect(resumed.searchCount).toBe(1);
    if (resumed.status === "searching")
      expect(resumed.query).toBe("cross-functional team leadership");
  });
});

describe("invalid events are ignored (no throw, state unchanged)", () => {
  it("returns the same state object for an event that does not apply", () => {
    const planning = createInvestigation(REQ);
    expect(reduce(planning, { type: "accept" })).toBe(planning);
    const searching = drive(toSearching);
    expect(reduce(searching, { type: "accept" })).toBe(searching);
  });
  it("complete is terminal — every event leaves it unchanged", () => {
    const complete = drive([
      ...toReview,
      { type: "accept" },
      { type: "saved" },
    ]);
    expect(complete.status).toBe("complete");
    const events: InvestigationEvent[] = [
      { type: "search_planned", query: "q" },
      { type: "retrieved" },
      { type: "accept" },
      { type: "saved" },
      { type: "resume" },
    ];
    for (const e of events) expect(reduce(complete, e)).toBe(complete);
  });
});

describe("HITL isolation invariant (R1 §3.4)", () => {
  const states: Record<InvestigationStatus, InvestigationState> = {
    planning: createInvestigation(REQ),
    searching: drive(toSearching),
    reflecting: drive(toReflecting),
    exhausted: {
      status: "exhausted",
      requirement: REQ,
      searchBudget: 3,
      searchCount: 3,
      failureCount: 0,
    },
    awaiting_review: drive(toReview),
    saving: drive([...toReview, { type: "accept" }]),
    paused: {
      status: "paused",
      requirement: REQ,
      reason: "circuit_breaker",
      query: "q",
      searchBudget: 3,
      searchCount: 1,
      failureCount: BREAKER_THRESHOLD,
    },
    complete: drive([...toReview, { type: "accept" }, { type: "saved" }]),
  };

  const allEvents: InvestigationEvent[] = [
    { type: "search_planned", query: "q" },
    { type: "retrieved" },
    { type: "substantiated", finding: SUBSTANTIATED },
    { type: "insufficient", nextQuery: "q2" },
    { type: "finding_ready", finding: GAP_FINDING },
    { type: "llm_failed" },
    { type: "accept" },
    { type: "edit", finding: SUBSTANTIATED },
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
