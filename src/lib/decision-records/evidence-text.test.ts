import { describe, it, expect } from "vitest";
import { decisionRecordToEvidenceText } from "./evidence-text";

const full = {
  title: "Migrated the billing service",
  situation: "Legacy monolith was timing out under load",
  cue: "p95 latency crossed 2s in peak hours",
  decision: "Extracted billing into its own service with a queue",
  why: "Isolate the hot path and scale it independently",
  outcome: "p95 dropped to 300ms; zero billing incidents since",
};

describe("decisionRecordToEvidenceText", () => {
  it("includes every field with its label", () => {
    const text = decisionRecordToEvidenceText(full);
    expect(text).toContain("Title: Migrated the billing service");
    expect(text).toContain("Situation: Legacy monolith");
    expect(text).toContain("Cue: p95 latency");
    expect(text).toContain("Decision: Extracted billing");
    expect(text).toContain("Why: Isolate the hot path");
    expect(text).toContain("Outcome: p95 dropped");
  });

  it("omits optional cue and why when blank or missing", () => {
    const text = decisionRecordToEvidenceText({
      ...full,
      cue: "",
      why: undefined,
    });
    expect(text).not.toContain("Cue:");
    expect(text).not.toContain("Why:");
    // required fields remain
    expect(text).toContain("Title:");
    expect(text).toContain("Situation:");
    expect(text).toContain("Decision:");
    expect(text).toContain("Outcome:");
  });

  it("separates fields with blank lines", () => {
    const text = decisionRecordToEvidenceText(full);
    expect(text).toContain("\n\n");
  });
});
