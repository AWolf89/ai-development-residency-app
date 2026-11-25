import { describe, it, expect } from "vitest";
import { LIBRARY_TABS, resolveActiveTab } from "./library-tabs";

describe("LIBRARY_TABS (ADR-0027)", () => {
  it("has the four Evidence Library tabs, in order", () => {
    expect(LIBRARY_TABS.map((t) => t.label)).toEqual([
      "Projects",
      "Claims",
      "Learning moments",
      "Sources",
    ]);
  });

  it("every tab's href is one of the routes it owns", () => {
    for (const tab of LIBRARY_TABS) {
      expect(tab.owns).toContain(tab.href);
    }
  });
});

describe("resolveActiveTab — each route maps to its tab", () => {
  const cases: Array<[string, string]> = [
    ["/dashboard/projects", "Projects"],
    ["/dashboard/projects/abc-123", "Projects"],
    ["/dashboard/claims", "Claims"],
    // A claim is a projection over decision records, so those highlight Claims.
    ["/dashboard/decision-records/new", "Claims"],
    ["/dashboard/decision-records/42/review", "Claims"],
    ["/dashboard/learning-moments", "Learning moments"],
    ["/dashboard/files", "Sources"],
    ["/dashboard/files/9", "Sources"],
  ];
  it.each(cases)("%s highlights %s", (path, label) => {
    expect(resolveActiveTab(path)?.label).toBe(label);
  });
});

describe("resolveActiveTab — outside the Evidence Library", () => {
  it.each([
    "/dashboard",
    "/dashboard/target-roles/1",
    "/dashboard/gap-check",
    "/dashboard/investigations",
    "/dashboard/flow",
    "/login",
  ])("%s has no active tab", (path) => {
    expect(resolveActiveTab(path)).toBeNull();
  });

  it("does not match on a shared string prefix (segment boundary only)", () => {
    expect(resolveActiveTab("/dashboard/projects-archive")).toBeNull();
  });
});
