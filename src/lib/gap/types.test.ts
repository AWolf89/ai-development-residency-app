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

  // Fail-safe parsing (ADR-0011): a malformed citation is DROPPED, not fatal — otherwise one
  // bad reply would 500 the whole gap check. resolveVerdict then downgrades uncited met/partial.
  it("drops a malformed citation (missing id) instead of failing the call", () => {
    const result = gapModelOutputSchema.safeParse({
      ...valid,
      citations: [{ source: "file" }],
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.citations).toEqual([]);
  });

  it("keeps well-formed citations and drops malformed ones in the same array", () => {
    const result = gapModelOutputSchema.safeParse({
      ...valid,
      citations: [
        { source: "file", id: "resume.pdf" },
        { source: "file" }, // missing id
        "onet:15-1252.00", // not even an object
        { source: "", id: "x" }, // blank source
      ],
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.citations).toEqual([
      { source: "file", id: "resume.pdf" },
    ]);
  });

  it("tolerates citations being absent or not an array (treats as none)", () => {
    const { citations, ...noCitations } = valid;
    void citations;
    expect(
      gapModelOutputSchema.safeParse(noCitations).success &&
        gapModelOutputSchema.parse(noCitations).citations
    ).toEqual([]);
    expect(
      gapModelOutputSchema.parse({ ...valid, citations: "nope" }).citations
    ).toEqual([]);
  });
});
