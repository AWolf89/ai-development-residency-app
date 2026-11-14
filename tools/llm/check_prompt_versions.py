#!/usr/bin/env python3
"""Fail if a prompt file changed without its version going up (compared to a git ref).

Usage: python3 check_prompt_versions.py --base origin/main [--dir src/lib/llm/prompts]
Why: every logged run records prompt_id and prompt_version. If the wording changes but the
version doesn't, you can't tell which wording produced which results.
Exit codes: 0 pass, 1 version not raised, 2 git or input error.
"""
import argparse, re, subprocess, sys

def ver(text):
    m = re.search(r"""\bversion:\s*['"](\d+)\.(\d+)\.(\d+)['"]""", text or "")
    return tuple(int(x) for x in m.groups()) if m else None

def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True)

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--base", required=True)
    p.add_argument("--dir", default="src/lib/llm/prompts")
    a = p.parse_args()
    r = git("diff", "--name-only", a.base, "--", a.dir)
    if r.returncode != 0:
        print(f"ERROR: git diff against {a.base} failed: {r.stderr.strip()} (in CI, fetch the base branch first)", file=sys.stderr); return 2
    probs, checked = [], 0
    for path in [x for x in r.stdout.split() if x.endswith(".ts") and not x.endswith(("types.ts", "index.ts"))]:
        try:
            new = open(path, encoding="utf-8").read()
        except FileNotFoundError:
            continue  # prompt deleted
        old = git("show", f"{a.base}:{path}")
        if old.returncode != 0:
            continue  # new prompt; check_llm_usage.py validates its version
        checked += 1
        ov, nv = ver(old.stdout), ver(new)
        if nv is None:
            probs.append(f"{path}: no semver version")
        elif ov and nv <= ov:
            probs.append(f"{path}: changed, but version {'.'.join(map(str, nv))} is not above {'.'.join(map(str, ov))}")
    if probs:
        print("FAIL"); [print(" -", x) for x in probs]; return 1
    print(f"PASS: {checked} changed prompt(s) have higher versions"); return 0

if __name__ == "__main__":
    sys.exit(main())
