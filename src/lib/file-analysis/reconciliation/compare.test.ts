import { describe, it, expect } from "vitest";
import {
  groundReconciliation,
  validateCitations,
  windowizeForRetrieval,
  mergeRetrievals,
} from "./compare";
import type { ReconciliationOutput } from "./types";
import type { Citation, Hit, Retrieval } from "@/lib/rag/types";

const SOURCES: Citation[] = [
  { source: "file", id: "report.pdf", title: "Impact report" },
  { source: "decision_record", id: "rec-9", title: "Led the migration" },
];

const output = (
  flags: ReconciliationOutput["flags"] = []
): ReconciliationOutput => ({ flags });

describe("validateCitations", () => {
  it("keeps only citations pointing at really-retrieved sources", () => {
    const valid = validateCitations(
      [
        { source: "file", id: "report.pdf" },
        { source: "file", id: "ghost.pdf" },
      ],
      SOURCES
    );
    expect(valid).toEqual([
      { source: "file", id: "report.pdf", title: "Impact report" },
    ]);
  });

  it("dedups repeated citations", () => {
    const valid = validateCitations(
      [
        { source: "file", id: "report.pdf" },
        { source: "file", id: "report.pdf" },
      ],
      SOURCES
    );
    expect(valid).toHaveLength(1);
  });
});

describe("groundReconciliation", () => {
  it("keeps a grounded conflict with its values and a pending disposition", () => {
    const { flags, dropped } = groundReconciliation(
      output([
        {
          kind: "metric",
          message:
            "Processing-time reduction disagrees with the impact report.",
          newValue: "19%",
          existingValue: "10%",
          citations: [{ source: "file", id: "report.pdf" }],
        },
      ]),
      SOURCES
    );
    expect(dropped).toBe(0);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      kind: "metric",
      newValue: "19%",
      existingValue: "10%",
      disposition: "pending",
    });
    expect(flags[0].citations).toEqual([
      { source: "file", id: "report.pdf", title: "Impact report" },
    ]);
  });

  it("drops a flag that cites no really-retrieved source (no invented conflicts)", () => {
    const { flags, dropped } = groundReconciliation(
      output([
        {
          kind: "date",
          message: "Dates disagree with a document that was not retrieved.",
          citations: [{ source: "file", id: "ghost.pdf" }],
        },
      ]),
      SOURCES
    );
    expect(flags).toHaveLength(0);
    expect(dropped).toBe(1);
  });

  it("keeps a complementary match (safe to link) that cites a real record", () => {
    const { flags } = groundReconciliation(
      output([
        {
          kind: "complementary",
          message:
            "Adds detail to an existing record; link rather than duplicate.",
          citations: [{ source: "decision_record", id: "rec-9" }],
        },
      ]),
      SOURCES
    );
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe("complementary");
    expect(flags[0].newValue).toBeNull();
  });

  it("keeps the grounded flags and drops the ungrounded in a mixed batch", () => {
    const { flags, dropped } = groundReconciliation(
      output([
        {
          kind: "metric",
          message: "real",
          citations: [{ source: "file", id: "report.pdf" }],
        },
        {
          kind: "ownership",
          message: "invented",
          citations: [{ source: "file", id: "nope" }],
        },
        {
          kind: "date",
          message: "real2",
          citations: [{ source: "decision_record", id: "rec-9" }],
        },
      ]),
      SOURCES
    );
    expect(flags.map((f) => f.message)).toEqual(["real", "real2"]);
    expect(dropped).toBe(1);
  });
});

describe("windowizeForRetrieval", () => {
  it("returns the whole text as one window when it fits", () => {
    expect(windowizeForRetrieval("short", 10, 4)).toEqual(["short"]);
  });

  it("returns no windows for empty text", () => {
    expect(windowizeForRetrieval("", 10, 4)).toEqual([]);
  });

  it("spans start to end of a long document", () => {
    const text = "0123456789".repeat(3); // 30 chars
    const windows = windowizeForRetrieval(text, 10, 4);
    expect(windows).toHaveLength(3); // ceil(30/10)
    expect(windows[0]).toBe(text.slice(0, 10));
    expect(windows[windows.length - 1]).toBe(text.slice(20, 30)); // last window ends at EOF
  });

  it("caps the number of windows but still reaches the end", () => {
    const text = "0123456789".repeat(3); // 30 chars
    const windows = windowizeForRetrieval(text, 10, 2);
    expect(windows).toHaveLength(2);
    expect(windows[0]).toBe(text.slice(0, 10));
    expect(windows[1]).toBe(text.slice(20, 30));
  });
});

describe("mergeRetrievals", () => {
  const hit = (
    over: Partial<Hit> & Pick<Hit, "id" | "ref_id" | "score">
  ): Hit => ({
    source: "decision_record",
    title: over.ref_id,
    section: "entity",
    content: `content ${over.ref_id}`,
    keyword_rank: 1, // relevant → survives buildContext
    semantic_rank: null,
    similarity: null,
    ...over,
  });
  const retrieval = (hits: Hit[]): Retrieval => ({
    found: hits.length > 0,
    context: "",
    sources: [],
    hits,
  });

  it("unions hits across retrievals and de-dups by id, keeping the highest score", () => {
    const r1 = retrieval([
      hit({ id: "a", ref_id: "A", score: 1, content: "A v1" }),
      hit({ id: "b", ref_id: "B", score: 2 }),
    ]);
    const r2 = retrieval([
      hit({ id: "a", ref_id: "A", score: 5, content: "A v2" }), // higher score wins
      hit({ id: "c", ref_id: "C", score: 3 }),
    ]);
    const merged = mergeRetrievals([r1, r2]);
    expect(merged.found).toBe(true);
    // All three distinct sources surface — an overlap retrieved only by a later window is kept.
    expect(merged.sources.map((s) => s.id).sort()).toEqual(["A", "B", "C"]);
    // The higher-scoring copy of the duplicated hit is the one used.
    expect(merged.context).toContain("A v2");
    expect(merged.context).not.toContain("A v1");
  });

  it("is not found when no retrieval produced a hit", () => {
    expect(mergeRetrievals([retrieval([]), retrieval([])]).found).toBe(false);
  });
});
