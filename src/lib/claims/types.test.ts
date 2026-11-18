import { describe, it, expect } from "vitest";
import { claimCategorySchema, claimStatusSchema } from "./types";

describe("claimCategorySchema", () => {
  it("accepts the four facets", () => {
    for (const c of ["leadership", "delivery", "stakeholders", "technical"]) {
      expect(claimCategorySchema.safeParse(c).success).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(claimCategorySchema.safeParse("other").success).toBe(false);
    expect(claimCategorySchema.safeParse("").success).toBe(false);
    expect(claimCategorySchema.safeParse(null).success).toBe(false);
  });
});

describe("claimStatusSchema", () => {
  it("accepts the three statuses", () => {
    for (const s of ["evidence_linked", "recollection", "self_reported_metric"]) {
      expect(claimStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(claimStatusSchema.safeParse("linked").success).toBe(false);
  });
});
