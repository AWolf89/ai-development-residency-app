#!/usr/bin/env python3
"""Turn axe results saved by the page-scan tests into an issue table.

Usage: python3 summarize_axe.py [--dir a11y-results/axe] [--out docs/accessibility/axe-report.md]
Reads every *.json file (axe results objects) and prints one row per violation and
page: WCAG success criteria, impact, rule, how many elements, first element, help link.
Exit codes: 0 no violations, 1 violations found, 2 no result files or bad JSON.
"""
import argparse, json, pathlib, re, sys

ORDER = {"critical": 0, "serious": 1, "moderate": 2, "minor": 3}

def criteria(tags):
    sc = []
    for t in tags:
        m = re.fullmatch(r"wcag(\d)(\d)(\d+)", t)
        if m: sc.append(f"{m.group(1)}.{m.group(2)}.{m.group(3)}")
    return ", ".join(sc) or "best practice"

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dir", default="a11y-results/axe")
    p.add_argument("--out")
    a = p.parse_args()
    files = sorted(pathlib.Path(a.dir).glob("*.json"))
    if not files:
        print(f"ERROR: no axe result files in {a.dir}. Run the page scans first.", file=sys.stderr); return 2
    rows = []
    for f in files:
        try:
            res = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"ERROR: {f} is not valid JSON ({e})", file=sys.stderr); return 2
        page = f.stem
        for v in res.get("violations", []):
            nodes = v.get("nodes", [])
            target = nodes[0].get("target", ["?"])[0] if nodes else "?"
            rows.append((ORDER.get(v.get("impact"), 4), page, criteria(v.get("tags", [])), v.get("impact") or "unknown",
                         v["id"], len(nodes), str(target).replace("|", "\\|")[:60], v.get("helpUrl", "")))
    rows.sort()
    lines = [f"# Automated accessibility scan (axe-core, WCAG 2.2 AA)", "",
             f"Pages scanned: {len(files)} · Violations: {len(rows)}", ""]
    if rows:
        lines += ["| Page | WCAG SC | Impact | Rule | Elements | First element | Help |", "|---|---|---|---|---|---|---|"]
        lines += [f"| {r[1]} | {r[2]} | {r[3]} | {r[4]} | {r[5]} | `{r[6]}` | {r[7]} |" for r in rows]
    else:
        lines.append("No automated violations. Automated tools find only part of the problems: complete the manual checklist too.")
    text = "\n".join(lines) + "\n"
    print(text)
    if a.out:
        pathlib.Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        pathlib.Path(a.out).write_text(text, encoding="utf-8")
    return 1 if rows else 0

if __name__ == "__main__":
    sys.exit(main())
