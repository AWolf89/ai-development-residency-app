#!/usr/bin/env python3
"""Static safety checks for LLM code in a Next.js repo.

Usage: python3 check_llm_usage.py [--root .] [--src src] [--allow src/lib/llm src/app/api]
Fails when:
  - an OpenRouter key appears in a file (sk-or-...) or in a NEXT_PUBLIC_ variable
  - a "use client" file mentions OPENROUTER_API_KEY or imports lib/llm (except prompt types)
  - code outside the allowed folders imports the model SDKs, so every call goes through lib/llm
  - lib/llm/client.ts lacks import "server-only", or config.ts lacks data_collection "deny"
  - a prompt file lacks a kebab-case id or a semver version, or two prompts share an id
Exit codes: 0 pass, 1 problems, 2 bad input.
"""
import argparse, pathlib, re, sys

CODE = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"}
SKIP = {"node_modules", ".next", ".git", "dist", "build", "coverage"}
SDK_IMPORT = re.compile(r"""from\s+['"](@openrouter/ai-sdk-provider|openai)['"]|import\s*\{[^}]*\b(generateText|streamText|generateObject|streamObject|embed|embedMany)\b[^}]*\}\s*from\s+['"]ai['"]""")
KEY = re.compile(r"sk-or-(v1-)?[A-Za-z0-9]{16,}")
USE_CLIENT = re.compile(r"""\A(\s*(//[^\n]*|/\*.*?\*/))*\s*['"]use client['"]""", re.S)

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--root", default=".")
    p.add_argument("--src", default="src")
    p.add_argument("--allow", nargs="*", default=["src/lib/llm", "src/app/api"])
    a = p.parse_args()
    root = pathlib.Path(a.root)
    if not (root / a.src).is_dir():
        print(f"ERROR: source folder not found: {root / a.src}", file=sys.stderr); return 2
    probs = []
    files = [f for f in root.rglob("*") if f.is_file() and not (set(f.relative_to(root).parts) & SKIP)]
    for f in files:
        rel = f.relative_to(root).as_posix()
        try:
            t = f.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if KEY.search(t):
            probs.append(f"{rel}: contains what looks like an OpenRouter key. Remove it and rotate the key now.")
        if re.search(r"NEXT_PUBLIC_\w*OPENROUTER", t):
            probs.append(f"{rel}: NEXT_PUBLIC_ variables reach the browser; the OpenRouter key must stay server-only.")
        if f.suffix not in CODE or not rel.startswith(a.src.rstrip("/") + "/"):
            continue
        client_file = USE_CLIENT.match(t) is not None
        if client_file and "OPENROUTER_API_KEY" in t:
            probs.append(f"{rel}: browser component reads OPENROUTER_API_KEY")
        if client_file and re.search(r"""from\s+['"](@/lib/llm|\.{1,2}/.*lib/llm)/(?!prompts/types['"])""", t):
            probs.append(f"{rel}: browser component imports server-only LLM code")
        if SDK_IMPORT.search(t) and not any(rel.startswith(x.rstrip("/") + "/") for x in a.allow):
            probs.append(f"{rel}: calls the model SDK directly; go through lib/llm (runLLM or getModel)")
    llm = root / a.src / "lib" / "llm"
    client, config = llm / "client.ts", llm / "config.ts"
    if not client.exists() or not re.search(r"""import\s+['"]server-only['"]""", client.read_text(encoding="utf-8")):
        probs.append(f"{a.src}/lib/llm/client.ts: missing, or lacks import \"server-only\"")
    if not config.exists() or not re.search(r"""data_collection:\s*['"]deny['"]""", config.read_text(encoding="utf-8")):
        probs.append(f"{a.src}/lib/llm/config.ts: missing, or lacks provider data_collection \"deny\"")
    ids = {}
    pdir = llm / "prompts"
    for f in sorted(pdir.glob("*.ts")) if pdir.is_dir() else []:
        if f.name in ("types.ts", "index.ts"):
            continue
        t = f.read_text(encoding="utf-8")
        rel = f.relative_to(root).as_posix()
        mid = re.search(r"""\bid:\s*['"]([^'"]+)['"]""", t)
        mver = re.search(r"""\bversion:\s*['"]([^'"]+)['"]""", t)
        if not mid or not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", mid.group(1)):
            probs.append(f"{rel}: prompt needs a kebab-case id")
        if not mver or not re.fullmatch(r"\d+\.\d+\.\d+", mver.group(1)):
            probs.append(f"{rel}: prompt needs a semver version like 1.0.0")
        if mid:
            if mid.group(1) in ids:
                probs.append(f"{rel}: prompt id '{mid.group(1)}' is also used in {ids[mid.group(1)]}")
            ids[mid.group(1)] = rel
    if probs:
        print("FAIL"); [print(" -", x) for x in probs]; return 1
    print(f"PASS: {len(files)} files scanned, {len(ids)} prompt(s) checked"); return 0

if __name__ == "__main__":
    sys.exit(main())
