#!/usr/bin/env python3
"""Check that every ADR in a folder is complete and well-formed.

Usage: python3 check_adr.py [--dir docs/adr] [--base origin/main]
Checks: file names (NNNN-kebab-title.md), unique numbers, a title, a valid status,
a date, required sections, no leftover template text, at least two options and a
chosen option that is one of them (MADR), working supersede links in both directions.
With --base (a git ref), also fails if an accepted ADR changed beyond its status line.
Exit codes: 0 pass, 1 problems found, 2 bad input.
"""
import argparse, pathlib, re, subprocess, sys

NAME = re.compile(r"^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$")
STATUS = re.compile(r"^(proposed|accepted|rejected|deprecated|superseded by adr-(\d{4}))$")
PLACEHOLDER = re.compile(r"\{[A-Za-z][^{}\n]{2,}\}|\bTODO\b|\bTBD\b")
SKIP = {"README.md", "index.md", "template.md"}

def strip_code(t):
    return re.sub(r"```.*?```", "", re.sub(r"<!--.*?-->", "", t, flags=re.S), flags=re.S)

def sections(t):
    return [h.strip().lower() for h in re.findall(r"^##\s+(.+)$", t, re.M)]

def bullets_under(t, heading):
    m = re.search(rf"^##\s+{re.escape(heading)}\s*$(.*?)(?=^##\s|\Z)", t, re.M | re.S | re.I)
    return [b.strip() for b in re.findall(r"^\s*[*-]\s+(.+)$", m.group(1), re.M)] if m else []

def status_of(t):
    m = re.search(r"^status:\s*\"?([^\"\n]+)\"?\s*$", t, re.M | re.I)
    if m:
        return m.group(1).strip().lower(), "madr"
    m = re.search(r"^##\s+Status\s*$\s*^([^\n#]+)$", t, re.M | re.I)
    return (m.group(1).strip().lower() if m else None), "nygard"

def check_file(f, numbers):
    t = f.read_text(encoding="utf-8")
    body = strip_code(t)
    probs = []
    st, fmt = status_of(t)
    if st is None:
        probs.append("no status")
    elif not STATUS.match(st):
        probs.append(f"status '{st}' is not proposed, accepted, rejected, deprecated, or superseded by ADR-NNNN")
    elif STATUS.match(st).group(2):
        target = int(STATUS.match(st).group(2))
        if target not in numbers:
            probs.append(f"superseded by ADR-{target:04d}, which does not exist")
        else:
            tgt = numbers[target].read_text(encoding="utf-8")
            if not re.search(rf"supersedes\s+\[?adr-{int(NAME.match(f.name).group(1)):04d}", tgt, re.I):
                probs.append(f"ADR-{target:04d} does not link back with 'Supersedes ADR-{int(NAME.match(f.name).group(1)):04d}'")
    if not re.search(r"^#\s+\S", body, re.M):
        probs.append("no '# title' line")
    if not re.search(r"(^date:\s*\"?\d{4}-\d{2}-\d{2}|^Date:\s*\d{4}-\d{2}-\d{2})", t, re.M):
        probs.append("no date (YYYY-MM-DD)")
    secs = sections(body)
    need = ["context and problem statement", "considered options", "decision outcome"] if fmt == "madr" else ["status", "context", "decision", "consequences"]
    for s in need:
        if s not in secs:
            probs.append(f"missing section '## {s.title()}'")
    if fmt == "madr":
        opts = bullets_under(body, "Considered Options")
        if len(opts) < 2:
            probs.append(f"needs at least 2 considered options (found {len(opts)})")
        m = re.search(r"Chosen option:\s*\"([^\"]+)\"", body)
        if not m:
            probs.append("Decision Outcome has no 'Chosen option: \"...\"' line")
        elif opts and m.group(1).strip().lower() not in [o.strip('"').lower() for o in opts]:
            probs.append(f"chosen option \"{m.group(1)}\" is not in Considered Options")
        if not re.search(r"\bBad, because\b", body):
            probs.append("no 'Bad, because' consequence: record the costs too")
    for block in re.findall(r"```adr-rules\n(.*?)```", t, re.S):
        if PLACEHOLDER.search(block):
            probs.append("adr-rules block still has template text: fill it in or delete the block")
    for line_no, line in enumerate(t.splitlines(), 1):
        if PLACEHOLDER.search(strip_code(line)):
            probs.append(f"line {line_no}: leftover template text: {line.strip()[:70]}")
    return probs

def git_changed_accepted(d, base):
    try:
        out = subprocess.run(["git", "diff", "--unified=0", base, "--", str(d)], capture_output=True, text=True, check=True).stdout
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        raise SystemExit(f"ERROR: git diff against {base} failed: {e}")
    probs, cur = [], None
    old_status = {}
    for line in out.splitlines():
        if line.startswith("--- a/"):
            cur = line[6:]
        elif cur and line.startswith("-") and not line.startswith("---"):
            if re.match(r"^-(status:|accepted|proposed|rejected|deprecated|superseded)", line, re.I):
                continue
            try:
                was = subprocess.run(["git", "show", f"{base}:{cur}"], capture_output=True, text=True, check=True).stdout
            except subprocess.CalledProcessError:
                continue
            if (status_of(was)[0] or "") == "accepted":
                probs.append(f"{cur}: accepted ADR edited ({line[:60]!r}). Supersede it with a new ADR instead.")
                cur = None
    return probs

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dir", default="docs/adr")
    p.add_argument("--base", help="git ref to compare against, e.g. origin/main")
    a = p.parse_args()
    d = pathlib.Path(a.dir)
    if not d.is_dir():
        print(f"ERROR: ADR folder not found: {d}", file=sys.stderr); return 2
    files = sorted(f for f in d.glob("*.md") if f.name not in SKIP)
    problems, numbers = [], {}
    for f in files:
        m = NAME.match(f.name)
        if not m:
            problems.append(f"{f.name}: name must look like 0001-short-kebab-title.md"); continue
        n = int(m.group(1))
        if n in numbers:
            problems.append(f"{f.name}: number {n:04d} already used by {numbers[n].name}")
        numbers[n] = f
    for n, f in sorted(numbers.items()):
        problems += [f"{f.name}: {x}" for x in check_file(f, numbers)]
    if a.base:
        problems += git_changed_accepted(d, a.base)
    if problems:
        print("FAIL"); [print(" -", x) for x in problems]; return 1
    print(f"PASS: {len(numbers)} ADR(s) checked"); return 0

if __name__ == "__main__":
    sys.exit(main())
