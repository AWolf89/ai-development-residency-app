import { describe, it, expect } from "vitest";
import {
  statusDisplay,
  categoryLabel,
  summarize,
  summaryLine,
  buildFacetTabs,
  parseFacet,
  filterClaims,
  usageLine,
} from "./presentation";
import type { Claim } from "./types";

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: "c1",
    title: "A claim",
    decision: null,
    category: "delivery",
    isMetric: false,
    status: "recollection",
    sourceFileIds: [],
    sourceCount: 0,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    history: [],
    usage: { requirementMatches: 0, fromInterview: false },
    ...overrides,
  };
}

describe("statusDisplay", () => {
  it("maps each status to its chip label + tone", () => {
    expect(statusDisplay("evidence_linked")).toEqual({
      label: "Evidence-linked",
      tone: "green",
    });
    expect(statusDisplay("recollection")).toEqual({
      label: "Your recollection",
      tone: "blue",
    });
    expect(statusDisplay("self_reported_metric")).toEqual({
      label: "Self-reported metric",
      tone: "orange",
    });
  });
});

describe("categoryLabel", () => {
  it("title-cases the facet", () => {
    expect(categoryLabel("stakeholders")).toBe("Stakeholders");
  });
});

describe("summarize / summaryLine", () => {
  it("counts claims, dedupes sources across claims, and takes the latest update", () => {
    const summary = summarize([
      claim({ sourceFileIds: ["f1", "f2"], updatedAt: "2026-11-05T00:00:00Z" }),
      claim({ sourceFileIds: ["f2", "f3"], updatedAt: "2026-11-09T00:00:00Z" }),
    ]);
    expect(summary.claimCount).toBe(2);
    expect(summary.sourceCount).toBe(3); // f1,f2,f3
    expect(summary.lastUpdated).toBe("2026-11-09T00:00:00Z");
  });

  it("handles zero claims", () => {
    const summary = summarize([]);
    expect(summary).toEqual({
      claimCount: 0,
      sourceCount: 0,
      lastUpdated: null,
    });
    expect(summaryLine(summary)).toBe("0 claims · 0 sources");
  });

  it("uses singular nouns for one", () => {
    const line = summaryLine({
      claimCount: 1,
      sourceCount: 1,
      lastUpdated: null,
    });
    expect(line).toBe("1 claim · 1 source");
  });

  it("appends the last-updated date when present", () => {
    const line = summaryLine({
      claimCount: 2,
      sourceCount: 0,
      lastUpdated: "2026-11-17T00:00:00Z",
    });
    expect(line).toContain("last updated");
  });
});

describe("buildFacetTabs", () => {
  it("always shows All plus the four facets with counts", () => {
    const tabs = buildFacetTabs([
      claim({ category: "delivery" }),
      claim({ category: "delivery" }),
      claim({ category: "leadership" }),
      claim({ category: null }), // unfiled → only in All
    ]);
    expect(tabs.map((t) => t.key)).toEqual([
      "all",
      "leadership",
      "delivery",
      "stakeholders",
      "technical",
    ]);
    const byKey = Object.fromEntries(tabs.map((t) => [t.key, t.count]));
    expect(byKey.all).toBe(4);
    expect(byKey.delivery).toBe(2);
    expect(byKey.leadership).toBe(1);
    expect(byKey.technical).toBe(0);
  });
});

describe("parseFacet", () => {
  it("accepts a known facet and all", () => {
    expect(parseFacet("delivery")).toBe("delivery");
    expect(parseFacet("all")).toBe("all");
  });
  it("defaults unknown or undefined to all", () => {
    expect(parseFacet("nope")).toBe("all");
    expect(parseFacet(undefined)).toBe("all");
  });
});

describe("filterClaims", () => {
  const claims = [
    claim({ id: "a", category: "delivery" }),
    claim({ id: "b", category: "leadership" }),
    claim({ id: "c", category: null }),
  ];
  it("returns everything for all", () => {
    expect(filterClaims(claims, "all").map((c) => c.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
  it("returns only a facet's claims for a category", () => {
    expect(filterClaims(claims, "delivery").map((c) => c.id)).toEqual(["a"]);
  });
});

describe("usageLine", () => {
  it("lists interview and gap-check usage", () => {
    expect(
      usageLine(
        claim({ usage: { requirementMatches: 2, fromInterview: true } })
      )
    ).toBe("Used in: 1 interview, 2 gap-check matches");
  });
  it("uses singular for one match", () => {
    expect(
      usageLine(
        claim({ usage: { requirementMatches: 1, fromInterview: false } })
      )
    ).toBe("Used in: 1 gap-check match");
  });
  it("is null when unused", () => {
    expect(usageLine(claim())).toBeNull();
  });
});
