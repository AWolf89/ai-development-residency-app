import { describe, it, expect } from "vitest";
import {
  reviewModelOutputSchema,
  reviewFlagSchema,
  reviewStateSchema,
  reviewEventSchema,
  isEvidenceDimension,
  REVIEW_DIMENSIONS,
} from "./types";

describe("reviewModelOutputSchema", () => {
  it("accepts a well-formed per-dimension output", () => {
    const parsed = reviewModelOutputSchema.safeParse({
      flags: [
        {
          severity: "serious",
          targetField: "outcome",
          message: "Claims a 50% gain the file does not show.",
          citations: [{ source: "file", id: "report.pdf" }],
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a bad severity, an empty message, and a missing field", () => {
    expect(
      reviewModelOutputSchema.safeParse({
        flags: [
          {
            severity: "fatal",
            targetField: "outcome",
            message: "x",
            citations: [],
          },
        ],
      }).success
    ).toBe(false);
    expect(
      reviewModelOutputSchema.safeParse({
        flags: [
          {
            severity: "info",
            targetField: "outcome",
            message: "",
            citations: [],
          },
        ],
      }).success
    ).toBe(false);
    expect(
      reviewModelOutputSchema.safeParse({
        flags: [
          {
            severity: "info",
            targetField: "nope",
            message: "x",
            citations: [],
          },
        ],
      }).success
    ).toBe(false);
  });
});

describe("reviewFlagSchema", () => {
  it("accepts a resolved flag and rejects a bad disposition/dimension", () => {
    expect(
      reviewFlagSchema.safeParse({
        dimension: "accuracy",
        severity: "caution",
        targetField: "decision",
        message: "Overstates scope.",
        citations: [{ source: "file", id: "a", title: "A" }],
        disposition: "pending",
      }).success
    ).toBe(true);
    expect(
      reviewFlagSchema.safeParse({
        dimension: "nope",
        severity: "caution",
        targetField: "decision",
        message: "x",
        citations: [],
        disposition: "pending",
      }).success
    ).toBe(false);
    expect(
      reviewFlagSchema.safeParse({
        dimension: "accuracy",
        severity: "caution",
        targetField: "decision",
        message: "x",
        citations: [],
        disposition: "maybe",
      }).success
    ).toBe(false);
  });
});

describe("reviewStateSchema", () => {
  it("accepts each state variant and rejects a bad status", () => {
    expect(
      reviewStateSchema.safeParse({
        status: "awaiting_review",
        flags: [],
        checkBudget: 4,
        checksDone: 4,
        failureCount: 0,
      }).success
    ).toBe(true);
    expect(
      reviewStateSchema.safeParse({
        status: "paused",
        reason: "circuit_breaker",
        flags: [],
        checkBudget: 4,
        checksDone: 1,
        failureCount: 3,
      }).success
    ).toBe(true);
    expect(reviewStateSchema.safeParse({ status: "nope" }).success).toBe(false);
    // negative counter rejected
    expect(
      reviewStateSchema.safeParse({
        status: "planning",
        checkBudget: 0,
        checksDone: 0,
        failureCount: 0,
      }).success
    ).toBe(false);
  });
});

describe("reviewEventSchema", () => {
  it("accepts a flag-carrying event and rejects an unknown type", () => {
    expect(
      reviewEventSchema.safeParse({ type: "flags_ready", flags: [] }).success
    ).toBe(true);
    expect(reviewEventSchema.safeParse({ type: "accept" }).success).toBe(true);
    expect(reviewEventSchema.safeParse({ type: "nope" }).success).toBe(false);
  });
});

describe("isEvidenceDimension", () => {
  it("marks support and accuracy as evidence-grounded, the rest intrinsic", () => {
    expect(isEvidenceDimension("support")).toBe(true);
    expect(isEvidenceDimension("accuracy")).toBe(true);
    expect(isEvidenceDimension("specificity")).toBe(false);
    expect(isEvidenceDimension("completeness")).toBe(false);
  });

  it("the dimension list is the four agreed in design review, in order", () => {
    expect(REVIEW_DIMENSIONS).toEqual([
      "support",
      "accuracy",
      "specificity",
      "completeness",
    ]);
  });
});
