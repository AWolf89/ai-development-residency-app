import "server-only";
import { createClient } from "@/lib/supabase/server";
import { retriever } from "@/lib/rag/retrieve";
import { runStructured } from "@/lib/llm/run";
import { supabaseSink } from "@/lib/llm/supabase-sink";
import { fileAnalysis } from "@/lib/llm/prompts/file-analysis";
import type { ReferenceItemRow } from "./candidates";
import {
  runAnalysisPass,
  type AnalysisDeps,
  type AnalysisModelFn,
  type AnalysisPassResult,
} from "./pass";
import { analysisOutputSchema } from "./types";

// The File Analysis boundary (Humble Object). It wires the real reference retriever, a
// reference_items lookup, and the model gateway (runStructured + supabaseSink — one model path,
// ADR-0009) into the pure pass logic (pass.ts). Dependencies are injected there so the whole
// flow is tested with fakes — no network, no database.

/** The one model call per pass, delegated to the gateway's structured-output pipeline. */
const runModel: AnalysisModelFn = async ({
  fileText,
  candidates,
  priorAnswers,
}) => {
  const { data, attempts, truncated } = await runStructured({
    prompt: fileAnalysis,
    input: {
      fileText,
      candidates: candidates.map((c) => ({
        id: c.id,
        name: c.name,
        entityType: c.entityType,
        description: c.description,
      })),
      priorAnswers,
    },
    schema: analysisOutputSchema,
    sink: supabaseSink,
  });
  return { output: data, attempts, truncated };
};

/** Production dependencies: the signed-in user's retriever + a reference_items lookup + the model. */
export function defaultDeps(): AnalysisDeps {
  return {
    retrieveReference: (q) => retriever.retrieveReference(q),
    lookupReferenceItems: async (keys) => {
      const supabase = await createClient();
      const externalIds = [...new Set(keys.map((k) => k.external_id))];
      const sources = [...new Set(keys.map((k) => k.source))];
      const { data, error } = await supabase
        .from("reference_items")
        .select("id, source, entity_type, external_id, name, description")
        .in("external_id", externalIds)
        .in("source", sources);
      if (error) {
        throw new Error(`reference_items lookup failed: ${error.message}`);
      }
      return (data ?? []) as ReferenceItemRow[];
    },
    runModel,
  };
}

/** Analyze one file's text under the current user's session (production entry point). */
export function analyzeFileText(
  fileText: string,
  priorAnswers?: { question: string; answer: string }[]
): Promise<AnalysisPassResult> {
  return runAnalysisPass(fileText, priorAnswers, defaultDeps());
}
