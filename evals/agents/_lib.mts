// Shared helpers for the per-agent model-level runners. Each runner (reviewer.mts,
// file-analysis.mts, interview.mts, gap.mts) is a thin child-process script — like the chat
// suite's answer.mts — that feeds one synthetic fixture (evals/agents/fixtures.json) through the
// REAL prompt module via the LLM gateway (runStructured) and the REAL pure grounding, then prints
// a normalised JSON envelope the provider hands back to promptfoo. Run with
// NODE_OPTIONS=--conditions=react-server (provider.mjs sets it). Never copies a prompt.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { LogSink } from "../../src/lib/llm/log";

/** Set by the provider / selftest to render the real prompt and skip the paid model call. */
export const SELFTEST = process.env.EVAL_SELFTEST === "1";

/** Load one case's synthetic fixture by id (throws loudly so a missing fixture is never silent). */
export function loadFixture<T = Record<string, unknown>>(caseId: string): T {
  const file = path.resolve("evals/agents/fixtures.json");
  const all = JSON.parse(readFileSync(file, "utf8")) as Record<string, T>;
  const fixture = all[caseId];
  if (!fixture) {
    throw new Error(`no fixture for case "${caseId}" in ${file}`);
  }
  return fixture;
}

/** A cost-accumulating log sink (evals never write to llm_runs; they only tally spend). */
export function makeCostSink(): { sink: LogSink; getCost: () => number } {
  let cost = 0;
  const sink: LogSink = async (row) => {
    cost += row.cost_usd ?? 0;
  };
  return { sink, getCost: () => cost };
}

/** The normalised result envelope every runner prints as its single line of stdout. */
export type RunnerEnvelope = {
  agent: string;
  caseId: string;
  output: unknown;
  cost_usd: number;
  latency_ms: number;
};

/** Print the envelope as JSON (the provider parses exactly this). */
export function emit(envelope: RunnerEnvelope): void {
  process.stdout.write(JSON.stringify(envelope));
}
