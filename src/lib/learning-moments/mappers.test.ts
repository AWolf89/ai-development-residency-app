import { describe, it, expect } from "vitest";
import { mapLearningMomentToRow } from "./mappers";
import type { LearningMomentInput } from "./types";

const userId = "11111111-1111-1111-1111-111111111111";

describe("mapLearningMomentToRow", () => {
  it("maps all fields and stamps the user id", () => {
    const input: LearningMomentInput = {
      kind: "speed",
      context: "New codebase, no docs.",
      shift: "Learned the build + deploy flow.",
      result: "Shipped my first PR in week one.",
      duration: "5 days",
      targetRoleId: "33333333-3333-3333-3333-333333333333",
    };
    expect(mapLearningMomentToRow(input, userId)).toEqual({
      user_id: userId,
      kind: "speed",
      context: input.context,
      shift: input.shift,
      result: input.result,
      duration: "5 days",
      target_role_id: "33333333-3333-3333-3333-333333333333",
      project_id: null,
      interview_session_id: null,
    });
  });

  it("carries an assigned project id, or null when none is given", () => {
    const input: LearningMomentInput = {
      kind: "insight",
      context: "c",
      shift: "s",
      result: "r",
    };
    expect(mapLearningMomentToRow(input, userId, "p-7").project_id).toBe("p-7");
    expect(mapLearningMomentToRow(input, userId, null).project_id).toBeNull();
    expect(mapLearningMomentToRow(input, userId).project_id).toBeNull();
  });

  it("carries an interview session id (ADR-0025), or null for manual entry", () => {
    const input: LearningMomentInput = {
      kind: "pivot",
      context: "c",
      shift: "s",
      result: "r",
    };
    expect(
      mapLearningMomentToRow(input, userId, null, "sess-1").interview_session_id
    ).toBe("sess-1");
    expect(
      mapLearningMomentToRow(input, userId).interview_session_id
    ).toBeNull();
  });

  it("stores omitted optional fields as NULL", () => {
    const input: LearningMomentInput = {
      kind: "pivot",
      context: "The market shifted.",
      shift: "Dropped the native app plan.",
      result: "Re-focused on the web app; launched sooner.",
    };
    const row = mapLearningMomentToRow(input, userId);
    expect(row.duration).toBeNull();
    expect(row.target_role_id).toBeNull();
  });
});
