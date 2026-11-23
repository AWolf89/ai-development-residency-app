#!/usr/bin/env python3
"""Summarize a promptfoo results file: pass rates by category and by check, cost, speed, and failures.

Usage: python3 summarize_run.py results.json [--min-pass 0.9] [--out docs/evals/latest.md]
results.json comes from: npx promptfoo eval -o results.json
Exit codes: 0 overall pass rate >= --min-pass, 1 below it (or any test errored), 2 bad input.
"""
import argparse, json, pathlib, statistics, sys
from collections import defaultdict

def load(path):
    d = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    rows = d["results"]["results"]
    if not isinstance(rows, list) or not rows:
        raise ValueError("no results in file")
    return d, rows

def case_id(r):
    return (r.get("testCase", {}).get("metadata") or {}).get("case_id") or r.get("testCase", {}).get("description") or str(r.get("testIdx"))

def checks(r):
    return {(c.get("assertion") or {}).get("metric") or (c.get("assertion") or {}).get("type"): bool(c.get("pass"))
            for c in (r.get("gradingResult") or {}).get("componentResults", [])}

def summarize(rows):
    by_cat, by_check, fails, errors = defaultdict(list), defaultdict(list), [], []
    for r in rows:
        cat = (r.get("testCase", {}).get("metadata") or {}).get("category", "uncategorized")
        ok = bool(r.get("success"))
        by_cat[cat].append(ok)
        if r.get("error") and not r.get("gradingResult"):
            errors.append((case_id(r), str(r["error"])[:160]))
        for name, passed in checks(r).items():
            by_check[name].append(passed)
        if not ok:
            reasons = [c.get("reason", "") for c in (r.get("gradingResult") or {}).get("componentResults", []) if not c.get("pass")]
            fails.append((case_id(r), cat, "; ".join(x for x in reasons if x)[:200] or str(r.get("error", ""))[:200]))
    cost = sum(float(r.get("cost") or 0) for r in rows)
    lat = [r["latencyMs"] for r in rows if isinstance(r.get("latencyMs"), (int, float))]
    return by_cat, by_check, fails, errors, cost, lat

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("results"); p.add_argument("--min-pass", type=float, default=0.9); p.add_argument("--out")
    a = p.parse_args()
    try:
        d, rows = load(a.results)
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as e:
        print(f"ERROR: not a promptfoo results file ({e})", file=sys.stderr); return 2
    by_cat, by_check, fails, errors, cost, lat = summarize(rows)
    total = sum(sum(v) for v in by_cat.values()) / len(rows)
    pct = lambda v: f"{sum(v)}/{len(v)} ({sum(v) / len(v):.0%})"
    L = ["# Answer evaluation", "", f"Run: {d.get('evalId', '?')} · {len(rows)} cases · **pass rate {total:.0%}**",
         f"App cost: ${cost:.4f} · median latency: {statistics.median(lat):.0f} ms" if lat else f"App cost: ${cost:.4f}", "",
         "| Category | Passed |", "|---|---|", *[f"| {k} | {pct(v)} |" for k, v in sorted(by_cat.items())], "",
         "| Check | Passed |", "|---|---|", *[f"| {k} | {pct(v)} |" for k, v in sorted(by_check.items())], ""]
    if errors:
        L += ["## Errors (the app or grader failed to run)", "", *[f"- {c}: {e}" for c, e in errors], ""]
    if fails:
        L += ["## Failed cases", "", "| Case | Category | Why |", "|---|---|---|", *[f"| {c} | {k} | {w.replace('|', '/')} |" for c, k, w in fails], ""]
    L.append("Grader checks are model judgments: confirm a sample with judge_agreement.py before trusting them.")
    text = "\n".join(L) + "\n"
    print(text)
    if a.out:
        pathlib.Path(a.out).parent.mkdir(parents=True, exist_ok=True); pathlib.Path(a.out).write_text(text, encoding="utf-8")
    return 0 if total >= a.min_pass and not errors else 1

if __name__ == "__main__":
    sys.exit(main())
