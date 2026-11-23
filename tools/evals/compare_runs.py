#!/usr/bin/env python3
"""Compare two promptfoo runs on the same cases (baseline vs candidate) before shipping a change.

Usage: python3 compare_runs.py baseline.json candidate.json [--max-regressions 0] [--max-drop 0.02] [--out compare.md]
A regression is a case that passed in the baseline and fails in the candidate.
Reports pass rate per check, regressions and fixes by case, and cost and latency changes.
Exit codes: 0 safe to ship by these limits, 1 too many regressions or too big a drop, 2 bad input or different case sets.
"""
import argparse, json, pathlib, statistics, sys
sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from summarize_run import load, case_id, checks  # noqa: E402

def index(rows):
    return {case_id(r): r for r in rows}

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("baseline"); p.add_argument("candidate")
    p.add_argument("--max-regressions", type=int, default=0); p.add_argument("--max-drop", type=float, default=0.02)
    p.add_argument("--out")
    a = p.parse_args()
    try:
        (_, b_rows), (_, c_rows) = load(a.baseline), load(a.candidate)
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as e:
        print(f"ERROR: {e}", file=sys.stderr); return 2
    B, C = index(b_rows), index(c_rows)
    if set(B) != set(C):
        print(f"ERROR: runs used different cases (only in baseline: {sorted(set(B) - set(C))[:5]}, only in candidate: {sorted(set(C) - set(B))[:5]}). Re-run both on the same test file.", file=sys.stderr); return 2
    reg = sorted(k for k in B if B[k].get("success") and not C[k].get("success"))
    fixed = sorted(k for k in B if not B[k].get("success") and C[k].get("success"))
    rate = lambda rows: sum(bool(r.get("success")) for r in rows) / len(rows)
    rb, rc = rate(b_rows), rate(c_rows)
    names = sorted({n for r in b_rows + c_rows for n in checks(r)})
    def check_rate(rows, n):
        v = [checks(r)[n] for r in rows if n in checks(r)]
        return sum(v) / len(v) if v else float("nan")
    cost = lambda rows: sum(float(r.get("cost") or 0) for r in rows)
    lat = lambda rows: statistics.median([r["latencyMs"] for r in rows if isinstance(r.get("latencyMs"), (int, float))] or [0])
    L = ["# Baseline vs candidate", "", f"Cases: {len(B)} · pass rate **{rb:.0%} → {rc:.0%}** · regressions **{len(reg)}** · fixes {len(fixed)}",
         f"App cost ${cost(b_rows):.4f} → ${cost(c_rows):.4f} · median latency {lat(b_rows):.0f} → {lat(c_rows):.0f} ms", "",
         "| Check | Baseline | Candidate |", "|---|---|---|", *[f"| {n} | {check_rate(b_rows, n):.0%} | {check_rate(c_rows, n):.0%} |" for n in names], ""]
    if reg:
        L += ["## Regressions (passed before, fail now)", "", *[f"- {k}" for k in reg], ""]
    if fixed:
        L += ["## Fixed", "", *[f"- {k}" for k in fixed], ""]
    ok = len(reg) <= a.max_regressions and (rb - rc) <= a.max_drop
    L.append(f"**{'OK to ship by these limits' if ok else 'Do not ship'}** (max regressions {a.max_regressions}, max drop {a.max_drop:.0%}). With few cases, one case is a big swing: grow the set before trusting small differences.")
    text = "\n".join(L) + "\n"
    print(text)
    if a.out:
        pathlib.Path(a.out).write_text(text, encoding="utf-8")
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
