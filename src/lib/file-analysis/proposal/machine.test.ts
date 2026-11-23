import { describe, it, expect } from "vitest";
import {
  BREAKER_THRESHOLD,
  QUESTION_HARD_CAP,
  budgetReached,
  createProposal,
  reduce,
} from "./machine";
import type {
  ProposalEvent,
  ProposalState,
  ProposedProject,
  ProposedRecord,
} from "./types";

const PROJECT: ProposedProject = {
  name: "Onboarding redesign",
  organisation: "Acme",
  startedOn: "2024-01-01",
  endedOn: "2024-03-01",
  summary: "Redesigned the onboarding form.",
};

const RECORD: ProposedRecord = {
  title: "Led the pilot",
  situation: "Processing was slow.",
  cue: null,
  decision: "Piloted a shorter form.",
  why: null,
  outcome: "Pilot ran with two teams.",
  contribution: "individual",
  location: "p. 2, Pilot section",
  confidence: "medium",
};

/** Fold a sequence of events over reduce, starting from a fresh proposal. */
function drive(
  events: ProposalEvent[],
  opts?: { questionBudget?: number }
): ProposalState {
  return events.reduce(
    (state, event) => reduce(state, event),
    createProposal({
      fileId: "file-1",
      questionBudget: opts?.questionBudget ?? 3,
    })
  );
}

const proposed = (
  over: Partial<Extract<ProposalEvent, { type: "proposed" }>> = {}
): ProposalEvent => ({
  type: "proposed",
  project: PROJECT,
  records: [RECORD],
  questions: [],
  ...over,
});

describe("createProposal", () => {
  it("clamps the question budget to [1, hard cap]", () => {
    expect(
      createProposal({ fileId: "f", questionBudget: 99 }).questionBudget
    ).toBe(QUESTION_HARD_CAP);
    expect(
      createProposal({ fileId: "f", questionBudget: 0 }).questionBudget
    ).toBe(1);
    expect(
      createProposal({ fileId: "f", questionBudget: -5 }).questionBudget
    ).toBe(1);
  });

  it("starts in proposing with zeroed counters", () => {
    const s = createProposal({ fileId: "f" });
    expect(s.status).toBe("proposing");
    expect(s).toMatchObject({ askedCount: 0, failureCount: 0 });
  });
});

describe("budgetReached", () => {
  it("is true only once asked >= budget", () => {
    expect(
      budgetReached({ questionBudget: 2, askedCount: 1, failureCount: 0 })
    ).toBe(false);
    expect(
      budgetReached({ questionBudget: 2, askedCount: 2, failureCount: 0 })
    ).toBe(true);
  });
});

describe("proposing", () => {
  it("with no questions → awaiting_proposal_review carrying the proposal", () => {
    const s = drive([proposed()]);
    expect(s.status).toBe("awaiting_proposal_review");
    if (s.status !== "awaiting_proposal_review") throw new Error("bad");
    expect(s.project).toEqual(PROJECT);
    expect(s.records).toEqual([RECORD]);
  });

  it("ask-don't-guess: questions + budget left → awaiting_clarification, askedCount++", () => {
    const s = drive([proposed({ questions: [{ text: "Which project?" }] })]);
    expect(s.status).toBe("awaiting_clarification");
    expect(s.askedCount).toBe(1);
  });

  it("stops asking once the budget is spent (questions but budget reached → review)", () => {
    const s = drive([proposed({ questions: [{ text: "Which project?" }] })], {
      questionBudget: 1,
    });
    // One round asked, budget 1 → re-proposed with more questions must go to review, not ask again.
    const after = reduce(
      reduce(s, { type: "answers_submitted", answers: ["a"] }),
      proposed({ questions: [{ text: "Still unclear?" }] })
    );
    expect(after.status).toBe("awaiting_proposal_review");
  });

  it("a successful pass resets the failure counter", () => {
    const failed = reduce(createProposal({ fileId: "f" }), {
      type: "llm_failed",
    });
    expect(failed.failureCount).toBe(1);
    const ok = reduce(failed, proposed());
    expect(ok.failureCount).toBe(0);
  });
});

