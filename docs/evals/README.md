# Evals

Answer-/behaviour-quality evals for the Career Evidence Agent (ai-evals skill). An eval runs a fixed
set of inputs through the **real** app code and checks every output, so a change to a prompt, model,
or retrieval setting can be shown to help or hurt instead of guessed from a few tries.

Two layers:

- **Deterministic logic** — the existing `vitest` + per-agent mock suites (`npm test`, `npm run
  test:reviewer|interview|investigation|gap`). No models, runs in CI for free, green today. This is the
  primary guard that the agents' reducers and grounding logic don't regress. Baseline in
  [`baseline.md`](baseline.md).
- **Model behaviour** — promptfoo suites that call the live model and grade the output with a
  cross-family judge. Costs money; run before shipping any model-touching change.

## Suites

| Suite | Target | Cases | Status |
|---|---|---|---|
| `evals/chat/` | career chatbot answer quality (real retrieval + `careerChat` prompt + model) | `evals/chat/cases.jsonl` | wired; **first paid run pending** |
| `evals/agents/` | the four agents' §13 reasoning tests | `evals/agents/cases.jsonl` | **runners built + build/selftest-green**; first paid run pending (Node ≥ 22.22 + a go-to-spend) |

## Run (model layer)

Prereqs: **Node ≥ 22.22**; install promptfoo on demand with
`npm install --save-dev --save-exact promptfoo@0.124.1` (kept OUT of the committed lockfile because of
its very large transitive tree and the Node-version floor — the paid run is gated anyway); and these
env vars exported (keys are in `.env.local`, never committed):

```
OPENROUTER_API_KEY=...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...        # reads the shared, read-only reference corpus; never per-user data
```

```powershell
npm run eval:build   # free: validates the chat golden set -> evals/chat/tests.generated.json
npm run eval:run     # costs money: runs each case through the app, grades with the judge
npm run eval:report  # writes docs/evals/latest.md (pass rates, cost, latency, failures)
```

### Agents suite (the four FSM agents' §13 reasoning)

Same shape, in a sibling config (`promptfooconfig.agents.yaml`) — promptfoo is one provider-suite per
file. One dispatching provider (`evals/agents/provider.mjs`) runs each case through its per-agent
runner (`evals/agents/{reviewer,file-analysis,interview,gap}.mts`), which calls the **real** prompt
module via the gateway (`runStructured`) + the real pure grounding — never a copy. Code checks
(`evals/agents/checks.mjs`) run first; a cross-family judge grades only what code can't.

```powershell
npm run eval:agents:build      # free: §13 golden set + fixtures -> evals/agents/tests.generated.json
npm run eval:agents:selftest   # free, no model call: renders every real prompt with its fixture (wiring check)
npm run eval:agents            # costs money: runs each case through the real agent code, grades with the judge
npm run eval:agents:report     # writes docs/evals/agents-latest.md
```

Fixtures are the synthetic **Jordan Lee** set (`evals/agents/fixtures.json`) — no real user data (AC5).
`eval:agents:selftest` is the CI-safe proof the harness is sound before any paid run; it makes **no**
model call, so it cannot judge reasoning quality — that is `eval:agents`.

**Cost estimate:** roughly `cases × (1 app call + 1 embedding + 1 grader call)`. Get an explicit go
before running. The judge is `google/gemini-2.5-flash` (set in `promptfooconfig.yaml`) — a different
model family than our Claude chat models, so it doesn't rate its own style highly. On the first run,
check the grader against your own labels with `tools/evals/judge_agreement.py` (want ≥ 80% agreement).

## §13 plan — mapping each proposal test to where it is guarded

Each row of `evals/agents/cases.jsonl` carries `covered_by_offline` (the deterministic test that already
pins the logic) and the agent whose model-level runner exercises it. The build script routes each case
to its runner by `test` number. **Built** (highest §13 coverage first):

1. **reviewer** runner — Tests 1, 3, 4, 8 (attribution, overstatement, metric causation, pressure). Reuses
   `src/lib/llm/prompts/reviewer-check.ts` + `reviewModelOutputSchema` via `runStructured`, then the real
   `resolveFlags` grounding (mirrors `orchestrator.runDimension`); asserts a grounded support/accuracy flag
   is raised and no flag cites an unprovided source.
2. **file-analysis** runner — Tests 2, 5, 9 (informal-vs-formal, inventory-vs-deliverable, confidentiality).
   Reuses `file-analysis.ts` + `analysisOutputSchema` + the real `validateTags`.
3. **interview** runner — Test 6 (uncertain recollection stays hedged). Reuses `answer-classify.ts` +
   `interview-paraphrase.ts`; a paraphrase it cannot fill from the person's words is refused (nothing invented).
4. **gap** runner — Test 10 (evidence gap ≠ skill gap; no hiring verdict). Reuses `gap-classification.ts` +
   `gapModelOutputSchema` + the real `validateCitations`/`resolveVerdict` + no-evidence short-circuit.
5. **Test 7** (cross-document reconciliation) stays **PENDING** — it lands with the Phase 2 reconciliation
   feature, then gets its runner + assertion here. The build script skips it by design.

Each runner mirrors `evals/chat/{provider.mjs, answer.mts, checks.mjs}`: a thin child-process runner that
calls the real prompt module, code checks first (grounding / no-invented-citation / attribution), a judge
only for what code can't decide. **Every bad answer becomes a case before it is fixed.**

## CI (hand to ci-cd-setup)

- Every PR (free): `npm test`, `npm run eval:build`, `npm run eval:agents:build`, and
  `npm run eval:agents:selftest` (renders every real agent prompt with its fixture — no model call).
- Manual/nightly (costs money): `eval:run` + `eval:report` and `eval:agents` + `eval:agents:report`,
  key stored as a CI secret.
- Before merging a model/prompt/retrieval change: run baseline vs candidate and
  `tools/evals/compare_runs.py`; ship only with no regressions vs [`baseline.md`](baseline.md).
