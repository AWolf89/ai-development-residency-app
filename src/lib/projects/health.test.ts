import { describe, it, expect } from "vitest";
import {
  computeProjectHealth,
  deriveDisplayStatus,
  DISPLAY_STATUS_META,
} from "./health";
import type { ClaimLifecycleState } from "@/lib/claims/lifecycle";

describe("computeProjectHealth", () => {
  it("buckets lifecycles into supported / need-evidence / challenged", () => {
    const lifecycles: ClaimLifecycleState[] = [
      "supported",
      "user_confirmed",
      "draft",
      "needs_investigation",
      "challenged",
    ];
    expect(computeProjectHealth(lifecycles)).toEqual({
      supported: 2,
      needEvidence: 2,
      challenged: 1,
      claims: 5,
      toInvestigate: 3,
    });
  });

  it("excludes archived claims from every count", () => {
    expect(computeProjectHealth(["archived", "supported"])).toEqual({
      supported: 1,
      needEvidence: 0,
      challenged: 0,
      claims: 1,
      toInvestigate: 0,
    });
  });

  it("is all-zero for a project with no claims", () => {
    expect(computeProjectHealth([])).toEqual({
      supported: 0,
      needEvidence: 0,
      challenged: 0,
      claims: 0,
      toInvestigate: 0,
    });
  });

  it("counts toInvestigate as need-evidence plus challenged", () => {
    const health = computeProjectHealth([
      "needs_investigation",
      "challenged",
      "challenged",
    ]);
    expect(health.toInvestigate).toBe(3);
  });
});

describe("deriveDisplayStatus", () => {
  const zero = computeProjectHealth([]);

  it("reads an archived project as Complete regardless of health", () => {
    const withChallenge = computeProjectHealth(["challenged"]);
    expect(deriveDisplayStatus("archived", withChallenge)).toBe("complete");
  });

  it("reads an active project with an open challenge as Needs attention", () => {
    expect(
      deriveDisplayStatus("active", computeProjectHealth(["challenged"]))
    ).toBe("needs_attention");
  });

  it("reads an active project with no challenge as In progress", () => {
    expect(deriveDisplayStatus("active", computeProjectHealth(["draft"]))).toBe(
      "in_progress"
    );
    expect(deriveDisplayStatus("active", zero)).toBe("in_progress");
  });
});

describe("DISPLAY_STATUS_META", () => {
  it("has a label and tone for each status", () => {
    expect(DISPLAY_STATUS_META.in_progress.label).toBe("In progress");
    expect(DISPLAY_STATUS_META.needs_attention.label).toBe("Needs attention");
    expect(DISPLAY_STATUS_META.complete.label).toBe("Complete");
    for (const meta of Object.values(DISPLAY_STATUS_META)) {
      expect(meta.tone.length).toBeGreaterThan(0);
    }
  });
});
