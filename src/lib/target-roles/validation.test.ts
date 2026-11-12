import { describe, it, expect } from "vitest";
import {
  validateTargetRoleIntake,
  validateTargetRoleFromTitle,
  validateJobDescription,
  MIN_JD_LENGTH,
} from "./validation";

// Pure-logic unit tests (Humble Object): canned inputs, no network.
const longJd = "a".repeat(MIN_JD_LENGTH + 5);

describe("validateJobDescription", () => {
  it("accepts a long-enough description and trims it", () => {
    const result = validateJobDescription(`  ${longJd}  `);
    expect(result).toEqual({ ok: true, value: longJd });
  });

  it("rejects a non-string or empty description", () => {
    expect(validateJobDescription(undefined)).toEqual({
      ok: false,
      error: "Paste a job description.",
    });
    expect(validateJobDescription("   ")).toEqual({
      ok: false,
      error: "Paste a job description.",
    });
  });

  it("rejects a too-short description (AC9)", () => {
    const result = validateJobDescription("too short");
    expect(result.ok).toBe(false);
  });
});

describe("validateTargetRoleIntake", () => {
  const valid = {
    title: "Senior Data Engineer",
    jobDescription: longJd,
    requirements: ["5+ years with Python", "Experience with Postgres"],
  };

  it("accepts a complete intake and returns cleaned values", () => {
    const result = validateTargetRoleIntake(valid);
    expect(result).toEqual({ ok: true, value: valid });
  });

  it("trims the title and drops blank requirements", () => {
    const result = validateTargetRoleIntake({
      ...valid,
      title: "  Analyst  ",
      requirements: ["  SQL  ", "", "   "],
    });
    expect(result).toEqual({
      ok: true,
      value: { ...valid, title: "Analyst", requirements: ["SQL"] },
    });
  });

  it("rejects a non-object input", () => {
    expect(validateTargetRoleIntake(null)).toEqual({
      ok: false,
      error: "Enter a role title.",
    });
  });

  it("rejects a missing title", () => {
    const result = validateTargetRoleIntake({ ...valid, title: "   " });
    expect(result).toEqual({ ok: false, error: "Enter a role title." });
  });

  it("rejects a non-string title", () => {
    const result = validateTargetRoleIntake({ ...valid, title: 123 });
    expect(result).toEqual({ ok: false, error: "Enter a role title." });
  });

  it("ignores non-string requirement entries", () => {
    const result = validateTargetRoleIntake({
      ...valid,
      requirements: [123, "SQL", null],
    });
    expect(result).toEqual({
      ok: true,
      value: { ...valid, requirements: ["SQL"] },
    });
  });

  it("rejects a too-short job description (AC9)", () => {
    const result = validateTargetRoleIntake({ ...valid, jobDescription: "x" });
    expect(result.ok).toBe(false);
  });

  it("rejects when no non-blank requirement remains", () => {
    const result = validateTargetRoleIntake({
      ...valid,
      requirements: ["", " "],
    });
    expect(result).toEqual({
      ok: false,
      error: "Add at least one requirement before saving.",
    });
  });

  it("treats a missing requirements field as none", () => {
    const result = validateTargetRoleIntake({
      title: valid.title,
      jobDescription: valid.jobDescription,
    });
    expect(result.ok).toBe(false);
  });
});

describe("validateTargetRoleFromTitle", () => {
  it("accepts a title with requirements and no job description", () => {
    const result = validateTargetRoleFromTitle({
      title: "Software Developer",
      requirements: ["Programming", "Critical Thinking"],
    });
    expect(result).toEqual({
      ok: true,
      value: {
        title: "Software Developer",
        jobDescription: "",
        requirements: ["Programming", "Critical Thinking"],
      },
    });
  });

  it("keeps a job description when one is supplied, without a length check", () => {
    const result = validateTargetRoleFromTitle({
      title: "Software Developer",
      jobDescription: "short note",
      requirements: ["Programming"],
    });
    expect(result).toEqual({
      ok: true,
      value: {
        title: "Software Developer",
        jobDescription: "short note",
        requirements: ["Programming"],
      },
    });
  });

  it("still requires a title", () => {
    const result = validateTargetRoleFromTitle({
      title: "  ",
      requirements: ["Programming"],
    });
    expect(result).toEqual({ ok: false, error: "Enter a role title." });
  });

  it("still requires at least one requirement", () => {
    const result = validateTargetRoleFromTitle({
      title: "Software Developer",
      requirements: [],
    });
    expect(result).toEqual({
      ok: false,
      error: "Add at least one requirement before saving.",
    });
  });
});
