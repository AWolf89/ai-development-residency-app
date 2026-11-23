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

## Checks (model behaviour — golden set authored, run pending)

The ten §13 scenarios are authored in [`evals/agents/cases.jsonl`](../../evals/agents/cases.jsonl),
each traced to the offline test that already guards its logic and to the agent suite that will run it
against the live model. A career-chatbot answer set is in
[`evals/chat/cases.jsonl`](../../evals/chat/cases.jsonl) (unanswerable / out-of-scope / injection,
incl. the pressure-to-exaggerate cases for Test 8). Run instructions and the per-test plan are in
[`README.md`](README.md).

## Cost and speed

Offline layer: $0, ~2s for vitest. Model layer: not yet run — see the cost estimate in README
(roughly *cases × (1 app call + 1 embedding + 1 grader call)*). Get an explicit go before a paid run.

## Trust

Judge agreement: **not checked** (no model run yet). On the first run, label ~20 grader rows with
`tools/evals/judge_agreement.py` and require ≥ 80% agreement before trusting grader scores.

## Waiting on you (to run the model-level baseline)

1. `OPENROUTER_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
   `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1` exported in the shell (keys live in `.env.local`).
2. **Node ≥ 22.22** (promptfoo 0.124.1 requires it; this machine is 22.20) and `npm install` to pull promptfoo.
3. A **yes to spend** (the run calls models).
4. Confirm the judge model id (`google/gemini-2.5-flash` — a different family than our Claude chat models).

Once those are set: `npm run eval:run && npm run eval:report` writes `docs/evals/latest.md`. That is the
candidate every future agent change is compared against (`tools/evals/compare_runs.py`); ship only with
no regressions vs this baseline.
