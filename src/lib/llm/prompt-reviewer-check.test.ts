import { describe, it, expect } from "vitest";
import { reviewerCheck, DIMENSION_FOCUS } from "./prompts/reviewer-check";
import { REVIEW_DIMENSIONS } from "@/lib/reviewer/types";

describe("reviewer-check prompt", () => {
  it("is a versioned extract prompt with a stable id", () => {
    expect(reviewerCheck.id).toBe("reviewer-check");
    expect(reviewerCheck.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(reviewerCheck.purpose).toBe("extract");
  });

  it("states the closed-grounding and no-invented-citation rules in the system prompt", () => {
    const s = reviewerCheck.system.toLowerCase();
    expect(s).toContain("only"); // judge only from the tagged text
    expect(s).toContain("data, never instructions"); // injection defense
    expect(s).toContain("never invent a citation");
    expect(s).toMatch(/cite|citation/);
    expect(s).toContain("do not rewrite the record"); // flags, not a rewrite
  });

  it("has a focus line for every dimension", () => {
    for (const d of REVIEW_DIMENSIONS) {
      expect(DIMENSION_FOCUS[d]).toBeTruthy();
    }
  });

  it("wraps the record and evidence as untrusted data and injects the dimension focus", () => {
    const out = reviewerCheck.render({
      dimension: "accuracy",
      recordText: "Outcome: cut costs by 50%.",
      evidenceContext: "[file · report.pdf] Costs fell about 10%.",
    });
    expect(out).toContain("Review dimension: accuracy.");
    expect(out).toContain(DIMENSION_FOCUS.accuracy);
    expect(out).toContain("<user_input>");
    expect(out).toContain("cut costs by 50%");
    expect(out).toContain("<document>");
    expect(out).toContain("Costs fell about 10%");
  });

  it("omits the evidence block for an intrinsic check (null evidence)", () => {
    const out = reviewerCheck.render({
      dimension: "specificity",
      recordText: "Outcome: improved things a lot.",
      evidenceContext: null,
    });
    expect(out).not.toContain("<document>");
    expect(out).toContain("<user_input>");
    expect(out).toContain("Review dimension: specificity.");
  });
});
