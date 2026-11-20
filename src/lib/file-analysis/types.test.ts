import { describe, it, expect } from "vitest";
import {
  analysisOutputSchema,
  analysisStateSchema,
  analysisEventSchema,
  candidateSchema,
  proposedTagSchema,
  confidenceSchema,
} from "./types";

const UUID = "11111111-1111-4111-8111-111111111111";

const TAG = {
  referenceItemId: UUID,
  source: "techfleet-spf",
  entityType: "skills",
  externalId: "customer-journey-mapping",
  name: "Customer Journey Mapping",
  confidence: "high",
  rationale: "It maps a customer's experience across touchpoints.",
};

describe("confidenceSchema", () => {
  it("accepts the three levels and rejects anything else", () => {
    expect(confidenceSchema.parse("low")).toBe("low");
    expect(confidenceSchema.safeParse("certain").success).toBe(false);
  });
});

describe("candidateSchema / proposedTagSchema", () => {
  it("accepts a well-formed candidate", () => {
    expect(
      candidateSchema.safeParse({
        id: UUID,
        source: "techfleet-spf",
        entityType: "skills",
        externalId: "x",
        name: "X",
        description: null,
      }).success
    ).toBe(true);
  });

  it("requires a uuid candidate id", () => {
    expect(
      candidateSchema.safeParse({
        id: "not-a-uuid",
        source: "techfleet-spf",
        entityType: "skills",
        externalId: "x",
        name: "X",
        description: null,
      }).success
    ).toBe(false);
  });

  it("accepts a validated proposed tag and rejects an unknown confidence", () => {
    expect(proposedTagSchema.safeParse(TAG).success).toBe(true);
    expect(
      proposedTagSchema.safeParse({ ...TAG, confidence: "certain" }).success
    ).toBe(false);
  });
});

describe("analysisOutputSchema (model contract)", () => {
  it("accepts a well-formed output", () => {
    const parsed = analysisOutputSchema.parse({
      summary: "A customer journey map.",
      tags: [{ referenceItemId: UUID, confidence: "high", rationale: "a map" }],
      questions: ["Which project was this for?"],
    });
    expect(parsed.tags).toHaveLength(1);
  });

  it("rejects an empty summary and a bad confidence", () => {
    expect(
      analysisOutputSchema.safeParse({ summary: "", tags: [], questions: [] })
        .success
    ).toBe(false);
    expect(
      analysisOutputSchema.safeParse({
        summary: "ok",
        tags: [{ referenceItemId: UUID, confidence: "sure", rationale: "x" }],
        questions: [],
      }).success
    ).toBe(false);
  });
});

describe("analysisStateSchema (discriminated union)", () => {
  const counters = { questionBudget: 3, askedCount: 0, failureCount: 0 };

  it("accepts each state shape", () => {
    expect(
      analysisStateSchema.safeParse({ status: "analyzing", fileId: "f", ...counters }).success
    ).toBe(true);
    expect(
      analysisStateSchema.safeParse({
        status: "awaiting_review",
        fileId: "f",
        summary: "s",
        tags: [TAG],
        ...counters,
      }).success
    ).toBe(true);
    expect(
      analysisStateSchema.safeParse({
        status: "paused",
        fileId: "f",
        reason: "circuit_breaker",
        ...counters,
      }).success
    ).toBe(true);
  });

  it("rejects an unknown status and a missing counter", () => {
    expect(
      analysisStateSchema.safeParse({ status: "nope", fileId: "f", ...counters }).success
    ).toBe(false);
    expect(
      analysisStateSchema.safeParse({ status: "analyzing", fileId: "f" }).success
    ).toBe(false);
  });

  it("requires at least one question in awaiting_clarification", () => {
    expect(
      analysisStateSchema.safeParse({
        status: "awaiting_clarification",
        fileId: "f",
        summary: "s",
        tags: [],
        questions: [],
        ...counters,
      }).success
    ).toBe(false);
  });
});

describe("analysisEventSchema (discriminated union)", () => {
  it("accepts valid events and rejects an unknown type", () => {
    expect(
      analysisEventSchema.safeParse({
        type: "analyzed",
        summary: "s",
        tags: [TAG],
        questions: [{ text: "q?" }],
      }).success
    ).toBe(true);
    expect(analysisEventSchema.safeParse({ type: "accept" }).success).toBe(true);
    expect(
      analysisEventSchema.safeParse({ type: "edit", tags: [TAG] }).success
    ).toBe(true);
    expect(analysisEventSchema.safeParse({ type: "nope" }).success).toBe(false);
  });
});
