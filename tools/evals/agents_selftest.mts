// Free, offline self-test for the agent reasoning runners. For every runnable case in
// evals/agents/cases.jsonl it spawns the routed runner with EVAL_SELFTEST=1 — which loads the
// synthetic fixture and RENDERS the real prompt module (proving the fixture matches the prompt's
// input contract) but makes NO paid model call — and asserts a valid selftest envelope comes back.
// This is the CI-safe wiring check that the harness is sound before any go-to-spend run. It does
// NOT exercise the model's reasoning (that is the paid `npm run eval:agents`). Usage: tsx this file.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import path from "node:path";
const run = promisify(execFile);

const TEST_RUNNER: Record<number, string> = {
  1: "reviewer", 3: "reviewer", 4: "reviewer", 8: "reviewer",
  2: "file-analysis", 5: "file-analysis", 9: "file-analysis",
  6: "interview", 10: "gap",
};
const PENDING = new Set([7]);

const cases = readFileSync(path.resolve("evals/agents/cases.jsonl"), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => JSON.parse(l) as { id: string; test: number });

let failures = 0;
let checked = 0;
for (const c of cases) {
  if (PENDING.has(c.test)) continue;
  const runner = TEST_RUNNER[c.test];
  if (!runner) {
    console.error(`FAIL ${c.id}: test ${c.test} has no runner`);
    failures++;
    continue;
  }
  const script = path.resolve(`evals/agents/${runner}.mts`);
  try {
    // Invoke node directly with the tsx loader (no npx/.cmd shell → cross-platform, space-safe).
    const { stdout } = await run(process.execPath, ["--import", "tsx", script, c.id], {
      env: { ...process.env, EVAL_SELFTEST: "1", NODE_OPTIONS: "--conditions=react-server" },
      timeout: 120_000,
      maxBuffer: 5_000_000,
    });
    const env = JSON.parse(stdout);
    const output = env.output ?? {};
    if (env.agent !== runner || env.caseId !== c.id || output.selftest !== true) {
      throw new Error(`unexpected envelope: ${stdout.slice(0, 200)}`);
    }
    checked++;
    console.log(`ok   ${c.id} (${runner})`);
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string };
    console.error(`FAIL ${c.id} (${runner}): ${(err.stderr || err.message || String(e)).slice(0, 400)}`);
    failures++;
  }
}

console.log(`\n${checked} runner(s) wired OK, ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
