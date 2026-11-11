#!/usr/bin/env python3
"""Enforce code rules declared in accepted ADRs (for CI).

An accepted ADR may contain a fenced block tagged adr-rules holding a JSON list:
  [{"id": "no-direct-supabase-in-ui",
    "description": "UI code uses lib/supabase helpers, never the SDK directly",
    "files": ["src/app/**/*.tsx"],
    "forbid": "from ['\\"]@supabase/supabase-js['\\"]",
    "allow_in": ["src/lib/supabase/**"]}]
Each rule fails if the regex in "forbid" matches any line of a file matching "files",
except files matching "allow_in". Only ADRs with status accepted are enforced.

Usage: python3 check_adr_rules.py [--dir docs/adr] [--root .] [--list]
Exit codes: 0 pass, 1 violations, 2 bad rule or bad input.
"""
import argparse, fnmatch, json, pathlib, re, sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from check_adr import status_of, NAME  # noqa: E402

SKIP_DIRS = {".git", "node_modules", ".next", "dist", "build", "coverage"}

def match(path, globs):
    return any(fnmatch.fnmatch(path, g) or fnmatch.fnmatch(path, g.replace("**/", "")) for g in globs)

def load_rules(d):
    rules, errors = [], []
    for f in sorted(d.glob("*.md")):
        if not NAME.match(f.name):
            continue
        t = f.read_text(encoding="utf-8")
        if (status_of(t)[0] or "") != "accepted":
            continue
        for block in re.findall(r"```adr-rules\n(.*?)```", t, re.S):
            try:
                items = json.loads(block)
                assert isinstance(items, list)
            except (json.JSONDecodeError, AssertionError) as e:
                errors.append(f"{f.name}: adr-rules block is not a JSON list ({e})"); continue
            for r in items:
                miss = [k for k in ("id", "description", "files", "forbid") if k not in r]
                if miss:
                    errors.append(f"{f.name}: rule missing {', '.join(miss)}"); continue
                try:
                    r["_re"] = re.compile(r["forbid"])
                except re.error as e:
                    errors.append(f"{f.name}: rule {r['id']} has a bad regex ({e})"); continue
                r["_adr"] = f.name
                rules.append(r)
    return rules, errors

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dir", default="docs/adr")
    p.add_argument("--root", default=".")
    p.add_argument("--list", action="store_true", help="list rules and exit")
    a = p.parse_args()
    d, root = pathlib.Path(a.dir), pathlib.Path(a.root)
    if not d.is_dir() or not root.is_dir():
        print("ERROR: ADR folder or root folder not found", file=sys.stderr); return 2
    rules, errors = load_rules(d)
    if errors:
        print("FAIL (bad rules)"); [print(" -", e) for e in errors]; return 2
    if a.list:
        for r in rules: print(f"{r['id']} ({r['_adr']}): {r['description']}")
        return 0
    files = [f for f in root.rglob("*") if f.is_file() and not (set(f.relative_to(root).parts) & SKIP_DIRS)]
    violations = []
    for r in rules:
        for f in files:
            rel = f.relative_to(root).as_posix()
            if not match(rel, r["files"]) or match(rel, r.get("allow_in", [])):
                continue
            try:
                lines = f.read_text(encoding="utf-8").splitlines()
            except (UnicodeDecodeError, OSError):
                continue
            for i, line in enumerate(lines, 1):
                if r["_re"].search(line):
                    violations.append(f"{rel}:{i} breaks {r['id']} ({r['_adr']}): {r['description']}")
    if violations:
        print("FAIL"); [print(" -", v) for v in violations]; return 1
    print(f"PASS: {len(rules)} rule(s) from accepted ADRs, no violations"); return 0

if __name__ == "__main__":
    sys.exit(main())
