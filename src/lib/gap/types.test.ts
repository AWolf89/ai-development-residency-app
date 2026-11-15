import { describe, it, expect } from "vitest";
import {
  GAP_VERDICTS,
  gapVerdictSchema,
  modelVerdictSchema,
  gapModelOutputSchema,
} from "./types";

describe("gap verdict taxonomy", () => {
  it("has exactly the four verdicts", () => {
    expect([...GAP_VERDICTS]).toEqual(["met", "partial", "gap", "unknown"]);
  });

  it("gapVerdictSchema accepts every verdict incl. unknown", () => {
    for (const v of GAP_VERDICTS) {
      expect(gapVerdictSchema.parse(v)).toBe(v);
    }
  });

  it("modelVerdictSchema rejects 'unknown' (model never emits it)", () => {
    expect(modelVerdictSchema.safeParse("unknown").success).toBe(false);
    expect(modelVerdictSchema.safeParse("met").success).toBe(true);
  });
});

describe("gapModelOutputSchema", () => {
  const valid = {
    verdict: "met",
    rationale: "The resume shows leading a migration.",
    citations: [{ source: "file", id: "resume.pdf" }],
  };

  it("accepts a valid payload", () => {
    expect(gapModelOutputSchema.parse(valid)).toEqual(valid);
  });

  it("accepts an empty citations array (gap verdicts need no citation)", () => {
    expect(
      gapModelOutputSchema.safeParse({
        ...valid,
        verdict: "gap",
        citations: [],
      }).success
    ).toBe(true);
  });

  it("rejects an unknown verdict", () => {
    expect(
      gapModelOutputSchema.safeParse({ ...valid, verdict: "unknown" }).success
    ).toBe(false);
  });

  it("rejects a missing rationale", () => {
    const { rationale, ...rest } = valid;
    void rationale;
    expect(gapModelOutputSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a malformed citation (missing id)", () => {
    expect(
      gapModelOutputSchema.safeParse({
        ...valid,
        citations: [{ source: "file" }],
      }).success
    ).toBe(false);
  });
});
