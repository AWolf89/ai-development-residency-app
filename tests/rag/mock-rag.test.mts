/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles mimic untyped payloads */
// Boundary tests for the Evidence Search Pipeline: the embedding gateway and the retrieval /
// indexing flows, against a fake OpenRouter and a fake Supabase (no network, no database, no
// key leakage). Run: NODE_OPTIONS=--conditions=react-server tsx tests/rag/mock-rag.test.mts
import assert from "node:assert/strict";
import {
  embedQuery,
  embedBatch,
  EMBEDDING_MODEL,
} from "../../src/lib/llm/embed";
import { search } from "../../src/lib/rag/retrieve";
import { indexEvidence } from "../../src/lib/rag/evidence-index";
import { NOT_FOUND } from "../../src/lib/rag/config";
import { EMBEDDING_DIM } from "../../src/lib/rag/embedding";
import type { RunLog } from "../../src/lib/llm/log";
import type { Hit } from "../../src/lib/rag/types";

process.env.OPENROUTER_API_KEY = "sk-or-test";

let pass = 0;
const ok = (c: boolean, m: string) => {
  assert.ok(c, m);
  console.log("ok  ", m);
  pass++;
};

type Call = { url: string; headers: Record<string, string>; body: any };
const calls: Call[] = [];
const embedReply =
  (dim = EMBEDDING_DIM) =>
  async (url: any, init: any) => {
    calls.push({
      url: String(url),
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: JSON.parse(init.body),
    });
    const inputs = ([] as any[]).concat(JSON.parse(init.body).input);
    return new Response(
      JSON.stringify({
        object: "list",
        model: EMBEDDING_MODEL,
        data: inputs.map((_: unknown, index: number) => ({
          object: "embedding",
          index,
          embedding: Array(dim).fill(0.01),
        })),
        usage: { prompt_tokens: 4, total_tokens: 4 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

const logs: RunLog[] = [];
const sink = async (r: RunLog) => {
  logs.push(r);
};

// 1. embedQuery: privacy routing, dimension, logging
(process.env as any).NODE_ENV = "production";
const vec = await embedQuery("data scientist responsibilities", {
  sink,
  fetch: embedReply() as any,
});
const c1 = calls[0];
ok(/embeddings/.test(c1.url), "calls the embeddings endpoint");
ok(
  c1.headers.authorization === "Bearer sk-or-test",
  "sends the key only in the Authorization header"
);
ok(
  c1.body.provider?.data_collection === "deny" &&
    c1.body.provider?.zdr === true,
  "embedding request carries privacy routing (deny + zdr)"
);
ok(
  vec.length === EMBEDDING_DIM,
  "returns a vector of the configured dimension"
);
ok(
  logs[0].status === "ok" &&
    logs[0].prompt_id === "embedding" &&
    logs[0].model_requested === EMBEDDING_MODEL,
  "writes one llm_runs row for the embedding call"
);
ok(logs[0].input_text === undefined, "production embedding log has no text");

// 2. wrong dimension is rejected and logged as an error
await assert.rejects(
  embedQuery("x", { sink, fetch: embedReply(1535) as any }),
  /Embedding size 1535 != 1536/
);
ok(
  logs[logs.length - 1].status === "error",
  "dimension mismatch logged as error"
);

// 3. embedBatch returns one vector per input (used by the backfill / indexer)
const many = await embedBatch(["a", "b", "c"], { fetch: embedReply() as any });
ok(
  many.length === 3 && many.every((v) => v.length === EMBEDDING_DIM),
  "embedBatch returns one correctly-sized vector per input"
);

// 4. missing key fails clearly
delete process.env.OPENROUTER_API_KEY;
await assert.rejects(
  embedQuery("x", { fetch: embedReply() as any }),
  /OPENROUTER_API_KEY is not set/
);
ok(true, "missing key fails with a clear message");
process.env.OPENROUTER_API_KEY = "sk-or-test";

// ---- retrieval flow (fake embed + fake supabase) ----
const fakeEmbed = async () => Array(EMBEDDING_DIM).fill(0.02);
const hit = (over: Partial<Hit> = {}): Hit => ({
  id: "onet:15-2051.00:tasks",
  source: "onet",
  ref_id: "15-2051.00",
  title: "Data Scientists",
  section: "tasks",
  content: "Build predictive models.",
  keyword_rank: 1,
  semantic_rank: 1,
  similarity: 0.7,
  score: 0.03,
  ...over,
});

// 5. search embeds, calls the right RPC, and grounds the result
let rpcSeen: { name: string; params: any } | null = null;
const okSupabase = {
  rpc: async (name: string, params: any) => {
    rpcSeen = { name, params };
    return { data: [hit()], error: null };
  },
};
const ref = await search("reference", "what do data scientists do", {
  supabase: okSupabase,
  embed: fakeEmbed,
});
ok(
  rpcSeen!.name === "reference_hybrid_search",
  "reference search calls reference_hybrid_search"
);
ok(
  typeof rpcSeen!.params.query_embedding === "string",
  "embedding is passed to the RPC as a JSON string"
);
ok(
  ref.found && ref.sources[0].id === "15-2051.00",
  "grounds and cites the hit"
);

// 6. empty query short-circuits to not-found without embedding
let embedCalled = false;
const out6 = await search("evidence", "   ", {
  supabase: { rpc: async () => ({ data: [], error: null }) },
  embed: async () => {
    embedCalled = true;
    return [];
  },
});
ok(
  !embedCalled && out6.context === NOT_FOUND.evidence,
  "blank query returns not-found, no embedding spent"
);

// 7. RPC error is surfaced
await assert.rejects(
  search("reference", "q", {
    supabase: { rpc: async () => ({ data: null, error: { message: "boom" } }) },
    embed: fakeEmbed,
  }),
  /reference_hybrid_search failed: boom/
);
ok(true, "RPC error is surfaced");

// 8. nothing relevant -> sentinel
const out8 = await search("reference", "q", {
  supabase: {
    rpc: async () => ({
      data: [hit({ keyword_rank: null, similarity: 0.1 })],
      error: null,
    }),
  },
  embed: fakeEmbed,
});
ok(
  out8.context === NOT_FOUND.reference,
  "no relevant hits -> reference sentinel"
);

// ---- evidence indexing (replace semantics) ----
// 9. indexEvidence deletes the source's old rows then inserts freshly embedded ones
const inserted: Record<string, unknown>[][] = [];
const deletes: unknown[] = [];
const res = await indexEvidence(
  "Paragraph one about leading a migration.\n\nParagraph two about mentoring.",
  {
    source_kind: "file",
    file_id: "11111111-1111-1111-1111-111111111111",
    title: "resume.pdf",
  },
  {
    userId: "user-1",
    deleteBySource: async (s) => {
      deletes.push(s);
      return { error: null };
    },
    insertChunks: async (rows) => {
      inserted.push(rows);
      return { error: null };
    },
    embed: async (texts) => texts.map(() => Array(EMBEDDING_DIM).fill(0.03)),
  }
);
ok(deletes.length === 1, "indexEvidence clears the source's old chunks first");
ok(
  res.indexed >= 1 && inserted[0].length === res.indexed,
  "inserts one row per chunk"
);
ok(
  inserted[0][0].user_id === "user-1" &&
    typeof inserted[0][0].embedding === "string" &&
    inserted[0][0].file_id === "11111111-1111-1111-1111-111111111111",
  "rows carry user_id, file_id, and a serialized embedding"
);

// 10. empty text deletes only (no insert)
const inserted2: unknown[] = [];
const res2 = await indexEvidence(
  "   ",
  {
    source_kind: "decision_record",
    decision_record_id: "22222222-2222-2222-2222-222222222222",
    title: "x",
  },
  {
    userId: "user-1",
    deleteBySource: async () => ({ error: null }),
    insertChunks: async (rows) => {
      inserted2.push(rows);
      return { error: null };
    },
    embed: async (texts) => texts.map(() => Array(EMBEDDING_DIM).fill(0)),
  }
);
ok(
  res2.indexed === 0 && inserted2.length === 0,
  "empty evidence text deletes only, inserts nothing"
);

console.log(`\n${pass} checks passed`);
