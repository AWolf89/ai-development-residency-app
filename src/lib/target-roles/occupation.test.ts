import { describe, it, expect } from "vitest";
import {
  buildRequirementsFromOccupation,
  rankOccupationSuggestions,
  type OccupationAttribute,
  type OccupationSuggestion,
} from "./occupation";

describe("buildRequirementsFromOccupation", () => {
  const attrs: OccupationAttribute[] = [
    { name: "Programming", importance: 4.5 },
    { name: "Critical Thinking", importance: 4.0 },
    { name: "English Language", importance: 3.0 },
  ];

  it("ranks by importance, descending (AC1)", () => {
    expect(buildRequirementsFromOccupation(attrs)).toEqual([
      "Programming",
      "Critical Thinking",
      "English Language",
    ]);
  });

  it("de-duplicates by name, keeping the highest importance", () => {
    const withDupe: OccupationAttribute[] = [
      { name: "Programming", importance: 2.0 },
      { name: "Programming", importance: 4.8 },
      { name: "Critical Thinking", importance: 4.0 },
    ];
    const result = buildRequirementsFromOccupation(withDupe);
    // The higher-rated "Programming" (4.8) outranks "Critical Thinking" (4.0),
    // and the duplicate is collapsed to one entry.
    expect(result).toEqual(["Programming", "Critical Thinking"]);
  });

  it("collapses case-insensitive duplicates to one entry", () => {
    const result = buildRequirementsFromOccupation([
      { name: "Programming", importance: 2.0 },
      { name: "programming", importance: 4.8 },
    ]);
    expect(result).toHaveLength(1);
  });

  it("drops blank names", () => {
    const result = buildRequirementsFromOccupation([
      { name: "   ", importance: 5 },
      { name: "Programming", importance: 4 },
    ]);
    expect(result).toEqual(["Programming"]);
  });

  it("caps the list at the limit, keeping the most important", () => {
    const many: OccupationAttribute[] = Array.from({ length: 20 }, (_, i) => ({
      name: `Skill ${String(i).padStart(2, "0")}`,
      importance: i,
    }));
    const result = buildRequirementsFromOccupation(many, 5);
    expect(result).toHaveLength(5);
    expect(result[0]).toBe("Skill 19");
  });

  it("orders ties by name for a stable result", () => {
    const ties: OccupationAttribute[] = [
      { name: "Beta", importance: 3 },
      { name: "Alpha", importance: 3 },
    ];
    expect(buildRequirementsFromOccupation(ties)).toEqual(["Alpha", "Beta"]);
  });

  it("returns an empty list for no attributes", () => {
    expect(buildRequirementsFromOccupation([])).toEqual([]);
  });
});

describe("rankOccupationSuggestions", () => {
  const candidates: OccupationSuggestion[] = [
    { id: "1", name: "Software Developers", code: "15-1252.00" },
    { id: "2", name: "Web Developers", code: "15-1254.00" },
    {
      id: "3",
      name: "Software Quality Assurance Analysts",
      code: "15-1253.00",
    },
    { id: "4", name: "Database Administrators", code: "15-1242.00" },
  ];

  it("puts prefix matches before contains-matches (AC2)", () => {
    const result = rankOccupationSuggestions("soft", candidates);
    expect(result.map((r) => r.id)).toEqual(["1", "3"]);
    // "Software …" start-matches come before none; "Microsoft" style contains
    // would follow. Here only the two Software* titles match.
  });

  it("includes contains-matches after prefix-matches", () => {
    const result = rankOccupationSuggestions("develop", candidates);
    // None start with "develop"; two contain it.
    expect(result.map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("is case-insensitive", () => {
    expect(
      rankOccupationSuggestions("WEB", candidates).map((r) => r.id)
    ).toEqual(["2"]);
  });

  it("drops non-matches", () => {
    expect(rankOccupationSuggestions("nurse", candidates)).toEqual([]);
  });

  it("returns nothing for a blank prefix", () => {
    expect(rankOccupationSuggestions("   ", candidates)).toEqual([]);
  });

  it("caps the result at the limit", () => {
    const result = rankOccupationSuggestions("s", candidates, 1);
    expect(result).toHaveLength(1);
  });
});
