#!/usr/bin/env python3
"""Create the next numbered ADR file from a template.

Usage: python3 new_adr.py "Use Supabase for the database" [--format madr|nygard] [--dir docs/adr]
                          [--supersedes 3]
Prints the new file path. Exit codes: 0 created, 1 refused (duplicate title), 2 bad input.
Numbers are one above the highest existing number and never reused.
"""
import argparse, datetime, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent.parent
NAME = re.compile(r"^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$")

def slug(title):
    s = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return re.sub(r"-{2,}", "-", s)[:60].strip("-")

def template(fmt):
    text = (HERE / "references" / f"{fmt}-template.md").read_text(encoding="utf-8")
    m = re.search(r"````markdown\n(.*?)````", text, re.S)
    if not m:
        raise SystemExit(f"ERROR: no template block in references/{fmt}-template.md")
    return m.group(1)

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("title")
    p.add_argument("--format", choices=["madr", "nygard"], default="madr")
    p.add_argument("--dir", default="docs/adr")
    p.add_argument("--supersedes", type=int, help="number of the ADR this one replaces")
    a = p.parse_args()
    s = slug(a.title)
    if not s:
        print("ERROR: title has no letters or numbers", file=sys.stderr); return 2
    d = pathlib.Path(a.dir); d.mkdir(parents=True, exist_ok=True)
    existing = {f.name: int(NAME.match(f.name).group(1)) for f in d.glob("*.md") if NAME.match(f.name)}
    for n in existing:
        if n[5:] == f"{s}.md":
            print(f"REFUSED: {d / n} already has this title. Edit it if unaccepted, or pick a new title.", file=sys.stderr); return 1
    if a.supersedes is not None and a.supersedes not in existing.values():
        print(f"ERROR: no ADR number {a.supersedes:04d} in {d}", file=sys.stderr); return 2
    num = max(existing.values(), default=0) + 1
    body = template(a.format)
    body = body.replace("NNNN", f"{num:04d}").replace("{TITLE}", a.title.strip()).replace("{DATE}", datetime.date.today().isoformat())
    if a.supersedes is not None:
        body = body.replace("{SUPERSEDES}", f"Supersedes [ADR-{a.supersedes:04d}]({next(n for n, v in existing.items() if v == a.supersedes)}).")
    else:
        body = re.sub(r"\n?\{SUPERSEDES\}\n?", "\n", body)
    out = d / f"{num:04d}-{s}.md"
    out.write_text(body, encoding="utf-8")
    print(out)
    return 0

if __name__ == "__main__":
    sys.exit(main())
