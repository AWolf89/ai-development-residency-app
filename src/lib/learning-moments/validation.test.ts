import { describe, it, expect } from "vitest";
import { validateLearningMoment } from "./validation";
import { LEARNING_MOMENT_KINDS } from "./types";

// A complete, valid non-speed moment (no duration required).
const validInsight = {
  kind: "insight",
  context: "I kept fighting the type errors in the reducer.",
  shift: "Discriminated unions clicked — the compiler was guiding me.",
  result: "Refactored the FSM in an afternoon with no runtime bugs.",
};

const validSpeed = {
  ...validInsight,
  kind: "speed",
  duration: "3 weeks",
};

describe("validateLearningMoment", () => {
  it("accepts a valid moment and returns the cleaned value", () => {
    const result = validateLearningMoment(validInsight);
    expect(result).toEqual({
      ok: true,
      value: {
        kind: "insight",
        context: validInsight.context,
        shift: validInsight.shift,
        result: validInsight.result,
        duration: undefined,
        targetRoleId: undefined,
      },
    });
  });

  it("accepts every kind (non-speed needs no duration)", () => {
    for (const kind of LEARNING_MOMENT_KINDS) {
      const input =
        kind === "speed" ? { ...validSpeed } : { ...validInsight, kind };
      const result = validateLearningMoment(input);
      expect(result.ok, `kind ${kind} should validate`).toBe(true);
    }
  });

  // AC4: an empty / whitespace-only submission is rejected and nothing is saved.
  it("rejects a fully empty submission (AC4)", () => {
    const result = validateLearningMoment({
      kind: "insight",
      context: "",
      shift: "",
      result: "",
    });
    expect(result).toEqual({
      ok: false,
      error: "Describe the situation you were in.",
    });
  });

  it("treats whitespace-only fields as empty (AC4)", () => {
    const result = validateLearningMoment({
      kind: "insight",
      context: "   ",
      shift: "something",
      result: "something",
    });
    expect(result).toEqual({
      ok: false,
      error: "Describe the situation you were in.",
    });
  });

  it("rejects a missing / unknown kind", () => {
    expect(validateLearningMoment({ ...validInsight, kind: "" })).toEqual({
      ok: false,
      error: "Choose a kind of learning moment.",
    });
    expect(
      validateLearningMoment({ ...validInsight, kind: "mystery" })
    ).toEqual({ ok: false, error: "Choose a kind of learning moment." });
  });

  it("reports the first problem in field order", () => {
    // shift and result both blank -> shift is reported first.
    const result = validateLearningMoment({
      kind: "insight",
      context: "ok",
      shift: "",
      result: "",
    });
    expect(result).toEqual({
      ok: false,
      error: "Describe what you learned or what changed.",
    });
  });

  // AC2: "how long it took" is required for a speed moment only.
  it("requires duration when the kind is speed (AC2)", () => {
    const result = validateLearningMoment({ ...validSpeed, duration: "" });
    expect(result).toEqual({ ok: false, error: "Enter how long it took." });
  });

  it("does not require duration for non-speed kinds", () => {
    const result = validateLearningMoment({ ...validInsight, duration: "" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.duration).toBeUndefined();
  });

  it("keeps a supplied duration for a speed moment", () => {
    const result = validateLearningMoment(validSpeed);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.duration).toBe("3 weeks");
  });

  it("keeps a valid target role id and drops a malformed one", () => {
    const uuid = "22222222-2222-4222-8222-222222222222";
    const kept = validateLearningMoment({
      ...validInsight,
      targetRoleId: uuid,
    });
    expect(kept.ok && kept.value.targetRoleId).toBe(uuid);

    const dropped = validateLearningMoment({
      ...validInsight,
      targetRoleId: "not-a-uuid",
    });
    expect(dropped.ok).toBe(true);
    if (dropped.ok) expect(dropped.value.targetRoleId).toBeUndefined();
  });

  it("rejects a non-object input", () => {
    expect(validateLearningMoment(null)).toEqual({
      ok: false,
      error: "Choose a kind of learning moment.",
    });
  });
});
