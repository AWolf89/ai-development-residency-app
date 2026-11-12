import { describe, it, expect } from "vitest";
import {
  matchFramework,
  pickOnetSearchTerm,
  type FrameworkItem,
} from "./matching";

const items: FrameworkItem[] = [
  { id: "sql", name: "SQL" },
  { id: "pm", name: "Project Management" },
  { id: "dv", name: "Data Visualization" },
  { id: "noise", name: "and the of" }, // all stopwords/short -> never matches
];

describe("matchFramework", () => {
  it("matches a single-word item fully contained in the requirement (AC5)", () => {
    const result = matchFramework(
      "5+ years of experience with SQL databases",
      items
    );
    expect(result).toEqual({ id: "sql", name: "SQL" });
  });

  it("matches a multi-word item when all its words are present", () => {
    const result = matchFramework("Agile project management experience", items);
    expect(result).toEqual({ id: "pm", name: "Project Management" });
  });

  it("returns null when coverage is below the threshold", () => {
    // Only 'communication' would overlap a 2-word item -> 0.5 < 0.6.
    const result = matchFramework("strong communication", [
      { id: "sc", name: "Stakeholder Communication" },
    ]);
    expect(result).toBeNull();
  });

  it("returns null when the requirement has no usable tokens", () => {
    expect(matchFramework("a, of; to", items)).toBeNull();
  });

  it("returns null when there are no items", () => {
    expect(matchFramework("SQL experience", [])).toBeNull();
  });

  it("skips items whose name has no usable tokens", () => {
    // 'noise' item is present but unusable; a real match still wins.
    const result = matchFramework("data visualization dashboards", items);
    expect(result).toEqual({ id: "dv", name: "Data Visualization" });
  });
});

describe("pickOnetSearchTerm", () => {
  it("returns the longest usable token", () => {
    // Longest token is first, so the reduce keeps it past shorter later tokens.
    expect(pickOnetSearchTerm("PostgreSQL migration tasks")).toBe("postgresql");
    // Longest token is last.
    expect(pickOnetSearchTerm("5+ years with PostgreSQL")).toBe("postgresql");
  });

  it("returns null when there is no usable token", () => {
    expect(pickOnetSearchTerm("a of to")).toBeNull();
  });
});
