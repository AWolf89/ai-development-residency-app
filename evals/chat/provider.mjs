// promptfoo custom provider: runs evals/chat/answer.mts in a child process so the real app code
// (server-only modules, @/ paths) answers each question exactly as the chat route would.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
const run = promisify(execFile);

export default class CareerChatProvider {
  id() { return "career-chat-app"; }
  async callApi(prompt) {
    const script = path.resolve("evals/chat/answer.mts");
    try {
      const { stdout } = await run("npx", ["tsx", script, prompt], {
        env: { ...process.env, NODE_OPTIONS: "--conditions=react-server" },
        timeout: 90_000,
        maxBuffer: 5_000_000,
      });
      const r = JSON.parse(stdout);
      return { output: r.answer, metadata: { context: r.context, found: r.found, sources: r.sources, prompt_version: r.prompt_version }, cost: r.cost_usd, latencyMs: r.latency_ms };
    } catch (e) {
      return { error: `answer.mts failed: ${(e.stderr || e.message || String(e)).slice(0, 500)}` };
    }
  }
}
