#!/usr/bin/env python3
"""Check how often the AI grader agrees with you, so you know whether to trust its scores.

Step 1: python3 judge_agreement.py results.json --export labels.csv [--sample 20]
        Writes grader-check rows (case, check, question, answer, grader verdict) with an empty human_pass column.
Step 2: Fill in human_pass with yes or no yourself, without looking at grader_pass first if you can.
Step 3: python3 judge_agreement.py results.json --labels labels.csv [--min-agreement 0.8]
        Reports agreement and Cohen's kappa (agreement beyond chance: 1 = perfect, 0 = chance, 0.6+ is usually considered good).
Exit codes: 0 agreement >= --min-agreement, 1 below it or too few labels, 2 bad input.
"""
import argparse, csv, json, pathlib, random, sys
sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from summarize_run import load, case_id  # noqa: E402

def grader_rows(rows):
    out = []
    for r in rows:
        for c in (r.get("gradingResult") or {}).get("componentResults", []):
            a = c.get("assertion") or {}
            if a.get("type") == "llm-rubric":
                out.append({"case_id": case_id(r), "check": a.get("metric") or "llm-rubric",
                            "question": (r.get("vars") or {}).get("question", ""), "answer": ((r.get("response") or {}).get("output") or "")[:1000],
                            "grader_pass": "yes" if c.get("pass") else "no", "grader_reason": (c.get("reason") or "")[:300], "human_pass": ""})
    return out

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("results"); g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--export"); g.add_argument("--labels")
    p.add_argument("--sample", type=int, default=20); p.add_argument("--seed", type=int, default=7)
    p.add_argument("--min-agreement", type=float, default=0.8); p.add_argument("--min-labels", type=int, default=10)
    a = p.parse_args()
    try:
        _, rows = load(a.results)
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as e:
        print(f"ERROR: {e}", file=sys.stderr); return 2
    gr = grader_rows(rows)
    if not gr:
        print("ERROR: no AI-graded (llm-rubric) checks in this run", file=sys.stderr); return 2
    if a.export:
        pick = gr if len(gr) <= a.sample else random.Random(a.seed).sample(gr, a.sample)
        with open(a.export, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(pick[0])); w.writeheader(); w.writerows(pick)
        print(f"Wrote {len(pick)} rows to {a.export}. Fill in human_pass (yes/no), then run with --labels."); return 0
    try:
        with open(a.labels, newline="", encoding="utf-8") as f:
            labels = list(csv.DictReader(f))
    except OSError as e:
        print(f"ERROR: {e}", file=sys.stderr); return 2
    verdict = {(r["case_id"], r["check"]): r["grader_pass"] == "yes" for r in gr}
    pairs, bad = [], []
    for l in labels:
        h = (l.get("human_pass") or "").strip().lower()
        if h not in ("yes", "no"):
            continue
        key = (l.get("case_id"), l.get("check"))
        if key not in verdict:
            bad.append(key); continue
        pairs.append((h == "yes", verdict[key]))
    if bad:
        print(f"ERROR: {len(bad)} labeled rows aren't in this run (e.g. {bad[0]}). Label the same run you check.", file=sys.stderr); return 2
    n = len(pairs)
    if n < a.min_labels:
        print(f"FAIL: only {n} labeled rows; label at least {a.min_labels}."); return 1
    agree = sum(h == j for h, j in pairs) / n
    ph, pj = sum(h for h, _ in pairs) / n, sum(j for _, j in pairs) / n
    pe = ph * pj + (1 - ph) * (1 - pj)
    kappa = (agree - pe) / (1 - pe) if pe < 1 else 1.0
    fp = sum(j and not h for h, j in pairs); fn = sum(h and not j for h, j in pairs)
    print(f"Labeled: {n} · agreement {agree:.0%} · Cohen's kappa {kappa:.2f}")
    print(f"Grader passed what you failed: {fp} (too lenient) · grader failed what you passed: {fn} (too strict)")
    ok = agree >= a.min_agreement
    print("PASS: grader is usable at this agreement." if ok else "FAIL: rewrite the rubric (be specific, one criterion per check) or change the judge model, then re-check.")
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
