import { describe, it, expect } from "vitest";
import { extractRequirements } from "./extract";

// Critical-path unit tests (100% coverage target). Canned job-description samples
// exercise each heuristic branch: section detection, multi-section collection,
// splitting, boilerplate drop, the no-section signal filter, marker stripping,
// and de-duplication.
describe("extractRequirements", () => {
  it("extracts one requirement per bullet under a Requirements section", () => {
    const jd = [
      "About us",
      "We build great things.",
      "",
      "Requirements:",
      "- 5+ years of Python",
      "- Experience with Postgres",
      "- React and Node", // no signal word: kept because it is inside the section
    ].join("\n");

    expect(extractRequirements(jd)).toEqual([
      "5+ years of Python",
      "Experience with Postgres",
      "React and Node",
    ]);
  });

  it("splits a numbered list and strips the numbering", () => {
    const jd = [
      "Qualifications",
      "1. Bachelor's degree in CS",
      "2) 3 years with Java",
    ].join("\n");
    expect(extractRequirements(jd)).toEqual([
      "Bachelor's degree in CS",
      "3 years with Java",
    ]);
  });

  it("splits a semicolon-separated line within a section", () => {
    const jd = [
      "Requirements:",
      "Python; SQL; strong communication skills",
    ].join("\n");
    expect(extractRequirements(jd)).toEqual([
      "Python",
      "SQL",
      "strong communication skills",
    ]);
  });

  it("collects multiple requirement sections and stops at a boilerplate section", () => {
    const jd = [
      "Requirements:",
      "- Experience with React",
      "Responsibilities:",
      "- Lead projects",
      "Benefits:",
      "- Free lunch",
    ].join("\n");
    expect(extractRequirements(jd)).toEqual([
      "Experience with React",
      "Lead projects",
    ]);
  });

  it("ends a section at a generic heading line", () => {
    const jd = [
      "Requirements:",
      "- Experience with React",
      "Location:",
      "- Remote office",
    ].join("\n");
    expect(extractRequirements(jd)).toEqual(["Experience with React"]);
  });

  it("keeps only signal lines and drops boilerplate when there is no section", () => {
    const jd = [
      "Join our team!",
      "You have 5+ years of experience with Python.",
      "We are an equal opportunity employer.",
      "We want someone with excellent communication skills and strong technical skills overall.",
    ].join("\n");
    expect(extractRequirements(jd)).toEqual([
      "You have 5+ years of experience with Python.",
      "We want someone with excellent communication skills and strong technical skills overall.",
    ]);
  });

  it("de-duplicates case-insensitively, keeping first casing", () => {
    const jd = ["Requirements:", "- Python", "- python", "- Python"].join("\n");
    expect(extractRequirements(jd)).toEqual(["Python"]);
  });

  it("returns an empty list for empty or whitespace-only input", () => {
    expect(extractRequirements("")).toEqual([]);
    expect(extractRequirements("   \n  \n")).toEqual([]);
  });

  it("returns an empty list for a non-string input", () => {
    expect(extractRequirements(undefined as unknown as string)).toEqual([]);
  });
});
