import { describe, it, expect } from "vitest";
import { groundReconciliation, validateCitations } from "./compare";
import type { ReconciliationOutput } from "./types";
import type { Citation } from "@/lib/rag/types";

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
