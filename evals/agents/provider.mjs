// promptfoo custom provider for the agent reasoning suite. One dispatcher: it reads the case's
// `agent` + `case_id` vars and runs the matching per-agent runner (reviewer/file-analysis/interview/
// gap) in a child process, so the REAL app prompt + gateway + grounding produce the result exactly
// as the agent would. Mirrors the chat suite's provider.mjs (thin child-process pattern).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import process from "node:process";
const run = promisify(execFile);

const RUNNERS = new Set(["reviewer", "file-analysis", "interview", "gap"]);

export default class AgentReasoningProvider {
  id() {
    return "agents-app";
  }
  async callApi(_prompt, context) {
    const vars = (context && context.vars) || {};
    const agent = String(vars.agent || "");
    const caseId = String(vars.case_id || "");
    if (!RUNNERS.has(agent)) {
      return { error: `unknown agent "${agent}" for case "${caseId}"` };
    }
    const script = path.resolve(`evals/agents/${agent}.mts`);
    try {
      // Invoke node directly with the tsx loader (no npx/.cmd shell → cross-platform, space-safe).
      const { stdout } = await run(process.execPath, ["--import", "tsx", script, caseId], {
        env: { ...process.env, NODE_OPTIONS: "--conditions=react-server" },
        timeout: 120_000,
        maxBuffer: 5_000_000,
      });
      const r = JSON.parse(stdout);
      return {
        output: JSON.stringify(r.output),
        metadata: { structured: r.output, agent, case_id: caseId },
        cost: r.cost_usd,
        latencyMs: r.latency_ms,
      };
    } catch (e) {
      return {
        error: `${agent} runner failed: ${(e.stderr || e.message || String(e)).slice(0, 500)}`,
      };
    }
  }
}
