import { describe, it, expect } from "vitest";
import { buildContext, isRelevant, formatHit } from "./context";
import { NOT_FOUND } from "./config";
import type { Hit } from "./types";

function hit(over: Partial<Hit> = {}): Hit {
  return {
    id: "onet:15-2051.00:tasks",
    source: "onet",
    ref_id: "15-2051.00",
    title: "Data Scientists",
    section: "tasks",
    content: "Analyze data to build predictive models.",
    keyword_rank: null,
    semantic_rank: 1,
    similarity: 0.5,
    score: 0.02,
    ...over,
  };
}

describe("isRelevant", () => {
  it("keeps a keyword-only hit even with low/null similarity", () => {
    expect(isRelevant(hit({ keyword_rank: 1, similarity: null }), 0.3)).toBe(
      true
    );
  });
  it("keeps a vector hit at or above the threshold", () => {
    expect(isRelevant(hit({ keyword_rank: null, similarity: 0.3 }), 0.3)).toBe(
      true
    );
  });
  it("drops a vector-only hit below the threshold", () => {
    expect(isRelevant(hit({ keyword_rank: null, similarity: 0.29 }), 0.3)).toBe(
      false
    );
  });
});

describe("formatHit", () => {
  it("renders [source · id · section] content", () => {
    expect(formatHit(hit())).toBe(
      "[onet · 15-2051.00 · tasks] Analyze data to build predictive models."
    );
  });
  it("omits the 'entity' pseudo-section", () => {
    expect(
      formatHit(
        hit({
          source: "techfleet-spf",
          ref_id: "sql",
          section: "entity",
          content: "SQL",
        })
      )
    ).toBe("[techfleet-spf · sql] SQL");
  });
});

describe("buildContext", () => {
  it("returns the reference sentinel when nothing is relevant", () => {
    const out = buildContext([hit({ keyword_rank: null, similarity: 0.1 })], {
      corpus: "reference",
    });
    expect(out.found).toBe(false);
    expect(out.context).toBe(NOT_FOUND.reference);
    expect(out.sources).toEqual([]);
    expect(out.hits).toHaveLength(1); // raw hits preserved for debugging
  });

  it("returns the evidence sentinel for the evidence corpus", () => {
    const out = buildContext([], { corpus: "evidence" });
    expect(out.found).toBe(false);
    expect(out.context).toBe(NOT_FOUND.evidence);
  });

  it("builds grounded context and deduped citations from relevant hits", () => {
    const out = buildContext(
      [
        hit({ ref_id: "15-2051.00", section: "tasks", similarity: 0.6 }),
        hit({
          id: "onet:15-2051.00:skills",
          ref_id: "15-2051.00", // same occupation, different section
          section: "skills",
          content: "Programming; Statistics.",
          similarity: 0.55,
        }),
        hit({
          id: "techfleet-spf:sql:entity",
          source: "techfleet-spf",
          ref_id: "sql",
          title: "SQL",
          section: "entity",
          content: "Structured Query Language.",
          keyword_rank: 1,
          similarity: null,
        }),
      ],
      { corpus: "reference" }
    );
    expect(out.found).toBe(true);
    expect(out.context).toContain("[onet · 15-2051.00 · tasks]");
    expect(out.context).toContain("[techfleet-spf · sql]");
    // Two occupation sections dedup to one citation; SQL is a second.
    expect(out.sources).toEqual([
      { source: "onet", id: "15-2051.00", title: "Data Scientists" },
      { source: "techfleet-spf", id: "sql", title: "SQL" },
    ]);
  });

  it("drops irrelevant hits but keeps the relevant ones", () => {
    const out = buildContext(
      [
        hit({ ref_id: "A", keyword_rank: null, similarity: 0.1 }), // dropped
        hit({ ref_id: "B", keyword_rank: null, similarity: 0.9 }), // kept
      ],
      { corpus: "reference" }
    );
    expect(out.sources.map((s) => s.id)).toEqual(["B"]);
  });

  it("caps context at maxContextChars without splitting a block", () => {
    const big = "x".repeat(400);
    const out = buildContext(
      [
        hit({ ref_id: "A", content: big, similarity: 0.9 }),
        hit({ ref_id: "B", content: big, similarity: 0.9 }),
        hit({ ref_id: "C", content: big, similarity: 0.9 }),
      ],
      { corpus: "reference", maxContextChars: 500 }
    );
    // Only the first block fits under 500; blocks are whole.
    expect(out.context).toContain("· A · tasks]");
    expect(out.context).not.toContain("· B · tasks]");
    expect(out.context.length).toBeLessThanOrEqual(500);
  });

  it("always keeps at least the first relevant block even if it alone exceeds the cap", () => {
    const out = buildContext(
      [hit({ ref_id: "A", content: "y".repeat(50), similarity: 0.9 })],
      {
        corpus: "reference",
        maxContextChars: 10,
      }
    );
    expect(out.found).toBe(true);
    expect(out.context).toContain("· A · tasks]");
  });
});
