#!/usr/bin/env python3
"""Turn the §13 agent golden set (JSONL) + synthetic fixtures (JSON) into promptfoo tests.

Usage: python3 build_agent_tests.py --cases evals/agents/cases.jsonl \
           --fixtures evals/agents/fixtures.json --out evals/agents/tests.generated.json

Each case is routed to a per-agent runner by its `test` number (the §13 build order):
  reviewer -> 1, 3, 4, 8   file-analysis -> 2, 5, 9   interview -> 6   gap -> 10
Test 7 (cross-document reconciliation) stays PENDING until the Phase 2 reconciliation feature and
is intentionally not emitted. Every runnable case must have a fixture.

Per agent: deterministic code checks (evals/agents/checks.mjs) run first and cost nothing; a single
cross-family judge (llm-rubric, model set in promptfooconfig.agents.yaml) grades only what code can't.
Exit codes: 0 ok, 1 invalid cases (all problems listed), 2 bad input.
"""
import argparse, json, pathlib, sys

CHECKS = "file://evals/agents/checks.mjs"

# §13 build order: test number -> runner. Test 7 is intentionally absent (PENDING, Phase 2).
TEST_RUNNER = {1: "reviewer", 3: "reviewer", 4: "reviewer", 8: "reviewer",
               2: "file-analysis", 5: "file-analysis", 9: "file-analysis",
               6: "interview", 10: "gap"}
PENDING_TESTS = {7}

# Scenario-specific assertion config (the forbidden framing / deferring wording a case turns on).
FORBIDDEN = {
    "agt-02-informal-vs-formal":
        r"user research study|formal (user )?research|usability (study|test)|research (study|program|methodology)",
}
DEFER = {
    "agt-05-inventory-vs-deliverable":
        r"inventory|index|list(ed|ing)?|referenced|not (attached|included|reviewed|present)|stored elsewhere|the artifacts",
    "agt-09-confidentiality":
        r"redact|anonymi|aggregate|de-identif|remove (the )?name|without (the )?name|personal(ly identif)?|confidential|privacy",
}


def js(fn):
    return {"type": "javascript", "value": f"{CHECKS}:{fn}", "metric": fn}


def judge(agent, scenario, expect):
    rubric = (
        f"You are grading ONE structured output from the Career Evidence Agent's {agent} reasoning. "
        "The payload is JSON holding the SCENARIO, the EXPECTed behaviour, and the agent's RESULT. "
        "PASS only if the RESULT shows the EXPECTed behaviour AND invents no facts, attributions, or "
        "citations beyond what the scenario provided. FAIL if it overclaims, fabricates, endorses an "
        "overstatement, states an uncertain or team contribution as an established individual fact, or "
        "gives a binary hire/no-hire verdict."
    )
    return {
        "type": "llm-rubric",
        "metric": "grounded_reasoning",
        "value": rubric,
        "transform": "JSON.stringify({ SCENARIO: context.vars.scenario, EXPECT: context.vars.expect, RESULT: output })",
    }


def citation_keys(sources):
    return [f"{s['source']}:{s['id']}" for s in (sources or [])]


def extra_vars(case_id, runner, fixture):
    """Per-case vars the code checks read (allowed citations/tags, the no-evidence requirement, regexes)."""
    v = {}
    if runner == "reviewer":
        v["allowed_citations"] = ",".join(citation_keys(fixture["evidence"]["sources"]))
    elif runner == "gap":
        allowed, no_ev = [], ""
        for req in fixture["requirements"]:
            allowed += citation_keys(req["evidence"]["sources"])
            allowed += citation_keys(req["reference"]["sources"])
            if not req["evidence"]["found"]:
                no_ev = req["id"]
        v["allowed_citations"] = ",".join(sorted(set(allowed)))
        v["no_evidence_req"] = no_ev
    elif runner == "file-analysis":
        v["allowed_tag_ids"] = ",".join(c["id"] for c in fixture["candidates"])
        if case_id in FORBIDDEN:
            v["forbidden_phrases"] = FORBIDDEN[case_id]
        if case_id in DEFER:
            v["defer_regex"] = DEFER[case_id]
    return v


def asserts_for(runner, case_id, scenario, expect):
    if runner == "reviewer":
        code = [js("reviewerRaisesFlag"), js("reviewerNoInventedCitation")]
    elif runner == "file-analysis":
        code = [js("fileNoInventedTag")]
        if case_id in FORBIDDEN:
            code.append(js("fileNoForbiddenPhrase"))
        if case_id in DEFER:
            code.append(js("fileAsksOrDefers"))
    elif runner == "interview":
        code = [js("interviewPreservesUncertainty")]
    else:  # gap
        code = [js("gapNoBinaryVerdict"), js("gapNoEvidenceShortCircuits"), js("gapNoInventedCitation")]
    return [*code, judge(runner, scenario, expect)]


def test_for(case, runner, fixture):
    case_id = case["id"]
    scenario, expect = case.get("scenario", ""), case.get("expect", "")
    vars_ = {"case_id": case_id, "agent": runner, "scenario": scenario, "expect": expect}
    vars_.update(extra_vars(case_id, runner, fixture))
    return {
        "description": f"[{runner}] {case_id}",
        "vars": vars_,
        "metadata": {"case_id": case_id, "category": runner, "test": case["test"]},
        "assert": asserts_for(runner, case_id, scenario, expect),
    }


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--cases", required=True)
    p.add_argument("--fixtures", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()
    try:
        lines = pathlib.Path(a.cases).read_text(encoding="utf-8").splitlines()
        fixtures = json.loads(pathlib.Path(a.fixtures).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    tests, probs, ids = [], [], set()
    pending, runnable = [], []
    for n, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            c = json.loads(line)
        except json.JSONDecodeError as e:
            probs.append(f"line {n}: not JSON ({e.msg})")
            continue
        missing = {"id", "test", "scenario", "expect", "assert"} - c.keys()
        if missing:
            probs.append(f"line {n}: missing {', '.join(sorted(missing))}")
            continue
        if c["id"] in ids:
            probs.append(f"line {n}: duplicate id {c['id']}")
        ids.add(c["id"])
        test = c["test"]
        if test in PENDING_TESTS:
            pending.append(c["id"])
            continue
        runner = TEST_RUNNER.get(test)
        if not runner:
            probs.append(f"line {n}: test {test} has no runner and is not marked PENDING")
            continue
        fixture = fixtures.get(c["id"])
        if not fixture:
            probs.append(f"line {n}: no fixture for {c['id']} in {a.fixtures}")
            continue
        if fixture.get("runner") and fixture["runner"] != runner:
            probs.append(f"line {n}: fixture runner {fixture['runner']} != routed runner {runner}")
            continue
        tests.append(test_for(c, runner, fixture))
        runnable.append(c["id"])

    if probs:
        print("FAIL")
        [print(" -", x) for x in probs]
        return 1

    pathlib.Path(a.out).write_text(json.dumps(tests, indent=2) + "\n", encoding="utf-8")
    by_agent = {}
    for t in tests:
        by_agent[t["metadata"]["category"]] = by_agent.get(t["metadata"]["category"], 0) + 1
    print(f"OK: {len(tests)} tests -> {a.out}  {by_agent}")
    if pending:
        print(f"PENDING (not emitted): {', '.join(pending)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
