import { describe, it, expect } from "vitest";
import { mapDecisionRecordToRow } from "./mappers";
import type { DecisionRecordInput } from "./validation";

// Pure-logic unit tests (Humble Object): the mapper turns a *validated* input
// into the exact DB row shape, so a mistake here would write wrong columns or
// drop the source label. No network involved.
describe("mapDecisionRecordToRow", () => {
  const userId = "11111111-1111-1111-1111-111111111111";
  const input: DecisionRecordInput = {
    title: "Rebuilt the nightly export",
    situation: "It kept timing out under load.",
    cue: "Only failed on >1M row days.",
    decision: "Switched to a streamed writer.",
    why: "Memory buffering was the bottleneck.",
    outcome: "40min -> 6min, no more failures.",
    source: "artifact",
  };

  it("maps every field into the snake_case row with the owner id", () => {
    const row = mapDecisionRecordToRow(input, userId);
    expect(row).toEqual({
      user_id: userId,
      title: input.title,
      situation: input.situation,
      cue: input.cue,
      decision: input.decision,
      why: input.why,
      outcome: input.outcome,
      source: "artifact",
      status: "confirmed",
    });
  });

  it("stores absent optional fields as null (not undefined)", () => {
    const core = {
      title: input.title,
      situation: input.situation,
      decision: input.decision,
      outcome: input.outcome,
      source: input.source,
    };
    const row = mapDecisionRecordToRow(core, userId);
    expect(row.cue).toBeNull();
    expect(row.why).toBeNull();
  });

  it("carries the self-reported source label through unchanged", () => {
    const row = mapDecisionRecordToRow(
      { ...input, source: "self_reported" },
      userId
    );
    expect(row.source).toBe("self_reported");
  });

  it("marks a saved record as confirmed (AC3 — only saved on confirm)", () => {
    const row = mapDecisionRecordToRow(input, userId);
    expect(row.status).toBe("confirmed");
  });
});
