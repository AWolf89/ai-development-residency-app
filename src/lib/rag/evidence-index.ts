import "server-only";
import { createClient } from "@/lib/supabase/server";
import { embedBatch } from "@/lib/llm/embed";
import { chunkEvidence } from "./chunk";

// Per-user evidence indexer (Humble Object). Chunks one evidence source (an uploaded file's
// extracted text, or a decision record), embeds the chunks through the gateway, and replaces
// that source's rows in evidence_chunks under the caller's session (own-rows RLS). Ready to
// be called from the file-extraction / decision-record save flow; dependencies are injected
// so the replace logic is testable without a database or network.

export type EvidenceSource =
  | { source_kind: "file"; file_id: string; title: string }
  | {
      source_kind: "decision_record";
      decision_record_id: string;
      title: string;
    };

export type IndexDeps = {
  userId: string;
  // Minimal Supabase surface: delete this source's chunks, then insert the new ones.
  deleteBySource: (
    source: EvidenceSource
  ) => Promise<{ error: { message: string } | null }>;
  insertChunks: (
    rows: Record<string, unknown>[]
  ) => Promise<{ error: { message: string } | null }>;
  embed: (texts: string[]) => Promise<number[][]>;
};

export type IndexResult = { indexed: number };

/** Replace a single evidence source's chunks with freshly embedded ones. */
export async function indexEvidence(
  text: string,
  source: EvidenceSource,
  deps: IndexDeps
): Promise<IndexResult> {
  const chunks = chunkEvidence(text, source);

  // Replace semantics: clear the old rows first, so a shortened/emptied document doesn't
  // leave stale chunks behind.
  const del = await deps.deleteBySource(source);
  if (del.error)
    throw new Error(`evidence_chunks delete failed: ${del.error.message}`);

  if (chunks.length === 0) return { indexed: 0 };

  const embeddings = await deps.embed(chunks.map((c) => c.content));
  const rows = chunks.map((chunk, i) => ({
    user_id: deps.userId,
    source_kind: chunk.source_kind,
    file_id: chunk.file_id,
    decision_record_id: chunk.decision_record_id,
    title: chunk.title,
    chunk_index: chunk.chunk_index,
    content: chunk.content,
    content_hash: chunk.content_hash,
    embedding: JSON.stringify(embeddings[i]),
  }));
  const ins = await deps.insertChunks(rows);
  if (ins.error)
    throw new Error(`evidence_chunks insert failed: ${ins.error.message}`);
  return { indexed: rows.length };
}

/** Build production dependencies from the signed-in user's session. */
async function defaultDeps(): Promise<IndexDeps> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) throw new Error("indexEvidence requires a signed-in user.");
  return {
    userId,
    deleteBySource: async (source) => {
      const column =
        source.source_kind === "file" ? "file_id" : "decision_record_id";
      const value =
        source.source_kind === "file"
          ? source.file_id
          : source.decision_record_id;
      const { error } = await supabase
        .from("evidence_chunks")
        .delete()
        .eq(column, value);
      return { error };
    },
    insertChunks: async (rows) => {
      const { error } = await supabase.from("evidence_chunks").insert(rows);
      return { error };
    },
    embed: (texts) => embedBatch(texts),
  };
}

/** Convenience entry point used by server actions: indexes under the current user. */
export async function indexEvidenceForCurrentUser(
  text: string,
  source: EvidenceSource
): Promise<IndexResult> {
  return indexEvidence(text, source, await defaultDeps());
}
