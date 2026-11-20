import "server-only";
import { generateText, Output, type FlexibleSchema } from "ai";
import type { ZodType } from "zod";
import { getModel } from "./client";
import { LLM_CONFIG } from "./config";
import { logRun, type LogSink } from "./log";
import type { PromptDef } from "./prompts/types";
import {
  parseStructured,
  buildCorrectionTurn,
  isTruncated,
  StructuredOutputError,
} from "./structured";

type RunOpts<I, O> = {
  prompt: PromptDef<I>;
  input: I;
  schema?: FlexibleSchema<O>; // SDK-native structured output, validated by the SDK
  sink: LogSink;
  userId?: string;
  appendUserText?: string; // extra user-turn text (used by the self-correction loop)
  images?: { data: Uint8Array; mediaType: string }[]; // multimodal input (ADR-0020 vision read)
  fetch?: typeof fetch; // tests only
};

export type RunResult<O> = {
  text: string;
  output: O | undefined;
  finishReason: string;
};

// Thin gateway call: applies caps (maxOutputTokens, timeout, retries), privacy routing (in
// getModel), and writes exactly one llm_runs row. All real decision logic lives in the pure
// helpers; this stays a humble boundary.
export async function runLLM<I, O = string>({
  prompt,
  input,
  schema,
  sink,
  userId,
  appendUserText,
  images,
  fetch,
}: RunOpts<I, O>): Promise<RunResult<O>> {
  const started = Date.now();
  const rendered = prompt.render(input);
  const userText = appendUserText
    ? `${rendered}\n\n${appendUserText}`
    : rendered;
  const base = {
    prompt_id: prompt.id,
    prompt_version: prompt.version,
    model_requested: LLM_CONFIG.models[prompt.purpose][0],
  };
  // With images, send a multimodal user turn (text + image parts); otherwise a plain prompt.
  const messages =
    images && images.length > 0
      ? [
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: userText },
              ...images.map((img) => ({
                type: "image" as const,
                image: img.data,
                mediaType: img.mediaType,
              })),
            ],
          },
        ]
      : undefined;
  try {
    const result = await generateText({
      model: getModel(prompt.purpose, { userId, fetch }),
      system: prompt.system,
      ...(messages ? { messages } : { prompt: userText }),
      maxOutputTokens: LLM_CONFIG.maxOutputTokens,
      maxRetries: LLM_CONFIG.maxRetries,
      timeout: LLM_CONFIG.timeoutMs,
      ...(schema ? { output: Output.object({ schema }) } : {}),
    });
    const meta = result.providerMetadata?.openrouter as
      { usage?: { cost?: number } } | undefined;
    await logRun(sink, {
      ...base,
      status: "ok",
      model_used: result.response.modelId,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      cost_usd: meta?.usage?.cost,
      latency_ms: Date.now() - started,
      input_text: userText,
      output_text: result.text,
    });
    return {
      text: result.text,
      output: (schema ? result.output : undefined) as O | undefined,
      finishReason: result.finishReason,
    };
  } catch (e) {
    const name = e instanceof Error ? e.name : "Error";
    await logRun(sink, {
      ...base,
      status: /NoObjectGenerated|TypeValidation|JSONParse/.test(name)
        ? "invalid_output"
        : "error",
      latency_ms: Date.now() - started,
      error: `${name}: ${e instanceof Error ? e.message : String(e)}`.slice(
        0,
        500
      ),
      input_text: userText,
    });
    throw e;
  }
}

type StructuredOpts<I, T> = {
  prompt: PromptDef<I>;
  input: I;
  schema: ZodType<T>;
  sink: LogSink;
  userId?: string;
  maxCorrections?: number;
  fetch?: typeof fetch; // tests only
};

export type StructuredResult<T> = {
  data: T;
  attempts: number; // model calls spent (1 = no correction needed)
  truncated: boolean;
};

// R3 §2 recovery pipeline: ask the model for structured output, defensively parse the free
// text (strip code fences → Zod safeParse), and on failure feed the exact validation error
// back for a bounded number of self-correction turns. Every attempt writes its own run row.
// Throws StructuredOutputError if the budget is exhausted (command/query separation: a
// mutation-like failure is a typed throw, not a magic return value).
export async function runStructured<I, T>({
  prompt,
  input,
  schema,
  sink,
  userId,
  maxCorrections = LLM_CONFIG.maxCorrectionTurns,
  fetch,
}: StructuredOpts<I, T>): Promise<StructuredResult<T>> {
  let appendUserText: string | undefined;
  let lastError = "no attempts made";

  for (let attempt = 0; attempt <= maxCorrections; attempt++) {
    const { text, finishReason } = await runLLM({
      prompt,
      input,
      sink,
      userId,
      appendUserText,
      fetch,
    });
    const truncated = isTruncated(finishReason);
    const parsed = parseStructured(text, schema);
    if (parsed.ok) {
      return { data: parsed.data, attempts: attempt + 1, truncated };
    }
    lastError = parsed.error;
    appendUserText = buildCorrectionTurn(text, parsed.error, truncated);
  }

  const attempts = maxCorrections + 1;
  throw new StructuredOutputError(
    `Structured output failed validation after ${attempts} attempt(s): ${lastError}`,
    attempts
  );
}
