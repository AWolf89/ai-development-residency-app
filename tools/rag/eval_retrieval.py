#!/usr/bin/env python3
"""Measure how well reference_hybrid_search finds the right reference item, and pick the
"not found" similarity threshold for the Evidence Search Pipeline.

Self-contained (stdlib only). Runs against a database that already has reference_chunks
embedded (run `npm run rag:index` first). It does NOT run in CI — it needs a loaded DB.

Usage:
  python tools/rag/eval_retrieval.py --questions tests/rag/retrieval_questions.json \
      [--k 5] [--min-hit-rate 0.8] [--out docs/rag/retrieval-report.md]

Questions file: a list of {"q": "...", "expect": ["<ref_id>", ...]}, where ref_id is an
O*NET SOC code (e.g. "15-2051.00") or a framework slug. expect = [] means the corpus has no
answer and retrieval should abstain (no relevant hit).

Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, OPENROUTER_API_KEY (service-role, because
reference_chunks is readable only by authenticated users and this script has no user session).
Reports hit rate @k, MRR (1.0 = right answer always first), and a suggested minSimilarity
that separates answerable from unanswerable questions. Exit: 0 hit rate >= threshold, 1 below,
2 bad input / request failure.
"""
import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

EMBED_URL = "https://openrouter.ai/api/v1/embeddings"
EMBED_MODEL = "openai/text-embedding-3-small"  # keep in sync with src/lib/llm/config.ts


def http(method, url, headers, body):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise SystemExit(f"ERROR: {method} {url} -> {e.code} {e.read().decode('utf-8', 'ignore')[:300]}")
    except urllib.error.URLError as e:
        raise SystemExit(f"ERROR: {method} {url} -> {e.reason}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--questions", required=True)
    p.add_argument("--k", type=int, default=5)
    p.add_argument("--min-hit-rate", type=float, default=0.8)
    p.add_argument("--out")
    a = p.parse_args()

    try:
        qs = json.loads(pathlib.Path(a.questions).read_text(encoding="utf-8"))
        assert isinstance(qs, list) and qs
        assert all("q" in x and isinstance(x.get("expect"), list) for x in qs)
    except (OSError, json.JSONDecodeError, AssertionError) as e:
        print(f"ERROR: questions must be a list of {{q, expect: [ref_ids]}} ({e})", file=sys.stderr)
        return 2

    base = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    # reference_chunks is readable only by authenticated users (RLS mirrors reference_items),
    # and this eval has no user session, so it uses the service-role key like the backfill.
    skey = os.environ.get("SUPABASE_SECRET_KEY")
    okey = os.environ.get("OPENROUTER_API_KEY")
    if not (base and skey and okey):
        print("ERROR: set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, OPENROUTER_API_KEY", file=sys.stderr)
        return 2

    emb = http("POST", EMBED_URL, {"Authorization": f"Bearer {okey}", "Content-Type": "application/json"},
               {"model": EMBED_MODEL, "input": [x["q"] for x in qs],
                "provider": {"data_collection": "deny", "zdr": True}})
    vecs = [d["embedding"] for d in sorted(emb["data"], key=lambda d: d["index"])]

    supa_headers = {"apikey": skey, "Authorization": f"Bearer {skey}", "Content-Type": "application/json"}
    rows, hits, rr, ans_sims, none_sims = [], 0, 0.0, [], []
    for x, v in zip(qs, vecs):
        res = http("POST", f"{base}/rest/v1/rpc/reference_hybrid_search", supa_headers,
                   {"query_text": x["q"], "query_embedding": json.dumps(v), "match_count": a.k * 2})
        ids = []
        for r in res:
            if r["ref_id"] not in ids:
                ids.append(r["ref_id"])
        ids = ids[: a.k]
        kw = any(r.get("keyword_rank") is not None for r in res)
        best = max([r.get("similarity") or 0 for r in res] or [0])
        if x["expect"]:
            rank = next((i + 1 for i, c in enumerate(ids) if c in x["expect"]), None)
            hits += rank is not None
            rr += 1 / rank if rank else 0
            ans_sims.append(best)
            rows.append(f"| {x['q']} | {', '.join(x['expect'])} | {rank or 'miss'} | {best:.3f} | {'yes' if kw else 'no'} |")
        else:
            none_sims.append((best, kw))
            rows.append(f"| {x['q']} | (none: should abstain) | {'keyword hit!' if kw else '-'} | {best:.3f} | {'yes' if kw else 'no'} |")

    n = sum(1 for x in qs if x["expect"])
    hit_rate, mrr = (hits / n if n else 0), (rr / n if n else 0)
    lines = ["# Retrieval evaluation (reference corpus)", "",
             f"Questions: {len(qs)} ({n} answerable) · k={a.k}", "",
             f"**Hit rate @{a.k}: {hit_rate:.0%}** · **MRR: {mrr:.2f}**", "",
             "| Question | Expected ref_id | Rank | Best similarity | Keyword match |",
             "|---|---|---|---|---|", *rows, ""]
    if ans_sims and none_sims:
        lo_ans, hi_none = min(ans_sims), max(s for s, _ in none_sims)
        if hi_none < lo_ans:
            lines.append(f"Suggested minSimilarity: **{(hi_none + lo_ans) / 2:.2f}** "
                         f"(unanswerable max {hi_none:.3f} < answerable min {lo_ans:.3f}).")
        else:
            lines.append(f"Answerable and unanswerable similarities overlap ({lo_ans:.3f} vs {hi_none:.3f}); "
                         "a threshold alone can't separate them. Add more questions and review misses.")
        leaks = sum(1 for _, kw in none_sims if kw)
        if leaks:
            lines.append(f"Warning: {leaks} unanswerable question(s) had a keyword match. Check replies with ai-evals.")
    text = "\n".join(lines) + "\n"
    print(text)
    if a.out:
        out = pathlib.Path(a.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
    return 0 if hit_rate >= a.min_hit_rate else 1


if __name__ == "__main__":
    sys.exit(main())
