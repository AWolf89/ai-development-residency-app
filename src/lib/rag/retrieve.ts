import "server-only";
import { createClient } from "@/lib/supabase/server";
import { embedQuery } from "@/lib/llm/embed";
import { supabaseSink } from "@/lib/llm/supabase-sink";
import { buildContext } from "./context";
import { RAG_CONFIG, type Corpus } from "./config";
import type { Hit, Retrieval } from "./types";

// The retrieval boundary (Humble Object). It embeds the query through the gateway and calls
// the matching hybrid_search RPC, then hands the raw hits to the pure buildContext() for the
// grounding/citation decision. Dependencies are injected (Dependency Inversion) so the flow
// is unit-tested with a fake Supabase and a fake embedder — no network, no database.

/** Just the Supabase surface this module uses, so tests can supply a tiny fake. */
export type RpcClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type SearchDeps = {
  supabase: RpcClient;
  embed: (text: string) => Promise<number[]>;
};

/** The retrieval capability other features (e.g. Gap Classification) depend on. */
export interface Retriever {
  retrieveReference(question: string): Promise<Retrieval>;
  retrieveEvidence(question: string): Promise<Retrieval>;
}

const RPC_FOR: Record<Corpus, string> = {
  reference: "reference_hybrid_search",
  evidence: "evidence_hybrid_search",
};

export async function search(
  corpus: Corpus,
  question: string,
  deps: SearchDeps
): Promise<Retrieval> {
  const trimmed = question.trim();
  if (!trimmed) {
    return buildContext([], { corpus }); // empty query → not found, no embedding spent
  }
  const embedding = await deps.embed(trimmed);
  const { data, error } = await deps.supabase.rpc(RPC_FOR[corpus], {
    query_text: trimmed,
    query_embedding: JSON.stringify(embedding),
    match_count: RAG_CONFIG.matchCount,
    full_text_weight: RAG_CONFIG.fullTextWeight,
    semantic_weight: RAG_CONFIG.semanticWeight,
    rrf_k: RAG_CONFIG.rrfK,
  });
  if (error) throw new Error(`${RPC_FOR[corpus]} failed: ${error.message}`);
  return buildContext((data ?? []) as Hit[], { corpus });
}

/** Build the production dependencies: the signed-in user's Supabase client + gateway embed. */
async function defaultDeps(): Promise<SearchDeps> {
  const supabase = await createClient();
  return {
    supabase: supabase as unknown as RpcClient,
    embed: (text) => embedQuery(text, { sink: supabaseSink }),
  };
}

export async function retrieveReference(
  question: string,
  deps?: SearchDeps
): Promise<Retrieval> {
  return search("reference", question, deps ?? (await defaultDeps()));
}

export async function retrieveEvidence(
  question: string,
  deps?: SearchDeps
): Promise<Retrieval> {
  // Runs under the caller's session, so evidence_hybrid_search (security invoker) returns
  // only this user's own rows.
  return search("evidence", question, deps ?? (await defaultDeps()));
}

export const retriever: Retriever = {
  retrieveReference: (q) => retrieveReference(q),
  retrieveEvidence: (q) => retrieveEvidence(q),
};
