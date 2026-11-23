import "server-only";
import { createClient } from "@/lib/supabase/server";
import { runStructured } from "@/lib/llm/run";
import { supabaseSink } from "@/lib/llm/supabase-sink";
import { reconciliation } from "@/lib/llm/prompts/reconciliation";
import { retrieveEvidence } from "@/lib/rag/retrieve";
import { resolveFileText } from "../orchestrator";
import { groundReconciliation } from "./compare";
import { persistReconciliationFlags } from "./persist";
import { createSupabaseReconciliationFlagRepository } from "./repository";
import { reconciliationOutputSchema } from "./types";
import type { ReconciliationFlag } from "./types";

// The reconciliation orchestrator (Humble Object, ADR-0023). It performs the IO around the pure
// pieces: resolve the new file's text, retrieve the user's EXISTING evidence (RLS-scoped,
// security-invoker — AC5), run ONE grounded comparison through the model gateway (runStructured +
// supabaseSink — one model path, ADR-0009), and ground the result. It never writes at ingest;
// flags are persisted only on an explicit user decision (HITL, ADR-0013).

// How much of the new file to use as the retrieval query (enough to find related evidence).
const QUERY_CHARS = 2000;

export type FileReconciliation = {
  flags: ReconciliationFlag[];
  /** How many model flags were dropped as ungrounded (cited no retrieved existing source). */
  dropped: number;
};

/**
 * Compare a new file against the user's existing evidence and return grounded conflict +
 * complementary flags (all `pending`). Returns no flags when the file has no text or the user has
 * no other evidence to compare against. Never writes.
 */
export async function reconcileFile(
  fileId: string
): Promise<FileReconciliation> {
  const { fileName, text } = await resolveFileText(fileId);
  if (text.trim().length === 0) {
    return { flags: [], dropped: 0 };
  }

  const retrieval = await retrieveEvidence(text.slice(0, QUERY_CHARS));
  // Exclude the file itself (if it was already indexed) so it can't conflict with itself. Evidence
  // citations are keyed by title, so a file source matches on its name.
  const existingSources = retrieval.sources.filter(
    (s) => !(s.source === "file" && (s.id === fileName || s.title === fileName))
  );
  if (!retrieval.found || existingSources.length === 0) {
    return { flags: [], dropped: 0 };
  }

  const { data } = await runStructured({
    prompt: reconciliation,
    input: {
      newText: text,
      existingContext: retrieval.context,
      existingSources,
    },
    schema: reconciliationOutputSchema,
    sink: supabaseSink,
  });

  return groundReconciliation(data, existingSources);
}

/**
 * Persist the reconciliation flags the user decided on (the HITL save). Reached only from the
 * explicit save action; delegates to the tested, DI-driven `persistReconciliationFlags`.
 */
export async function saveReconciliationDecisions(params: {
  fileId: string;
  flags: ReconciliationFlag[];
}): Promise<{ savedIds: string[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    throw new Error("Saving reconciliation requires a signed-in user.");

  const repo = createSupabaseReconciliationFlagRepository(supabase);
  return persistReconciliationFlags(repo, {
    userId: user.id,
    fileId: params.fileId,
    flags: params.flags,
  });
}
