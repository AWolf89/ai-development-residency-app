/**
 * Unit tests for the structured provenance building blocks (ADR-0022 §5.2). Pins the rule that
 * matters most: an unset contribution is UNSPECIFIED, never defaulted to "individual" (AC4),
 * and a missing-info item must reference at least one subject (AC3).
 */
import { describe, it, expect } from "vitest";
import {
  parseContribution,
  contributionLabel,
  validateMissingInfoItem,
  contributionSchema,
} from "./types";

describe("parseContribution", () => {
  it("accepts the three valid labels", () => {
    expect(parseContribution("individual")).toBe("individual");
    expect(parseContribution("team")).toBe("team");
    expect(parseContribution("project")).toBe("project");
  });

  it("treats blank, missing, or unknown as unspecified (never 'individual') — AC4", () => {
    expect(parseContribution("")).toBeNull();
    expect(parseContribution(undefined)).toBeNull();
    expect(parseContribution(null)).toBeNull();
    expect(parseContribution("solo")).toBeNull();
    expect(parseContribution(3)).toBeNull();
  });
});

describe("contributionLabel", () => {
  it("labels each value and reads null as Unspecified", () => {
    expect(contributionLabel("team")).toBe("A team did this together");
    expect(contributionLabel(null)).toBe("Unspecified");
  });
});

describe("contributionSchema", () => {
  it("accepts exactly the three labels", () => {
    expect(contributionSchema.safeParse("project").success).toBe(true);
    expect(contributionSchema.safeParse("manager").success).toBe(false);
  });
});

describe("validateMissingInfoItem", () => {
  it("accepts an item referencing a decision record", () => {
    const result = validateMissingInfoItem({
      decisionRecordId: "11111111-1111-4111-8111-111111111111",
      description: "No source confirms the 30% figure.",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("open");
      expect(result.value.claimId).toBeNull();
    }
  });

  it("accepts an item referencing a claim or a requirement", () => {
    expect(
      validateMissingInfoItem({
        claimId: "22222222-2222-4222-9222-222222222222",
        description: "Which part was individual vs team?",
      }).ok
    ).toBe(true);
    expect(
      validateMissingInfoItem({
        roleRequirementId: "33333333-3333-4333-a333-333333333333",
        description: "No evidence retrieved for this requirement.",
      }).ok
    ).toBe(true);
  });

  it("rejects an item with no subject (AC3)", () => {
    const result = validateMissingInfoItem({
      description: "Floating item with nothing to hang off.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/record, claim, or requirement/);
    }
  });

  it("rejects an empty description", () => {
    const result = validateMissingInfoItem({
      decisionRecordId: "11111111-1111-4111-8111-111111111111",
      description: "   ",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-uuid subject id", () => {
    expect(
      validateMissingInfoItem({
        decisionRecordId: "not-a-uuid",
        description: "x",
      }).ok
    ).toBe(false);
  });
});
