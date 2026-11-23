import { describe, it, expect } from "vitest";
import { toJson, toMarkdown } from "./export";
import type { Claim } from "./types";

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: "c1",
    claimId: "claim-1",
    title: "Co-led the billing migration",
    decision: "Picked a phased cutover",
    category: "delivery",
    isMetric: false,
    status: "evidence_linked",
    lifecycle: "supported",
    sourceFileIds: ["f1"],
    sourceCount: 1,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-10T00:00:00Z",
    history: [{ versionNumber: 1, createdAt: "2026-11-01T00:00:00Z" }],
    usage: { requirementMatches: 1, fromInterview: true },
    ...overrides,
  };
}

const NOW = new Date("2026-11-17T12:00:00Z");

describe("toJson", () => {
  it("emits a stable, parseable document", () => {
    const json = JSON.parse(toJson([claim()], NOW));
    expect(json.claimCount).toBe(1);
    expect(json.exportedAt).toBe("2026-11-17T12:00:00.000Z");
    expect(json.claims[0]).toMatchObject({
      title: "Co-led the billing migration",
      status: "evidence_linked",
      statusLabel: "Evidence-linked",
      sourceCount: 1,
      gapCheckMatches: 1,
      usedInInterview: true,
    });
  });

  it("handles an empty profile", () => {
    const json = JSON.parse(toJson([], NOW));
    expect(json.claimCount).toBe(0);
    expect(json.claims).toEqual([]);
  });
});

describe("toMarkdown", () => {
  it("renders a heading per claim with its status and facet", () => {
    const md = toMarkdown([claim()], NOW);
    expect(md).toContain("# Evidence profile");
    expect(md).toContain("## Co-led the billing migration");
    expect(md).toContain("**Status:** Evidence-linked");
    expect(md).toContain("**Facet:** Delivery");
    expect(md).toContain("**Used in:** interview, 1 gap-check match(es)");
  });

  it("labels an unfiled claim and omits an absent decision", () => {
    const md = toMarkdown(
      [
        claim({
          category: null,
          decision: null,
          usage: { requirementMatches: 0, fromInterview: false },
        }),
      ],
      NOW
    );
    expect(md).toContain("**Facet:** Unfiled");
    expect(md).not.toContain("**Decision:**");
    expect(md).not.toContain("**Used in:**");
  });

  it("handles an empty profile", () => {
    expect(toMarkdown([], NOW)).toContain("No claims yet.");
  });
});
