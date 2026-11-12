import { describe, it, expect } from "vitest";
import { resolveSource } from "./source";

describe("resolveSource", () => {
  it("prefers a framework match (AC5/AC8)", () => {
    expect(
      resolveSource({ frameworkMatch: { id: "f1" }, onetMatch: { id: "o1" } })
    ).toEqual({ source: "framework", referenceItemId: "f1" });
  });

  it("falls back to O*NET when there is no framework match (AC6)", () => {
    expect(
      resolveSource({ frameworkMatch: null, onetMatch: { id: "o1" } })
    ).toEqual({ source: "onet", referenceItemId: "o1" });
  });

  it("keeps the pasted requirement when neither matches (AC7)", () => {
    expect(resolveSource({ frameworkMatch: null, onetMatch: null })).toEqual({
      source: "job_description",
      referenceItemId: null,
    });
  });
});
