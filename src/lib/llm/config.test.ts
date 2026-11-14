import { describe, it, expect } from "vitest";
import { LLM_CONFIG } from "./config";

// R3 §1: every call must be bounded. These assert the caps exist and stay in the mandated
// ranges, so a careless edit that removes or loosens a guardrail fails CI.
describe("LLM_CONFIG runtime caps", () => {
  it("sets an explicit output-token cap", () => {
    expect(LLM_CONFIG.maxOutputTokens).toBeGreaterThan(0);
    expect(LLM_CONFIG.maxOutputTokens).toBeLessThanOrEqual(4_000);
  });

  it("sets a hard request timeout", () => {
    expect(LLM_CONFIG.timeoutMs).toBeGreaterThan(0);
    expect(LLM_CONFIG.timeoutMs).toBeLessThanOrEqual(60_000);
  });

  it("caps transport retries at 2–3", () => {
    expect(LLM_CONFIG.maxRetries).toBeGreaterThanOrEqual(2);
    expect(LLM_CONFIG.maxRetries).toBeLessThanOrEqual(3);
  });

  it("caps self-correction turns at 2–3", () => {
    expect(LLM_CONFIG.maxCorrectionTurns).toBeGreaterThanOrEqual(2);
    expect(LLM_CONFIG.maxCorrectionTurns).toBeLessThanOrEqual(3);
  });

  it("routes only to providers that do not store or train on prompts", () => {
    expect(LLM_CONFIG.provider.data_collection).toBe("deny");
    expect(LLM_CONFIG.provider.zdr).toBe(true);
  });

  it("defines a primary model and at least one fallback per purpose", () => {
    for (const purpose of ["chat", "extract"] as const) {
      expect(LLM_CONFIG.models[purpose].length).toBeGreaterThanOrEqual(2);
      expect(LLM_CONFIG.models[purpose][0]).toMatch(/^[a-z0-9-]+\//); // "vendor/model"
    }
  });
});
