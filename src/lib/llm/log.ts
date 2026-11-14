import "server-only";

export type RunStatus = "ok" | "error" | "invalid_output";

export type RunLog = {
  prompt_id: string;
  prompt_version: string;
  model_requested: string;
  model_used?: string;
  status: RunStatus;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  latency_ms: number;
  error?: string;
  input_text?: string; // only in development, see shouldLogText()
  output_text?: string;
};

// Full prompt and reply text may contain personal career data: store it only in
// development, and only when explicitly asked (LLM_LOG_TEXT=true).
export function shouldLogText(): boolean {
  return (
    process.env.NODE_ENV !== "production" && process.env.LLM_LOG_TEXT === "true"
  );
}

export type LogSink = (row: RunLog) => Promise<void>;

export async function logRun(sink: LogSink, row: RunLog): Promise<void> {
  const clean = shouldLogText()
    ? row
    : { ...row, input_text: undefined, output_text: undefined };
  try {
    await sink(clean);
  } catch (e) {
    // Logging must never break the user's request.
    console.error("llm run log failed:", e instanceof Error ? e.message : e);
  }
}
