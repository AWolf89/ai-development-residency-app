import { describe, it, expect } from "vitest";
import {
  groundingCitationSchema,
  groundedQuestionSchema,
  cdmDraftSchema,
  interviewEventSchema,
  interviewStateSchema,
  INTERVIEW_STATUSES,
  PAUSED_REASONS,
} from "./types";

describe("groundingCitationSchema", () => {
  it("accepts a well-formed citation", () => {
    const parsed = groundingCitationSchema.safeParse({
      source: "file",
      id: "abc",
      title: "Migration plan",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a citation with an empty field", () => {
    expect(
      groundingCitationSchema.safeParse({ source: "", id: "a", title: "t" })
        .success
    ).toBe(false);
  });
});

describe("groundedQuestionSchema", () => {
  it("accepts a question with a citation", () => {
    const parsed = groundedQuestionSchema.safeParse({
      text: "What was the situation?",
      citation: { source: "file", id: "1", title: "Doc" },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a question with a null citation (ungrounded open question)", () => {
    const parsed = groundedQuestionSchema.safeParse({
      text: "Tell me about a decision.",
      citation: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty question text", () => {
    expect(
      groundedQuestionSchema.safeParse({ text: "", citation: null }).success
    ).toBe(false);
  });
});

describe("cdmDraftSchema", () => {
  const valid = {
    title: "Chose Postgres over Mongo",
    situation: "We needed a datastore for the MVP.",
    cue: "Relational reporting kept coming up.",
    decision: "Picked Postgres.",
    why: "Reporting and constraints mattered more than flexibility.",
    outcome: "Shipped on time; reports were easy.",
  };

  it("accepts a full CDM draft", () => {
    expect(cdmDraftSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts null for the optional cue and why fields", () => {
    const parsed = cdmDraftSchema.safeParse({
      ...valid,
      cue: null,
      why: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a draft missing a required field", () => {
    const { situation: _omit, ...rest } = valid;
    expect(cdmDraftSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a blank required field", () => {
    expect(
      cdmDraftSchema.safeParse({ ...valid, decision: "   " }).success
    ).toBe(false);
  });
});

describe("interviewEventSchema", () => {
  it("accepts a known event", () => {
    expect(interviewEventSchema.safeParse({ type: "accept" }).success).toBe(
      true
    );
  });

  it("accepts an event that carries a payload", () => {
    expect(
      interviewEventSchema.safeParse({
        type: "answer_submitted",
        answer: "We chose X.",
      }).success
    ).toBe(true);
  });

  it("rejects an unknown event type", () => {
    expect(interviewEventSchema.safeParse({ type: "explode" }).success).toBe(
      false
    );
  });
});

describe("interviewStateSchema", () => {
  it("accepts a planning state", () => {
    const parsed = interviewStateSchema.safeParse({
      status: "planning",
      questionBudget: 6,
      askedCount: 0,
      failureCount: 0,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a paused state with a valid reason", () => {
    const parsed = interviewStateSchema.safeParse({
      status: "paused",
      reason: "circuit_breaker",
      questionBudget: 6,
      askedCount: 2,
      failureCount: 3,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a paused state with an invalid reason", () => {
    const parsed = interviewStateSchema.safeParse({
      status: "paused",
      reason: "whatever",
      questionBudget: 6,
      askedCount: 0,
      failureCount: 0,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(
      interviewStateSchema.safeParse({
        status: "dreaming",
        questionBudget: 6,
        askedCount: 0,
        failureCount: 0,
      }).success
    ).toBe(false);
  });
});

describe("enums", () => {
  it("lists the eight interview statuses", () => {
    expect([...INTERVIEW_STATUSES].sort()).toEqual(
      [
        "asking",
        "awaiting_answer",
        "awaiting_confirmation",
        "complete",
        "paraphrasing",
        "paused",
        "planning",
        "saving",
      ].sort()
    );
  });

  it("lists the two paused reasons", () => {
    expect([...PAUSED_REASONS].sort()).toEqual(["circuit_breaker", "user"]);
  });
});
