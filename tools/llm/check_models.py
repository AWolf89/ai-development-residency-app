#!/usr/bin/env python3
"""Check that every model id in lib/llm/config.ts exists on OpenRouter and fits its use.

Usage: python3 check_models.py [--config src/lib/llm/config.ts] [--models-file models.json]
Without --models-file it downloads https://openrouter.ai/api/v1/models (public, no key needed).
Models listed under "extract" are used with a schema, so they must support structured outputs.
Exit codes: 0 pass, 1 missing or unsuitable model, 2 bad input or network error.
"""
import argparse, json, pathlib, re, sys, urllib.request

URL = "https://openrouter.ai/api/v1/models"

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--config", default="src/lib/llm/config.ts")
    p.add_argument("--models-file")
    a = p.parse_args()
    try:
        cfg = pathlib.Path(a.config).read_text(encoding="utf-8")
        block = re.search(r"models:\s*\{(.*?)\n\s*\},", cfg, re.S)
        if not block:
            raise ValueError("no `models: { ... }` block found in the config file")
        purposes = {k: re.findall(r"""['"]([\w.\-/:]+)['"]""", v) for k, v in re.findall(r"(\w+):\s*\[([^\]]*)\]", block.group(1))}
        if not purposes:
            raise ValueError("models block has no purpose lists")
        if a.models_file:
            data = json.loads(pathlib.Path(a.models_file).read_text(encoding="utf-8"))
        else:
            with urllib.request.urlopen(URL, timeout=20) as r:
                data = json.load(r)
        catalog = {m["id"]: m for m in data["data"]}
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as e:
        print(f"ERROR: {e}", file=sys.stderr); return 2
    probs, n = [], 0
    for purpose, ids in purposes.items():
        for mid in ids:
            n += 1
            m = catalog.get(mid)
            if not m:
                probs.append(f"{purpose}: '{mid}' is not on OpenRouter (misspelled, renamed, or retired)"); continue
            params = m.get("supported_parameters") or []
            if purpose == "extract" and "structured_outputs" not in params:
                probs.append(f"{purpose}: '{mid}' does not list structured_outputs support")
            price = m.get("pricing", {})
            print(f"ok  {purpose}: {mid}  context={m.get('context_length')}  input=${price.get('prompt')}/token  output=${price.get('completion')}/token")
    if probs:
        print("FAIL"); [print(" -", x) for x in probs]; return 1
    print(f"PASS: {n} model id(s) available"); return 0

if __name__ == "__main__":
    sys.exit(main())
