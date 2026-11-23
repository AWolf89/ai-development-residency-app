# Agent reasoning — regression baseline

**Captured:** 2026-11-22 · **Branch:** `test/agent-reasoning-eval-baseline` · **Phase 0 GATE** (backlog)

This is the net that pins the four agents' current reasoning **before** any evolution work
(Phases 1–4) touches them. It has two layers: the deterministic logic baseline (runs now, offline)
and the model-behaviour golden set (needs an OpenRouter key; first paid run pending).

## Run (deterministic logic — offline, captured)

All green on the branch tip, no models called (mocked LLM + pure reducers):

| Suite | Result |
|---|---|
| `npm test` (vitest unit) | **693 passed** / 62 files |
| `npm run test:reviewer` (FSM + grounding) | **23 checks** |
| `npm run test:interview` (FSM + HITL) | **53 checks** |
| `npm run test:investigation` (ReAct FSM) | **26 checks** |
| `npm run test:gap` (classifier) | **10 checks** |

These already encode several of the proposal's §13 behaviours as regression assertions — e.g.
*"invented citation is stripped and the verdict downgraded to gap"* (Test 4), reviewer grounding
downgrade of ungrounded overstatement (Tests 1/3/8), *"no-evidence requirement short-circuits to
unknown"* (Test 10), and the HITL invariant *"nothing saved during the pass"* across all agents.

## Checks (model behaviour — runners built, paid run pending)

The ten §13 scenarios are authored in [`evals/agents/cases.jsonl`](../../evals/agents/cases.jsonl),
each traced to the offline test that already guards its logic and to the agent runner that exercises it
against the live model. A career-chatbot answer set is in
[`evals/chat/cases.jsonl`](../../evals/chat/cases.jsonl) (unanswerable / out-of-scope / injection,
incl. the pressure-to-exaggerate cases for Test 8). Run instructions and the per-test plan are in
[`README.md`](README.md).

**Model-level runners are now built and verified offline** (the deferred half of the gate). Nine of the
ten §13 scenarios are runnable against the live model — reviewer (Tests 1, 3, 4, 8), file-analysis
(Tests 2, 5, 9), interview (Test 6), gap (Test 10); Test 7 (cross-document reconciliation) stays PENDING
until the Phase 2 reconciliation feature. Each runner calls the **real** prompt module via the gateway
(`runStructured`) plus the real pure grounding — not a copy — over the synthetic Jordan Lee fixtures
(`evals/agents/fixtures.json`, AC5: no real user data). Verified free, with no model call:

| Step | Result |
|---|---|
| `eval:agents:build` (golden set + fixtures → tests) | **9 tests** (reviewer 4, file-analysis 3, interview 1, gap 1); Test 7 pending |
| `eval:agents:selftest` (renders every real prompt with its fixture) | **9/9 runners wired** |
| code checks (`checks.mjs`, unit-exercised) | grounding / no-invented-citation / attribution / short-circuit **pass** |
| full deterministic net (`npm test`) | **729 passed**, unchanged (no agent code touched) |

What remains before the model-level numbers exist is the **paid run itself**, still gated (see "Waiting
on you"): the harness is complete, but the live-model pass rates, cost/latency, and judge-agreement
figures below are produced only by `npm run eval:agents && npm run eval:agents:report`.

## Cost and speed

Offline layer: $0, ~2s for vitest. Model layer: not yet run — see the cost estimate in README
(roughly *cases × (1 app call + 1 embedding + 1 grader call)*). Get an explicit go before a paid run.

## Trust

Judge agreement: **not checked** (no model run yet). On the first run, label ~20 grader rows with
`tools/evals/judge_agreement.py` and require ≥ 80% agreement before trusting grader scores.

## Waiting on you (to run the model-level baseline)

1. `OPENROUTER_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
   `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1` exported in the shell (keys live in `.env.local`).
2. **Node ≥ 22.22** (promptfoo 0.124.1 requires it; this machine is 22.20); install promptfoo on demand
   with `npm install --save-dev --save-exact promptfoo@0.124.1` (kept out of the committed lockfile due to its size).
3. A **yes to spend** (the run calls models).
4. Confirm the judge model id (`google/gemini-2.5-flash` — a different family than our Claude chat models).

Once those are set, the agent reasoning baseline is `npm run eval:agents && npm run eval:agents:report`
(writes `docs/evals/agents-latest.md`); the chat baseline is `npm run eval:run && npm run eval:report`
(writes `docs/evals/latest.md`). Those are the candidates every future agent/prompt/model change is
compared against (`tools/evals/compare_runs.py`); ship only with no regressions vs this baseline. On the
first agents run, check judge agreement (`tools/evals/judge_agreement.py`, ≥ 80%) before trusting the
grader scores.
