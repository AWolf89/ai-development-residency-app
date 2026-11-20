import { describe, it, expect } from "vitest";
import {
  validateProjectInput,
  PROJECT_NAME_MAX,
  PROJECT_ROLE_MAX,
  PROJECT_ORG_MAX,
  PROJECT_SUMMARY_MAX,
} from "./validation";

/** A valid input with only the required field; everything else omitted. */
const minimal = { name: "Acme website relaunch" };

describe("validateProjectInput", () => {
  it("accepts a minimal project and defaults status to active, optionals to null", () => {
    const result = validateProjectInput(minimal);

    expect(result).toEqual({
      ok: true,
      value: {
        name: "Acme website relaunch",
        role: null,
        organisation: null,
        summary: null,
        status: "active",
        startedOn: null,
        endedOn: null,
      },
    });
  });

  it("accepts all fields and normalises/trims them", () => {
    const result = validateProjectInput({
      name: "  Mobile app  ",
      role: "  Tech lead ",
      organisation: " Acme Inc ",
      summary: " Rebuilt the app. ",
      status: "archived",
      startedOn: "2024-01-15",
      endedOn: "2025-03-01",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        name: "Mobile app",
        role: "Tech lead",
        organisation: "Acme Inc",
        summary: "Rebuilt the app.",
        status: "archived",
        startedOn: "2024-01-15",
        endedOn: "2025-03-01",
      },
    });
  });

  // --- name (required) ---
  it("rejects a missing name", () => {
    expect(validateProjectInput({}).ok).toBe(false);
  });

  it("rejects a blank / whitespace-only name", () => {
    expect(validateProjectInput({ name: "   " }).ok).toBe(false);
  });

  it("accepts a name at the max length and rejects one over it", () => {
    expect(
      validateProjectInput({ name: "a".repeat(PROJECT_NAME_MAX) }).ok
    ).toBe(true);
    expect(
      validateProjectInput({ name: "a".repeat(PROJECT_NAME_MAX + 1) }).ok
    ).toBe(false);
  });

  // --- optional field caps (boundary each) ---
  it("enforces the role cap at the boundary", () => {
    expect(
      validateProjectInput({ ...minimal, role: "a".repeat(PROJECT_ROLE_MAX) })
        .ok
    ).toBe(true);
    expect(
      validateProjectInput({
        ...minimal,
        role: "a".repeat(PROJECT_ROLE_MAX + 1),
      }).ok
    ).toBe(false);
  });

  it("enforces the organisation cap at the boundary", () => {
    expect(
      validateProjectInput({
        ...minimal,
        organisation: "a".repeat(PROJECT_ORG_MAX),
      }).ok
    ).toBe(true);
    expect(
      validateProjectInput({
        ...minimal,
        organisation: "a".repeat(PROJECT_ORG_MAX + 1),
      }).ok
    ).toBe(false);
  });

  it("enforces the summary cap at the boundary", () => {
    expect(
      validateProjectInput({
        ...minimal,
        summary: "a".repeat(PROJECT_SUMMARY_MAX),
      }).ok
    ).toBe(true);
    expect(
      validateProjectInput({
        ...minimal,
        summary: "a".repeat(PROJECT_SUMMARY_MAX + 1),
      }).ok
    ).toBe(false);
  });

  it("turns empty optional strings into null, not empty string", () => {
    const result = validateProjectInput({
      ...minimal,
      role: "   ",
      organisation: "",
      summary: "  ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.role).toBeNull();
      expect(result.value.organisation).toBeNull();
      expect(result.value.summary).toBeNull();
    }
  });

  // --- status enum ---
  it("accepts both valid status values", () => {
    expect(validateProjectInput({ ...minimal, status: "active" }).ok).toBe(
      true
    );
    expect(validateProjectInput({ ...minimal, status: "archived" }).ok).toBe(
      true
    );
  });

  it("rejects a status outside the enum", () => {
    expect(validateProjectInput({ ...minimal, status: "done" }).ok).toBe(false);
  });

  // --- dates (both optional, ended_on >= started_on) ---
  it("accepts both dates null", () => {
    expect(validateProjectInput(minimal).ok).toBe(true);
  });

  it("accepts a start-only date", () => {
    expect(
      validateProjectInput({ ...minimal, startedOn: "2024-01-01" }).ok
    ).toBe(true);
  });

  it("accepts an end-only date", () => {
    expect(validateProjectInput({ ...minimal, endedOn: "2024-01-01" }).ok).toBe(
      true
    );
  });

  it("accepts equal start and end dates", () => {
    expect(
      validateProjectInput({
        ...minimal,
        startedOn: "2024-01-01",
        endedOn: "2024-01-01",
      }).ok
    ).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    expect(
      validateProjectInput({
        ...minimal,
        startedOn: "2024-06-01",
        endedOn: "2024-01-01",
      }).ok
    ).toBe(false);
  });

  it("rejects a malformed date string", () => {
    expect(
      validateProjectInput({ ...minimal, startedOn: "15/01/2024" }).ok
    ).toBe(false);
    expect(validateProjectInput({ ...minimal, endedOn: "not-a-date" }).ok).toBe(
      false
    );
  });

  // --- defensive input guards ---
  it("ignores unknown / extra fields", () => {
    const result = validateProjectInput({ ...minimal, bogus: "x", id: 7 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toHaveProperty("bogus");
      expect(result.value).not.toHaveProperty("id");
    }
  });

  it("rejects a non-object or null input", () => {
    expect(validateProjectInput(null).ok).toBe(false);
    expect(validateProjectInput("nope").ok).toBe(false);
    expect(validateProjectInput(42).ok).toBe(false);
  });
});