describe("circuit breaker (AC5)", () => {
  it(`trips to paused after ${BREAKER_THRESHOLD} consecutive llm_failed`, () => {
    const s = drive(Array(BREAKER_THRESHOLD).fill({ type: "llm_failed" }));
    expect(s.status).toBe("paused");
    if (s.status !== "paused") throw new Error("bad");
    expect(s.reason).toBe("circuit_breaker");
  });

  it("resumes from paused back to proposing", () => {
    const paused = drive(Array(BREAKER_THRESHOLD).fill({ type: "llm_failed" }));
    expect(reduce(paused, { type: "resume" }).status).toBe("proposing");
  });
});

describe("awaiting_clarification", () => {
  const ask = (): ProposalState =>
    drive([proposed({ questions: [{ text: "Which project?" }] })]);

  it("answers_submitted → proposing (re-run)", () => {
    expect(
      reduce(ask(), { type: "answers_submitted", answers: ["x"] }).status
    ).toBe("proposing");
  });

  it("skip_clarification → awaiting_proposal_review with the proposal so far", () => {
    const s = reduce(ask(), { type: "skip_clarification" });
    expect(s.status).toBe("awaiting_proposal_review");
    if (s.status !== "awaiting_proposal_review") throw new Error("bad");
    expect(s.records).toEqual([RECORD]);
  });
});

describe("awaiting_proposal_review — HITL isolation (AC3)", () => {
  const review = (): ProposalState => drive([proposed()]);

  it("approve is the ONLY edge into persisting", () => {
    expect(reduce(review(), { type: "approve" }).status).toBe("persisting");
  });

  it("edit stays in review with the edited proposal and never persists", () => {
    const edited: ProposedRecord[] = [
      { ...RECORD, title: "Supported the pilot" },
    ];
    const s = reduce(review(), {
      type: "edit",
      project: null,
      records: edited,
    });
    expect(s.status).toBe("awaiting_proposal_review");
    if (s.status !== "awaiting_proposal_review") throw new Error("bad");
    expect(s.project).toBeNull();
    expect(s.records).toEqual(edited);
  });

  it("reject → complete with no result (nothing saved)", () => {
    const s = reduce(review(), { type: "reject" });
    expect(s.status).toBe("complete");
    if (s.status !== "complete") throw new Error("bad");
    expect(s.result).toBeNull();
  });

  it("no event other than approve can reach persisting from review", () => {
    const events: ProposalEvent[] = [
      { type: "edit", project: null, records: [] },
      { type: "reject" },
      { type: "answers_submitted", answers: [] },
      { type: "skip_clarification" },
      { type: "llm_failed" },
      { type: "persisted", result: { projectId: "p", recordIds: [] } },
      { type: "resume" },
    ];
    for (const event of events) {
      expect(reduce(review(), event).status).not.toBe("persisting");
    }
  });
});

describe("persisting", () => {
  it("persisted → complete carrying the result", () => {
    const persisting = reduce(drive([proposed()]), { type: "approve" });
    const result = { projectId: "proj-1", recordIds: ["rec-1", "rec-2"] };
    const s = reduce(persisting, { type: "persisted", result });
    expect(s.status).toBe("complete");
    if (s.status !== "complete") throw new Error("bad");
    expect(s.result).toEqual(result);
  });

  it("ignores any event other than persisted (no double-handling)", () => {
    const persisting = reduce(drive([proposed()]), { type: "approve" });
    expect(reduce(persisting, { type: "approve" })).toEqual(persisting);
  });
});

describe("invalid transitions are ignored", () => {
  it("returns the same state object for an unhandled event", () => {
    const proposing = createProposal({ fileId: "f" });
    expect(reduce(proposing, { type: "approve" })).toBe(proposing);
  });

  it("complete is terminal", () => {
    const complete = reduce(reduce(drive([proposed()]), { type: "approve" }), {
      type: "persisted",
      result: { projectId: null, recordIds: [] },
    });
    expect(reduce(complete, { type: "resume" })).toBe(complete);
  });
});
