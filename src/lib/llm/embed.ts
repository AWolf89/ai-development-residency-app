import "server-only"; // build fails if a browser component imports this file
import { embed, embedMany } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { LLM_CONFIG } from "./config";
import { logRun, type LogSink } from "./log";
import { EMBEDDING_DIM } from "@/lib/rag/embedding";

// Embeddings run through the SAME gateway module as chat (ADR-0010): one model path, the
// same privacy routing, the same llm_runs logging. The AI SDK's embeddings endpoint is
// `embed()`/`embedMany()` (not `generateText`), so this is a thin sibling of run.ts, not a
// second provider integration. All real logic stays in the pure rag/* modules; this is a
// humble boundary.
export const EMBEDDING_MODEL = LLM_CONFIG.embeddingModel;

function requireKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to .env.local (and to Vercel for production)."
    );
  }
  return key;
}

function embeddingModel(fetchImpl?: typeof fetch) {
  const openrouter = createOpenRouter({
    apiKey: requireKey(),
    baseURL: process.env.OPENROUTER_BASE_URL, // unset = OpenRouter; set only to point tests at a fake server
    compatibility: "strict",
    fetch: fetchImpl,
    // The embeddings settings type has no zdr/data_collection field, so privacy routing
    // (ADR-0007) is sent in the request body directly — same values as the chat path.
    extraBody: {
      provider: {
        data_collection: LLM_CONFIG.provider.data_collection,
        zdr: LLM_CONFIG.provider.zdr,
      },
    },
  });
  return openrouter.textEmbeddingModel(EMBEDDING_MODEL);
}

export type EmbedOpts = {
  sink?: LogSink; // when set, one llm_runs row is written (query path); omit for the backfill
  userId?: string;
  fetch?: typeof fetch; // tests only
};

function assertDim(vector: number[]): number[] {
  if (vector.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding size ${vector.length} != ${EMBEDDING_DIM}. Model/table/config are out of sync.`
    );
  }
  return vector;
}

/** Embed one query string. Text is clipped so a huge input can't blow the token budget. */
export async function embedQuery(
  text: string,
  opts: EmbedOpts = {}
): Promise<number[]> {
  const started = Date.now();
  try {
    const { embedding, usage } = await embed({
      model: embeddingModel(opts.fetch),
      value: text.slice(0, 2_000),
      maxRetries: LLM_CONFIG.maxRetries,
    });
    const vector = assertDim(embedding);
    if (opts.sink) {
      await logRun(opts.sink, {
        prompt_id: "embedding",
        prompt_version: EMBEDDING_MODEL,
        model_requested: EMBEDDING_MODEL,
        model_used: EMBEDDING_MODEL,
        status: "ok",
        input_tokens: usage?.tokens,
        latency_ms: Date.now() - started,
        input_text: text, // logRun strips this unless NODE_ENV=dev + LLM_LOG_TEXT=true
      });
    }
    return vector;
  } catch (e) {
    if (opts.sink) {
      await logRun(opts.sink, {
        prompt_id: "embedding",
        prompt_version: EMBEDDING_MODEL,
        model_requested: EMBEDDING_MODEL,
        status: "error",
        latency_ms: Date.now() - started,
        error: `${e instanceof Error ? e.message : String(e)}`.slice(0, 500),
      });
    }
    throw e;
  }
}

/**
 * Embed many strings in one request (used by the reference backfill script). No sink by
 * default: the backfill is an ops script that reports its own counts, and llm_runs is
 * per-user. The SDK batches and retries; callers chunk large inputs to respect provider limits.
 */
export async function embedBatch(
  texts: string[],
  opts: EmbedOpts = {}
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { embeddings } = await embedMany({
    model: embeddingModel(opts.fetch),
    values: texts.map((t) => t.slice(0, 2_000)),
    maxRetries: LLM_CONFIG.maxRetries,
  });
  return embeddings.map(assertDim);
}
