import { describe, it, expect } from "vitest";
import type { Citation } from "@/lib/rag/types";
import {
  verdictToCategory,
  summarize,
  evidenceCell,
  selectActiveRole,
} from "./presentation";

const cite = (title: string): Citation => ({
  source: "file",
  id: title.toLowerCase().replace(/\s+/g, "-"),
  title,
});

describe("verdictToCategory (ADR-0024: one category per verdict)", () => {
  it("maps met to Demonstrated (green)", () => {
    expect(verdictToCategory("met")).toEqual({
      category: "demonstrated",
      label: "Demonstrated",
      tone: "green",
    });
  });

  it("gives partial its own Partially demonstrated category (blue), not Supported", () => {
    expect(verdictToCategory("partial")).toEqual({
      category: "partial",
      label: "Partially demonstrated",
      tone: "blue",
    });
  });

  it("maps unknown to Unverified (orange) — no evidence retrieved, not a failure", () => {
    expect(verdictToCategory("unknown")).toEqual({
      category: "unverified",
      label: "Unverified",
      tone: "orange",
    });
  });

  it("maps gap to Development opportunity (gray), never a hiring verdict", () => {
    expect(verdictToCategory("gap")).toEqual({
      category: "development",
      label: "Development opportunity",
      tone: "gray",
    });
  });
});

describe("summarize (four categories)", () => {
  it("counts each category separately — partial no longer folds into demonstrated", () => {
    const s = summarize(["met", "partial", "met", "unknown", "gap"]);
    expect(s).toEqual({
      demonstrated: 2,
      partiallyDemonstrated: 1,
      unverified: 1,
      development: 1,
      assessed: 5,
    });
  });

  it("returns all-zero for an empty list", () => {
    expect(summarize([])).toEqual({
      demonstrated: 0,
      partiallyDemonstrated: 0,
      unverified: 0,
      development: 0,
      assessed: 0,
    });
  });
});

describe("evidenceCell", () => {
  it("shows the primary citation and source count for a demonstrated (met) verdict", () => {
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

  it("shows the citation for a partial verdict (the category label carries the nuance)", () => {
    const cell = evidenceCell({
      verdict: "partial",
      citations: [cite("Co-lead note")],
      rationale: "x",
    });
    expect(cell).toEqual({
      kind: "evidence",
      text: "Co-lead note · 1 source",
    });
  });

  it("falls back to a generic line when a cited verdict has no citations", () => {
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

  it("routes an unverified (unknown) requirement to investigation, not a file upload or course (AC2)", () => {
    const cell = evidenceCell({
      verdict: "unknown",
      citations: [],
      rationale: "",
    });
    expect(cell.kind).toBe("next_step");
    if (cell.kind === "next_step") {
      expect(cell.href).toBe("/dashboard/investigations");
      expect(cell.text.length).toBeGreaterThan(0);
      // Must not push the user toward training/qualification.
      expect(cell.text.toLowerCase()).not.toMatch(/course|training|qualif/);
    }
  });

  it("shows the rationale for a development opportunity (gap)", () => {
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

  it("falls back to a standard line when a development opportunity has no rationale", () => {
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
