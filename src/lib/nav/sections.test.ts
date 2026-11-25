import { describe, it, expect } from "vitest";
import { NAV_SECTIONS, resolveActiveSection } from "./sections";

describe("NAV_SECTIONS — four-section IA (ADR-0027)", () => {
  it("has exactly four primary sections, in order", () => {
    expect(NAV_SECTIONS.map((s) => s.label)).toEqual([
      "Guided Flow",
      "Evidence Library",
      "Career Profile",
      "Investigations",
    ]);
  });

  it("every section's primary href is one of the routes it owns", () => {
    for (const section of NAV_SECTIONS) {
      expect(section.owns).toContain(section.href);
    }
  });
});

describe("resolveActiveSection — primary destinations", () => {
  const cases: Array<[string, string]> = [
    ["/dashboard/flow", "Guided Flow"],
    ["/dashboard/projects", "Evidence Library"],
    ["/dashboard", "Career Profile"],
    ["/dashboard/investigations", "Investigations"],
  ];
  it.each(cases)("%s highlights %s", (path, label) => {
    expect(resolveActiveSection(path)?.label).toBe(label);
  });
});

describe("resolveActiveSection — sub-routes resolve to their owning section", () => {
  const cases: Array<[string, string]> = [
    // Guided Flow owns the interview step and resumable runs
    ["/dashboard/interview", "Guided Flow"],
    ["/dashboard/flow/anything", "Guided Flow"],
    // Evidence Library owns projects, claims, learning moments, sources, records
    ["/dashboard/projects/abc-123", "Evidence Library"],
    ["/dashboard/claims", "Evidence Library"],
    ["/dashboard/learning-moments", "Evidence Library"],
    ["/dashboard/files/42", "Evidence Library"],
    ["/dashboard/decision-records/new", "Evidence Library"],
    // Career Profile owns the profile home, target roles and the gap check
    ["/dashboard/target-roles/9", "Career Profile"],
    ["/dashboard/gap-check", "Career Profile"],
    ["/dashboard/about", "Career Profile"],
    // Investigations
    ["/dashboard/investigations", "Investigations"],
  ];
  it.each(cases)("%s highlights %s", (path, label) => {
    expect(resolveActiveSection(path)?.label).toBe(label);
  });
});

describe("resolveActiveSection — longest-prefix wins over the broad /dashboard", () => {
  it("does not let Career Profile's /dashboard swallow a deeper section's route", () => {
    expect(resolveActiveSection("/dashboard/projects")?.label).toBe(
      "Evidence Library"
    );
    expect(resolveActiveSection("/dashboard/investigations")?.label).toBe(
      "Investigations"
    );
  });

  it("matches a prefix only on a segment boundary, not a shared string prefix", () => {
    // "/dashboard-xyz" must not match the "/dashboard" prefix.
    expect(resolveActiveSection("/dashboard-xyz")).toBeNull();
  });
});

describe("resolveActiveSection — paths outside the dashboard", () => {
  it.each(["/login", "/signup", "/"])("%s has no active section", (path) => {
    expect(resolveActiveSection(path)).toBeNull();
  });
});

describe("resolveActiveSection — unknown dashboard pages fall back to Career Profile", () => {
  it("highlights Career Profile for a /dashboard page no longer prefix owns", () => {
    // Career Profile owns the bare "/dashboard", so it is the fallback for any
    // dashboard route a more specific section has not claimed (as the old nav fell
    // back to "My profile").
    expect(resolveActiveSection("/dashboard/unknown-feature")?.label).toBe(
      "Career Profile"
    );
  });
});
