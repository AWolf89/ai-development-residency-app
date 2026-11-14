// Model and privacy settings for every LLM call. Change models here, not in feature code.
//
// IMPORTANT: the model ids below are DEFAULTS and MUST be confirmed against OpenRouter's
// live catalogue with `npm run llm:models` (tools/llm/check_models.py) before they ship —
// model names change often and an "extract" model must support structured outputs.
// Defaults follow CLAUDE.md: the latest, most capable Claude models, with a previous-gen
// fallback that OpenRouter tries if the primary fails or is rate-limited.
export const LLM_CONFIG = {
  models: {
    // Primary first; OpenRouter falls through the rest on failure or rate-limit.
    chat: ["anthropic/claude-sonnet-5.5", "anthropic/claude-sonnet-4.5"],
    extract: ["anthropic/claude-haiku-5.5", "anthropic/claude-sonnet-5.5"],
  },
  // Personal career data: only providers that don't store or train on prompts.
  provider: {
    data_collection: "deny" as const,
    zdr: true,
    allow_fallbacks: true,
  },
  // R3 §1 runtime caps — every call is bounded.
  timeoutMs: 30_000,
  maxRetries: 2, // transport-level retries on 5xx/network errors (cap 2–3)
  maxOutputTokens: 1_500,
  // R3 §2 recovery pipeline — structured-output self-correction turns (cap 2–3).
  maxCorrectionTurns: 2,
} as const;

export type ModelPurpose = keyof typeof LLM_CONFIG.models;
