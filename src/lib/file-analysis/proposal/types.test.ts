import { describe, it, expect } from "vitest";
import { LLM_CONFIG } from "@/lib/llm/config";
import { PROPOSAL_MAX_OUTPUT_TOKENS } from "./types";

// GF1 regression: a confident proposal (project + several multi-field records) overran the default
// 1,500-token output cap, so the answered clarification path truncated and failed to parse while
// "Skip" (no second call) worked. The proposal call must use a larger budget — but still a bounded
// one, within the ceiling the LLM_CONFIG runtime-cap test enforces (R3 §1).
describe("PROPOSAL_MAX_OUTPUT_TOKENS", () => {
  it("is larger than the default output cap so a full proposal is not truncated", () => {
    expect(PROPOSAL_MAX_OUTPUT_TOKENS).toBeGreaterThan(
      LLM_CONFIG.maxOutputTokens
    );
  });

  it("stays within the mandated 4,000-token ceiling (still explicitly bounded)", () => {
    expect(PROPOSAL_MAX_OUTPUT_TOKENS).toBeGreaterThan(0);
    expect(PROPOSAL_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(4_000);
  });
});
