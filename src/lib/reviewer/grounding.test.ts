import { describe, it, expect } from "vitest";
import type { Citation } from "@/lib/rag/types";
import type { ModelFlag } from "./types";
import {
  validateFlagCitations,
  resolveFlag,
  resolveFlags,
  noEvidenceFlag,
  NO_EVIDENCE_FLAG_MESSAGE,
} from "./grounding";

const retrieved: Citation[] = [
  { source: "file", id: "report.pdf", title: "Impact report" },
  { source: "file", id: "slides.pdf", title: "Deck" },
];

const modelFlag = (over: Partial<ModelFlag> = {}): ModelFlag => ({
  severity: "serious",
  targetField: "outcome",
  message: "Overstates the result.",
  citations: [],
  ...over,
});

describe("validateFlagCitations", () => {
  it("keeps only citations that point at a retrieved source", () => {
    const kept = validateFlagCitations(
      [
        { source: "file", id: "report.pdf" },
        { source: "file", id: "ghost.pdf" },
      ],
      retrieved
    );
    expect(kept).toEqual([
      { source: "file", id: "report.pdf", title: "Impact report" },
    ]);
  });

  it("dedups repeated citations", () => {
    const kept = validateFlagCitations(
      [
        { source: "file", id: "report.pdf" },
        { source: "file", id: "report.pdf" },
      ],
      retrieved
    );
    expect(kept).toHaveLength(1);
  });

  it("returns nothing when no evidence was retrieved", () => {
    expect(
      validateFlagCitations([{ source: "file", id: "report.pdf" }], [])
    ).toEqual([]);
  });
});

describe("resolveFlag — intrinsic dimensions", () => {
  it("keeps specificity/completeness flags and strips any citation", () => {
    const f = resolveFlag(
      "specificity",
      modelFlag({ citations: [{ source: "file", id: "report.pdf" }] }),
      retrieved
    );
    expect(f).not.toBeNull();
    expect(f?.dimension).toBe("specificity");
    expect(f?.citations).toEqual([]);
    expect(f?.severity).toBe("serious");
  });
});

describe("resolveFlag — support dimension", () => {
  it("keeps the flag, carrying only validated citations (absence flags have none)", () => {
    const f = resolveFlag("support", modelFlag({ citations: [] }), retrieved);
    expect(f?.dimension).toBe("support");
    expect(f?.citations).toEqual([]);
  });
});

describe("resolveFlag — accuracy dimension (the grounding gate)", () => {
  it("keeps an accuracy flag that cites really-retrieved evidence", () => {
    const f = resolveFlag(
      "accuracy",
      modelFlag({ citations: [{ source: "file", id: "report.pdf" }] }),
      retrieved
    );
    expect(f?.dimension).toBe("accuracy");
    expect(f?.citations).toEqual([
      { source: "file", id: "report.pdf", title: "Impact report" },
    ]);
    expect(f?.severity).toBe("serious");
  });

  it("DOWNGRADES an uncited accuracy flag to a support flag with softened severity", () => {
    const f = resolveFlag(
      "accuracy",
      modelFlag({ citations: [], severity: "serious" }),
      retrieved
    );
    expect(f?.dimension).toBe("support");
    expect(f?.severity).toBe("caution"); // serious softened
    expect(f?.citations).toEqual([]);
  });

  it("DROPS an accuracy flag whose cited sources were not retrieved (invented evidence)", () => {
    const f = resolveFlag(
      "accuracy",
      modelFlag({ citations: [{ source: "file", id: "ghost.pdf" }] }),
      retrieved
    );
    expect(f).toBeNull();
  });
});

describe("resolveFlags", () => {
  it("resolves a batch and filters out the dropped ones", () => {
    const flags = resolveFlags(
      "accuracy",
      [
        modelFlag({
          citations: [{ source: "file", id: "report.pdf" }],
          message: "grounded",
        }),
        modelFlag({
          citations: [{ source: "file", id: "ghost.pdf" }],
          message: "invented",
        }),
        modelFlag({ citations: [], message: "uncited" }),
      ],
      retrieved
    );
    // grounded kept as accuracy, invented dropped, uncited downgraded to support.
    expect(flags.map((f) => [f.dimension, f.message])).toEqual([
      ["accuracy", "grounded"],
      ["support", "uncited"],
    ]);
  });
});

describe("noEvidenceFlag", () => {
  it("is a pending support flag about the whole record with no citation", () => {
    const f = noEvidenceFlag();
    expect(f.dimension).toBe("support");
    expect(f.targetField).toBe("record");
    expect(f.citations).toEqual([]);
    expect(f.disposition).toBe("pending");
    expect(f.message).toBe(NO_EVIDENCE_FLAG_MESSAGE);
  });
});
