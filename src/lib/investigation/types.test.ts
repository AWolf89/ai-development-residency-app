import { describe, it, expect } from "vitest";
import {
  requirementSchema,
  citationSchema,
  confidenceSchema,
  reflectOutputSchema,
  findingSchema,
  investigationStateSchema,
  investigationEventSchema,
} from "./types";

const FINDING = {
  requirementId: "req-1",
  verdict: "partial" as const,
  rationale: "Evidence shows partial coverage.",
  citations: [{ source: "file", id: "doc-3", title: "Project brief" }],
  confidence: "medium" as const,
  searchCount: 2,
};

describe("requirementSchema", () => {
  it("accepts a well-formed requirement", () => {
    expect(
      requirementSchema.safeParse({ id: "r1", text: "Lead a team" }).success
    ).toBe(true);
  });
  it("rejects empty id or text", () => {
    expect(requirementSchema.safeParse({ id: "", text: "x" }).success).toBe(
      false
    );
    expect(requirementSchema.safeParse({ id: "r1", text: "" }).success).toBe(
      false
    );
  });
});

describe("citationSchema", () => {
  it("requires source, id, and title", () => {
    expect(
      citationSchema.safeParse({ source: "file", id: "d1", title: "T" }).success
    ).toBe(true);
    expect(citationSchema.safeParse({ source: "file", id: "d1" }).success).toBe(
      false
    );
  });
});

describe("confidenceSchema", () => {
  it("accepts the three levels and rejects anything else", () => {
    for (const c of ["low", "medium", "high"]) {
      expect(confidenceSchema.safeParse(c).success).toBe(true);
    }
    expect(confidenceSchema.safeParse("certain").success).toBe(false);
  });
});

describe("reflectOutputSchema", () => {
  it("accepts a valid reflect output", () => {
    const ok = {
      sufficient: false,
      nextQuery: "led cross-team migration",
      verdict: "gap",
      rationale: "Not yet substantiated.",
      citations: [{ source: "file", id: "d1" }],
      confidence: "low",
    };
    expect(reflectOutputSchema.safeParse(ok).success).toBe(true);
  });
  it("allows a null nextQuery", () => {
    const ok = {
      sufficient: true,
      nextQuery: null,
      verdict: "met",
      rationale: "Fully covered.",
      citations: [{ source: "file", id: "d1" }],
      confidence: "high",
    };
    expect(reflectOutputSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects an unknown verdict (model never emits `unknown`)", () => {
    const bad = {
      sufficient: true,
      nextQuery: null,
      verdict: "unknown",
      rationale: "x",
      citations: [],
      confidence: "high",
    };
    expect(reflectOutputSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects a rationale over the length cap", () => {
    const bad = {
      sufficient: true,
      nextQuery: null,
      verdict: "met",
      rationale: "x".repeat(601),
      citations: [],
      confidence: "high",
    };
    expect(reflectOutputSchema.safeParse(bad).success).toBe(false);
  });
});

describe("findingSchema", () => {
  it("accepts a well-formed finding", () => {
    expect(findingSchema.safeParse(FINDING).success).toBe(true);
  });
  it("rejects a negative searchCount", () => {
    expect(
      findingSchema.safeParse({ ...FINDING, searchCount: -1 }).success
    ).toBe(false);
  });
});

describe("investigationStateSchema", () => {
  it("accepts each state variant with its required fields", () => {
    const base = { searchBudget: 3, searchCount: 0, failureCount: 0 };
    const req = { id: "r1", text: "Lead a team" };
    expect(
      investigationStateSchema.safeParse({
        status: "planning",
        requirement: req,
        ...base,
      }).success
    ).toBe(true);
    expect(
      investigationStateSchema.safeParse({
        status: "searching",
        requirement: req,
        query: "q",
        ...base,
      }).success
    ).toBe(true);
    expect(
      investigationStateSchema.safeParse({
        status: "awaiting_review",
        requirement: req,
        finding: FINDING,
        ...base,
      }).success
    ).toBe(true);
    expect(
      investigationStateSchema.safeParse({
        status: "paused",
        requirement: req,
        reason: "circuit_breaker",
        query: "q",
        ...base,
      }).success
    ).toBe(true);
  });
  it("rejects a searching state with no query", () => {
    const bad = {
      status: "searching",
      requirement: { id: "r1", text: "t" },
      searchBudget: 3,
      searchCount: 0,
      failureCount: 0,
    };
    expect(investigationStateSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects a non-positive searchBudget", () => {
    const bad = {
      status: "planning",
      requirement: { id: "r1", text: "t" },
      searchBudget: 0,
      searchCount: 0,
      failureCount: 0,
    };
    expect(investigationStateSchema.safeParse(bad).success).toBe(false);
  });
});

describe("investigationEventSchema", () => {
  it("accepts the orchestrator and user events", () => {
    expect(
      investigationEventSchema.safeParse({ type: "search_planned", query: "q" })
        .success
    ).toBe(true);
    expect(
      investigationEventSchema.safeParse({ type: "retrieved" }).success
    ).toBe(true);
    expect(
      investigationEventSchema.safeParse({
        type: "substantiated",
        finding: FINDING,
      }).success
    ).toBe(true);
    expect(
      investigationEventSchema.safeParse({
        type: "insufficient",
        nextQuery: null,
      }).success
    ).toBe(true);
    expect(investigationEventSchema.safeParse({ type: "accept" }).success).toBe(
      true
    );
  });
  it("rejects a search_planned event with an empty query", () => {
    expect(
      investigationEventSchema.safeParse({ type: "search_planned", query: "" })
        .success
    ).toBe(false);
  });
});
