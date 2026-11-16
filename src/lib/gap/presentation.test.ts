import { describe, it, expect } from "vitest";
import type { Citation } from "@/lib/rag/types";
import {
  verdictToBucket,
  summarize,
  evidenceCell,
  selectActiveRole,
} from "./presentation";

const cite = (title: string): Citation => ({
  source: "file",
  id: title.toLowerCase().replace(/\s+/g, "-"),
  title,
});

describe("verdictToBucket", () => {
  it("maps met to Supported (green)", () => {
    expect(verdictToBucket("met")).toEqual({
      bucket: "supported",
      label: "Supported",
      tone: "green",
    });
  });

  it("maps partial to Supported too (it still rests on real evidence)", () => {
    expect(verdictToBucket("partial").bucket).toBe("supported");
    expect(verdictToBucket("partial").tone).toBe("green");
  });

  it("maps unknown to Undocumented (orange)", () => {
    expect(verdictToBucket("unknown")).toEqual({
      bucket: "undocumented",
      label: "Undocumented",
      tone: "orange",
    });
  });

  it("maps gap to True gap (gray)", () => {
    expect(verdictToBucket("gap")).toEqual({
      bucket: "true_gap",
      label: "True gap",
      tone: "gray",
    });
  });
});

describe("summarize", () => {
  it("counts each bucket, met+partial folding into supported", () => {
    const s = summarize(["met", "partial", "met", "unknown", "gap"]);
    expect(s).toEqual({
      supported: 3,
      undocumented: 1,
      trueGaps: 1,
      assessed: 5,
    });
  });

  it("returns all-zero for an empty list", () => {
    expect(summarize([])).toEqual({
      supported: 0,
      undocumented: 0,
      trueGaps: 0,
      assessed: 0,
    });
  });
});

describe("evidenceCell", () => {
  it("shows the primary citation and source count for a met verdict", () => {
    const cell = evidenceCell({
      verdict: "met",
      citations: [cite("Billing migration"), cite("Perf review")],
      rationale: "Clearly demonstrated.",
    });
    expect(cell).toEqual({
      kind: "evidence",
      text: "Billing migration · 2 sources",
    });
  });

  it("uses the singular 'source' for one citation", () => {
    const cell = evidenceCell({
      verdict: "met",
      citations: [cite("Roadmap deck")],
      rationale: "x",
    });
    expect(cell).toEqual({
      kind: "evidence",
      text: "Roadmap deck · 1 source",
    });
  });

  it("prefixes 'Partial:' for a partial verdict", () => {
    const cell = evidenceCell({
      verdict: "partial",
      citations: [cite("Co-lead note")],
      rationale: "x",
    });
    expect(cell).toEqual({
      kind: "evidence",
      text: "Partial: Co-lead note · 1 source",
    });
  });

  it("falls back to a generic line when a supported verdict has no citations", () => {
    const cell = evidenceCell({
      verdict: "met",
      citations: [],
      rationale: "x",
    });
    expect(cell).toEqual({
      kind: "evidence",
      text: "Supported by your evidence",
    });
  });

  it("returns an actionable next step pointing at files for undocumented", () => {
    const cell = evidenceCell({
      verdict: "unknown",
      citations: [],
      rationale: "",
    });
    expect(cell.kind).toBe("next_step");
    if (cell.kind === "next_step") {
      expect(cell.href).toBe("/dashboard/files");
      expect(cell.text.length).toBeGreaterThan(0);
    }
  });

  it("shows the rationale for a true gap", () => {
    const cell = evidenceCell({
      verdict: "gap",
      citations: [],
      rationale: "No evidence covers HIPAA experience.",
    });
    expect(cell).toEqual({
      kind: "none",
      text: "No evidence covers HIPAA experience.",
    });
  });

  it("falls back to a standard line when a true gap has no rationale", () => {
    const cell = evidenceCell({
      verdict: "gap",
      citations: [],
      rationale: "  ",
    });
    expect(cell).toEqual({
      kind: "none",
      text: "No evidence or recollection found",
    });
  });
});

describe("selectActiveRole", () => {
  const roles = [{ id: "r1" }, { id: "r2" }, { id: "r3" }];

  it("returns the role named by the param when it is one the user owns", () => {
    expect(selectActiveRole(roles, "r2")).toEqual({ id: "r2" });
  });

  it("falls back to the first (newest) role when the param is missing", () => {
    expect(selectActiveRole(roles, undefined)).toEqual({ id: "r1" });
  });

  it("falls back to the first role when the param is not one the user owns", () => {
    expect(selectActiveRole(roles, "someone-elses-id")).toEqual({ id: "r1" });
  });

  it("returns undefined when the user has no roles", () => {
    expect(selectActiveRole([], "r1")).toBeUndefined();
  });
});
