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
| `evals/agents/` | the four agents' §13 reasoning tests | `evals/agents/cases.jsonl` | golden set authored; per-agent runners are the next build step |

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

**Cost estimate:** roughly `cases × (1 app call + 1 embedding + 1 grader call)`. Get an explicit go
before running. The judge is `google/gemini-2.5-flash` (set in `promptfooconfig.yaml`) — a different
model family than our Claude chat models, so it doesn't rate its own style highly. On the first run,
check the grader against your own labels with `tools/evals/judge_agreement.py` (want ≥ 80% agreement).

## §13 plan — mapping each proposal test to where it is guarded

Each row of `evals/agents/cases.jsonl` carries `covered_by_offline` (the deterministic test that already
pins the logic) and the agent whose model-level runner will exercise it. Build order for the model-level
runners, highest §13 coverage first:

1. **reviewer** suite — Tests 1, 3, 4, 8 (attribution, overstatement, metric causation, pressure). Reuse
   `src/lib/llm/prompts/reviewer-check.ts` + `reviewModelOutputSchema` via `runStructured`; assert a
   grounded flag is raised and no flag endorses the overclaim.
2. **file-analysis** suite — Tests 2, 5, 9 (informal-vs-formal, inventory-vs-deliverable, confidentiality).
3. **interview** suite — Test 6 (uncertain recollection stays hedged).
4. **gap** suite — Test 10 (evidence gap ≠ skill gap; no hiring verdict).
5. **Test 7** (cross-document reconciliation) lands with the Phase 2 reconciliation feature, then gets its
   own case + assertion here.

Each runner mirrors `evals/chat/{provider.mjs, answer.mts, checks.mjs}`: a thin child-process runner that
calls the real prompt module, code checks first (grounding / no-invented-citation / attribution), a judge
only for what code can't decide. **Every bad answer becomes a case before it is fixed.**

## CI (hand to ci-cd-setup)

- Every PR (free): `npm test` and `npm run eval:build`.
- Manual/nightly (costs money): `eval:run` + `eval:report`, key stored as a CI secret.
- Before merging a model/prompt/retrieval change: run baseline vs candidate and
  `tools/evals/compare_runs.py`; ship only with no regressions vs [`baseline.md`](baseline.md).
