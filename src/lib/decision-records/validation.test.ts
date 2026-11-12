import { describe, it, expect } from "vitest";
import {
  validateDecisionRecord,
  DECISION_SOURCES,
  type DecisionRecordInput,
} from "./validation";

// Pure-logic unit tests (Humble Object): no network, no framework, canned inputs.
// This is the single gate that decides whether a record may be saved, so every
// branch is covered — it enforces AC1 (capture), AC2 (source label) and AC6
// (missing required field -> not saved).
describe("validateDecisionRecord", () => {
  const complete: DecisionRecordInput = {
    title: "Rebuilt the nightly export",
    situation: "The nightly export kept timing out under load.",
    cue: "I noticed the job only failed on days with >1M rows.",
    decision: "I switched it to a streamed, chunked writer.",
    why: "Buffering the whole file in memory was the real bottleneck.",
    outcome: "Runtime dropped from 40min to 6min and stopped failing.",
    source: "self_reported",
  };

  it("accepts a fully-filled record and returns the cleaned value (AC1)", () => {
    const result = validateDecisionRecord(complete);
    expect(result).toEqual({ ok: true, value: complete });
  });

  it("accepts a core-only record with cue and why omitted", () => {
    const core = {
      title: complete.title,
      situation: complete.situation,
      decision: complete.decision,
      outcome: complete.outcome,
      source: complete.source,
    };
    const result = validateDecisionRecord(core);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.cue).toBeUndefined();
      expect(result.value.why).toBeUndefined();
      expect(result.value.title).toBe(core.title);
    }
  });

  it("trims surrounding whitespace on all fields", () => {
    const padded = {
      ...complete,
      title: `  ${complete.title}  `,
      outcome: `\t${complete.outcome}\n`,
    };
    const result = validateDecisionRecord(padded);
    expect(result).toEqual({ ok: true, value: complete });
  });

  it("rejects a missing title (AC6)", () => {
    const rest = {
      situation: complete.situation,
      cue: complete.cue,
      decision: complete.decision,
      why: complete.why,
      outcome: complete.outcome,
      source: complete.source,
    };
    const result = validateDecisionRecord(rest);
    expect(result).toEqual({ ok: false, error: "Enter a title." });
  });

  it("rejects a missing situation (AC6)", () => {
    const result = validateDecisionRecord({ ...complete, situation: "" });
    expect(result).toEqual({
      ok: false,
      error: "Describe the situation.",
    });
  });

  it("rejects a missing decision (AC6 — BDD required field)", () => {
    const result = validateDecisionRecord({ ...complete, decision: "" });
    expect(result).toEqual({
      ok: false,
      error: "Describe the decision you made.",
    });
  });

  it("rejects a missing outcome (AC6 — BDD required field)", () => {
    const result = validateDecisionRecord({ ...complete, outcome: "   " });
    expect(result).toEqual({
      ok: false,
      error: "Describe the outcome.",
    });
  });

  it("treats a whitespace-only required field as missing", () => {
    const result = validateDecisionRecord({ ...complete, title: "   " });
    expect(result).toEqual({ ok: false, error: "Enter a title." });
  });

  it("accepts both allowed source labels (AC2)", () => {
    for (const source of DECISION_SOURCES) {
      const result = validateDecisionRecord({ ...complete, source });
      expect(result.ok).toBe(true);
    }
  });

  it("rejects a missing source (AC2)", () => {
    const rest = {
      title: complete.title,
      situation: complete.situation,
      cue: complete.cue,
      decision: complete.decision,
      why: complete.why,
      outcome: complete.outcome,
    };
    const result = validateDecisionRecord(rest);
    expect(result).toEqual({
      ok: false,
      error: "Choose a source: artifact or self-reported.",
    });
  });

  it("rejects an out-of-range source label (AC2)", () => {
    const result = validateDecisionRecord({
      ...complete,
      source: "other" as unknown as DecisionRecordInput["source"],
    });
    expect(result).toEqual({
      ok: false,
      error: "Choose a source: artifact or self-reported.",
    });
  });

  it("rejects a non-object input", () => {
    const result = validateDecisionRecord(null);
    expect(result.ok).toBe(false);
  });

  it("stores a blank optional field as undefined, not an empty string", () => {
    const result = validateDecisionRecord({ ...complete, cue: "   ", why: "" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.cue).toBeUndefined();
      expect(result.value.why).toBeUndefined();
    }
  });
});
