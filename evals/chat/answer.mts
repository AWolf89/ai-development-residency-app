// Answers one question with the REAL app code (closed-RAG retrieval + llm-integration's runLLM
// + the current career-chat prompt) and prints JSON. Called by provider.mjs per test case.
// Run with NODE_OPTIONS=--conditions=react-server (provider.mjs sets this).
//
// Adapted from the ai-evals skill's chat starter for THIS repo:
//  - our retrieval export is `search("reference", ...)` (not `retrieveOnet`), with deps injected
//    (Dependency Inversion in src/lib/rag/retrieve.ts), so the eval builds its own client instead
//    of the request-scoped `createClient` the app uses behind a signed-in session.
//  - `reference_hybrid_search` is granted to `authenticated`, so the eval uses the SERVICE_ROLE
//    key (bypasses RLS) to read the shared, read-only reference corpus. No per-user data is read.
//  - sources are cited by `id` (the SOC code / framework slug), matching rag/types Citation.
import { createClient } from "@supabase/supabase-js";
import { search, type RpcClient } from "../../src/lib/rag/retrieve";
import { runLLM } from "../../src/lib/llm/run";
import { embedQuery } from "../../src/lib/llm/embed";
import { careerChat } from "../../src/lib/llm/prompts/career-chat";

const question = process.argv[2] ?? "";
const started = Date.now();
let cost = 0;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error(
    "evals need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role reads the shared reference corpus; it is never a per-user key). See docs/evals/README.md."
  );
}

// Service-role client, no session persistence: reads only the shared read-only reference_chunks.
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
}) as unknown as RpcClient;

const retrieval = await search("reference", question, {
  supabase,
  embed: (text) => embedQuery(text), // no sink: evals never write to llm_runs
});

const { text } = await runLLM({
  prompt: careerChat,
  input: { question, context: retrieval.context },
  sink: async (row) => {
    cost += row.cost_usd ?? 0;
  },
});

process.stdout.write(
  JSON.stringify({
    answer: text,
    context: retrieval.context,
    found: retrieval.found,
    sources: retrieval.sources.map((s) => s.id),
    prompt_version: careerChat.version,
    cost_usd: cost,
    latency_ms: Date.now() - started,
  })
);
